/**
 * SBI 8.0P.167.35 / P2H.2-G.1
 * Journal admin global.
 *
 * Lecture ponctuelle et paginée de accountAuditLogs.
 * Pas d'écoute temps réel, pas de recalcul DOM permanent.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const PAGE_SIZE = 60;
const MAX_DETAIL_LENGTH = 220;
const PROFILE_RETURN_TARGET = 'view-audit-log';

let currentUser = null;
let currentProfile = null;
let logs = [];
let lastVisibleDoc = null;
let hasMore = true;
let isLoading = false;
let hasLoadedOnce = false;
let isMounted = false;

const TYPE_META = {
  'account.created': { label: 'Compte créé', color: '#2A57FF', tone: 'blue' },
  'account.password_reset_sent': { label: 'Reset mot de passe envoyé', color: '#fbbc04', tone: 'yellow' },
  'account.public_password_reset_requested': { label: 'Mot de passe oublié demandé', color: '#fbbc04', tone: 'yellow' },
  'account.finalization_invite_sent': { label: 'Invitation finalisation envoyée', color: '#2A57FF', tone: 'blue' },
  'account.finalization_reminder_sent': { label: 'Relance automatique envoyée', color: '#fbbc04', tone: 'yellow' },
  'account.finalization_reminder_skipped': { label: 'Relance non envoyée', color: '#ff4a4a', tone: 'red' },
  'account.finalization_escalation_required': { label: 'Contact direct requis', color: '#ff4a4a', tone: 'red' },
  'account.finalization_escalation_resolved': { label: 'Contact direct traité', color: '#2ed573', tone: 'green' },
  'account.email_bounced': { label: 'Email rejeté Brevo', color: '#ff4a4a', tone: 'red' },
  'account.email_bounce_unmatched': { label: 'Bounce Brevo sans compte', color: '#fbbc04', tone: 'yellow' },
  'account.email_changed': { label: 'Email modifié', color: '#2A57FF', tone: 'blue' },
  'account.self_email_changed': { label: 'Email personnel modifié', color: '#2A57FF', tone: 'blue' },
  'account.updated': { label: 'Compte mis à jour', color: '#2A57FF', tone: 'blue' },
  'account.followup_updated': { label: 'Suivi compte mis à jour', color: '#2A57FF', tone: 'blue' },
  'account.god_updated': { label: 'Droits suprêmes modifiés', color: '#ff4a4a', tone: 'red' },
  'account.deleted': { label: 'Compte supprimé', color: '#ff4a4a', tone: 'red' },
  'account.login_tracked': { label: 'Connexion détectée', color: '#2ed573', tone: 'green' },
  'account.formation_indexes_synced': { label: 'Accès formations synchronisés', color: '#2A57FF', tone: 'blue' }
};

function isAdminLike(profile) {
  return profile?.isGod === true || profile?.role === 'admin';
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function formatDate(value, fallback = 'Date inconnue') {
  const ms = toMillis(value);
  if (!ms) return fallback;

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms));
  } catch (_) {
    return fallback;
  }
}

function getTypeMeta(type = '') {
  return TYPE_META[type] || {
    label: type ? type.replace(/^account\./, '').replace(/_/g, ' ') : 'Action compte',
    color: '#8a93a6',
    tone: 'muted'
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(value = '', maxLength = MAX_DETAIL_LENGTH) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function getActorLabel(log = {}) {
  if (log.actorEmail) return log.actorEmail;
  if (log.actorUid === 'public') return 'Page publique';
  if (log.actorUid === 'system' || log.source === 'brevo') return 'Système SBI';
  if (log.actorUid) return `UID ${log.actorUid}`;
  return log.source === 'scheduled-function' ? 'Automatisation SBI' : 'Système SBI';
}

function getTargetLabel(log = {}) {
  if (log.targetEmail) return log.targetEmail;
  if (log.email) return log.email;
  if (log.newEmail) return log.newEmail;
  if (log.targetUid) return `UID ${log.targetUid}`;
  return 'Compte non identifié';
}

function getFriendlyBounceDetail(message = '') {
  const raw = String(message || '').toLowerCase();

  if (raw.includes('does not exist') || raw.includes('user unknown') || raw.includes('recipient address rejected') || raw.includes('550-5.1.1')) {
    return 'Adresse inexistante ou inaccessible.';
  }

  if (raw.includes('mailbox full') || raw.includes('quota')) {
    return 'Boîte mail pleine ou temporairement indisponible.';
  }

  if (raw.includes('blocked') || raw.includes('spam') || raw.includes('complaint')) {
    return 'Adresse bloquée ou refusée.';
  }

  return 'Adresse rejetée par le serveur email.';
}

function getLogDetails(log = {}) {
  const details = [];

  if (log.type === 'account.created') details.push('Création du compte et invitation envoyée si email valide.');
  if (log.type === 'account.password_reset_sent') details.push('Lien de reset envoyé.');
  if (log.type === 'account.public_password_reset_requested') details.push('Demande depuis la page publique.');
  if (log.type === 'account.finalization_invite_sent') details.push('Email de finalisation envoyé.');
  if (log.type === 'account.finalization_reminder_sent') details.push('Relance automatique envoyée.');
  if (log.type === 'account.finalization_reminder_skipped' && log.reason === 'invalid-email') details.push('Email invalide ou manquant.');
  if (log.type === 'account.finalization_escalation_required') details.push('Alerte générée après 3 relances.');
  if (log.type === 'account.finalization_escalation_resolved') details.push(log.note ? `Note : ${log.note}` : 'Contact direct marqué traité.');
  if (log.type === 'account.email_bounced') details.push(getFriendlyBounceDetail(log.reason || log.message || ''));
  if (log.type === 'account.email_bounce_unmatched') details.push('Aucun compte trouvé pour cet email.');
  if (log.event) details.push(`Événement : ${log.event}`);
  if (log.emailSent === true) details.push('Email envoyé.');
  if (log.emailSent === false) details.push('Email non envoyé.');
  if (log.page) details.push(`Page : ${log.page}`);
  if (log.targetRole) details.push(`Rôle : ${log.targetRole}`);
  if (log.updated !== undefined) details.push(`${log.updated} élément(s) mis à jour.`);
  if (log.skipped !== undefined) details.push(`${log.skipped} élément(s) inchangé(s).`);

  const changes = log.changes || {};
  if (changes.preparationState?.afterLabel) details.push(`Suivi : ${changes.preparationState.afterLabel}`);
  if (changes.accountNote) details.push('Note interne modifiée.');
  if (changes.email || log.previousEmail || log.newEmail) {
    details.push(`Email : ${log.previousEmail || changes.email?.before || 'ancien'} → ${log.newEmail || changes.email?.after || 'nouveau'}`);
  }

  if ((log.reason || log.message) && log.type !== 'account.email_bounced') {
    details.push(`Détail : ${truncate(log.reason || log.message, 140)}`);
  }

  return details.join(' · ');
}

function getFilteredLogs() {
  const searchTerm = document.getElementById('audit-search')?.value?.trim().toLowerCase() || '';
  const typeFilter = document.getElementById('audit-type-filter')?.value || 'all';

  return logs.filter((log) => {
    const meta = getTypeMeta(log.type);
    const haystack = [
      log.type,
      meta.label,
      getActorLabel(log),
      getTargetLabel(log),
      getLogDetails(log),
      log.reason,
      log.message,
      log.event,
      log.source
    ].join(' ').toLowerCase();

    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    return matchesType && matchesSearch;
  });
}

function summarizeLoadedLogs() {
  const bounceCount = logs.filter((log) => log.type === 'account.email_bounced').length;
  const escalationCount = logs.filter((log) => log.type === 'account.finalization_escalation_required').length;
  const resolvedCount = logs.filter((log) => log.type === 'account.finalization_escalation_resolved').length;
  const createdCount = logs.filter((log) => log.type === 'account.created').length;

  const stats = document.getElementById('audit-stats');
  if (!stats) return;

  stats.innerHTML = `
    ${renderStatCard('Logs chargés', logs.length)}
    ${renderStatCard('Comptes créés', createdCount)}
    ${renderStatCard('Contacts requis', escalationCount)}
    ${renderStatCard('Emails rejetés', bounceCount)}
    ${renderStatCard('Contacts traités', resolvedCount)}
  `;
}

function renderStatCard(label, value) {
  return `
    <div class="sbi-audit-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function canOpenProfileFromLog(log = {}) {
  if (!log.targetUid) return false;

  /*
   * Les logs de suppression gardent parfois l'ancien UID.
   * On n'ouvre pas une fiche qui n'existe plus : cela donnait un profil vide.
   */
  return log.type !== 'account.deleted';
}

function openAuditProfile(uid) {
  if (!uid) return;

  const href = `/admin/admin-profile.html?id=${encodeURIComponent(uid)}`;

  sessionStorage.setItem('sbiAdminReturnTarget', PROFILE_RETURN_TARGET);
  sessionStorage.setItem('sbiAdminReturnFromProfile', String(Date.now()));

  /*
   * Navigation volontairement classique.
   * Le profil admin a besoin de son bootstrap complet, donc on évite
   * l'interception PJAX/data-sbi-href depuis la vue Journal.
   */
  window.location.assign(href);
}

function getProfileActionMarkup(log = {}) {
  if (canOpenProfileFromLog(log)) {
    return `<button type="button" class="sbi-audit-profile-btn" data-audit-profile-uid="${escapeHtml(log.targetUid)}">Profil</button>`;
  }

  if (log.targetUid && log.type === 'account.deleted') {
    return '<span>Supprimé</span>';
  }

  return '<span>Sans profil</span>';
}

function bindAuditProfileButtons() {
  const list = document.getElementById('audit-log-list');
  if (!list || list.dataset.sbiAuditProfileBound === 'true') return;

  list.dataset.sbiAuditProfileBound = 'true';
  list.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-audit-profile-uid]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    openAuditProfile(button.getAttribute('data-audit-profile-uid'));
  }, true);
}

function renderLogItem(log = {}) {
  const meta = getTypeMeta(log.type);
  const actor = getActorLabel(log);
  const target = getTargetLabel(log);
  const details = getLogDetails(log);

  return `
    <article class="sbi-audit-item" style="--audit-color:${meta.color};">
      <div class="sbi-audit-item-main">
        <div class="sbi-audit-item-head">
          <strong>${escapeHtml(meta.label)}</strong>
          <span>${escapeHtml(formatDate(log.createdAt))}</span>
        </div>
        <div class="sbi-audit-item-meta">
          <span>Acteur : ${escapeHtml(actor)}</span>
          <span>Cible : ${escapeHtml(target)}</span>
        </div>
        ${details ? `<p>${escapeHtml(truncate(details))}</p>` : ''}
      </div>
      <div class="sbi-audit-item-actions">
        ${getProfileActionMarkup(log)}
      </div>
    </article>
  `;
}

function render() {
  const list = document.getElementById('audit-log-list');
  const count = document.getElementById('audit-log-count');
  const loadMore = document.getElementById('audit-load-more-btn');
  if (!list) return;

  summarizeLoadedLogs();

  const filtered = getFilteredLogs();

  if (isLoading && logs.length === 0) {
    list.innerHTML = '<div class="sbi-audit-empty">Chargement du journal admin...</div>';
  } else if (!isAdminLike(currentProfile)) {
    list.innerHTML = '<div class="sbi-audit-empty sbi-audit-error">Accès réservé aux administrateurs.</div>';
  } else if (filtered.length === 0) {
    list.innerHTML = `<div class="sbi-audit-empty">${logs.length ? 'Aucun log ne correspond aux filtres.' : 'Aucune entrée de journal disponible.'}</div>`;
  } else {
    list.innerHTML = filtered.map(renderLogItem).join('');
  }

  if (count) {
    const filteredSuffix = filtered.length !== logs.length ? ` · ${filtered.length} affichée${filtered.length > 1 ? 's' : ''}` : '';
    count.textContent = `${logs.length} entrée${logs.length > 1 ? 's' : ''} chargée${logs.length > 1 ? 's' : ''}${filteredSuffix}`;
  }

  if (loadMore) {
    loadMore.disabled = isLoading || !hasMore || !isAdminLike(currentProfile);
    loadMore.textContent = isLoading ? 'Chargement...' : hasMore ? 'Charger plus' : 'Fin du journal chargé';
  }
}

async function loadAuditLogs({ reset = false } = {}) {
  if (isLoading || !isAdminLike(currentProfile)) return;

  isLoading = true;
  render();

  if (reset) {
    logs = [];
    lastVisibleDoc = null;
    hasMore = true;
  }

  try {
    const clauses = [collection(db, 'accountAuditLogs'), orderBy('createdAt', 'desc')];
    if (lastVisibleDoc) clauses.push(startAfter(lastVisibleDoc));
    clauses.push(limit(PAGE_SIZE));

    const snap = await getDocs(query(...clauses));
    const nextLogs = [];

    snap.forEach((docSnap) => {
      nextLogs.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });

    lastVisibleDoc = snap.docs[snap.docs.length - 1] || lastVisibleDoc;
    hasMore = snap.size === PAGE_SIZE;
    logs = reset ? nextLogs : [...logs, ...nextLogs];
    hasLoadedOnce = true;
  } catch (error) {
    console.warn('[SBI Audit] Journal global indisponible :', error);
    const list = document.getElementById('audit-log-list');
    if (list) {
      list.innerHTML = '<div class="sbi-audit-empty sbi-audit-error">Journal global indisponible pour le moment.</div>';
    }
  } finally {
    isLoading = false;
    render();
  }
}

async function loadCurrentProfile(user) {
  if (!user) {
    currentProfile = null;
    currentUser = null;
    logs = [];
    render();
    return;
  }

  currentUser = user;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    currentProfile = snap.exists() ? snap.data() : null;
  } catch (error) {
    currentProfile = null;
    console.warn('[SBI Audit] Profil admin indisponible :', error);
  }

  render();

  if (isAdminLike(currentProfile) && isAuditViewActive() && !hasLoadedOnce) {
    loadAuditLogs({ reset: true });
  }
}

function isAuditViewActive() {
  return document.getElementById('view-audit-log')?.classList.contains('active')
    || sessionStorage.getItem('activeAdminTab') === 'view-audit-log'
    || new URLSearchParams(window.location.search).get('tab') === 'view-audit-log';
}

function mount() {
  if (isMounted) return;
  if (!document.getElementById('view-audit-log')) return;

  isMounted = true;

  document.getElementById('audit-refresh-btn')?.addEventListener('click', () => loadAuditLogs({ reset: true }));
  document.getElementById('audit-load-more-btn')?.addEventListener('click', () => loadAuditLogs());
  document.getElementById('audit-search')?.addEventListener('input', render);
  document.getElementById('audit-type-filter')?.addEventListener('change', render);
  bindAuditProfileButtons();

  window.addEventListener('sbi:admin-tab-changed', (event) => {
    if (event?.detail?.tab === 'view-audit-log' && isAdminLike(currentProfile) && !hasLoadedOnce) {
      loadAuditLogs({ reset: true });
    }
  });

  onAuthStateChanged(auth, loadCurrentProfile);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
