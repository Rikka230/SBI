/**
 * SBI 8.0P.167.77 / P2I.4-AUDIT-REMOTE-SEARCH
 * Journal admin global.
 *
 * Principe important :
 * - AUCUN chargement Firestore automatique.
 * - Le journal affiche le cache local immédiatement.
 * - Firestore ne charge que sur action utilisateur : Rafraîchir, Charger plus ou Recherche globale ciblée.
 * - Page size volontairement petite pour ne pas faire ramer index.html.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';

const PAGE_SIZE = 12;
const REMOTE_SEARCH_LIMIT = 30;
const MAX_REMOTE_SEARCH_QUERIES = 12;
const MAX_DETAIL_LENGTH = 220;
const MAX_RENDERED_ITEMS = 80;
const MAX_CACHE_ITEMS = 500;
const CACHE_KEY = 'sbiAdminAuditLogCacheV2';
const CACHE_META_KEY = 'sbiAdminAuditLogCacheMetaV2';

let currentProfile = null;
let logs = [];
let lastVisibleDoc = null;
let hasMore = true;
let isLoading = false;
let isRemoteSearching = false;
let remoteSearchStatus = '';
let lastRemoteSearchKey = '';
let hasLoadedFromCache = false;
let isMounted = false;
let unsubscribeAuth = null;

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
  'account.promotion_updated': { label: 'Promotion élève modifiée', color: '#2A57FF', tone: 'blue' },
  'account.god_updated': { label: 'Droits suprêmes modifiés', color: '#ff4a4a', tone: 'red' },
  'account.deleted': { label: 'Compte supprimé', color: '#ff4a4a', tone: 'red' },
  'account.login_tracked': { label: 'Connexion détectée', color: '#2ed573', tone: 'green' },
  'account.first_login_onboarding_completed': { label: 'Première connexion validée', color: '#2ed573', tone: 'green' },
  'account.formation_indexes_synced': { label: 'Accès formations synchronisés', color: '#2A57FF', tone: 'blue' },
  'student_documents.requested': { label: 'Documents demandés', color: '#7c5cff', tone: 'purple' },
  'student_documents.submitted': { label: 'Documents transmis', color: '#2A57FF', tone: 'blue' },
  'student_documents.validated': { label: 'Documents validés', color: '#2ed573', tone: 'green' },
  'student_documents.partial_review': { label: 'Documents à refaire', color: '#fbbc04', tone: 'yellow' },
  'student_documents.request_canceled': { label: 'Demande documents annulée', color: '#ff4a4a', tone: 'red' },
  'student_documents.document_uploaded_admin': { label: 'Document ajouté par admin', color: '#2A57FF', tone: 'blue' },
  'student_documents.document_archived': { label: 'Document archivé', color: '#fbbc04', tone: 'yellow' },
  'student_documents.document_deleted': { label: 'Document supprimé', color: '#ff4a4a', tone: 'red' },
  'course.validation_submitted': { label: 'Cours soumis', color: '#fbbc04', tone: 'yellow' },
  'course.published': { label: 'Cours mis en ligne', color: '#2ed573', tone: 'green' },
  'course.rejected': { label: 'Cours refusé', color: '#ff4a4a', tone: 'red' }
};

function scheduleIdle(callback) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 800 });
    return;
  }
  window.setTimeout(callback, 0);
}

function isAdminLike(profile) {
  return isSbiAdminLike(profile);
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

function serializeDate(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : '';
}

function normalizeLog(log = {}) {
  return {
    ...log,
    createdAt: serializeDate(log.createdAt)
  };
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

function normalizeSearchValue(value = '') {
  return String(value || '').trim().toLowerCase();
}

function compactUniqueStrings(values = []) {
  const seen = new Set();
  const next = [];

  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    next.push(text);
  });

  return next;
}

function formatSmallList(values = [], fallback = 'Aucun détail') {
  const list = compactUniqueStrings(values).slice(0, 6);
  if (!list.length) return fallback;
  const suffix = compactUniqueStrings(values).length > list.length ? ` +${compactUniqueStrings(values).length - list.length}` : '';
  return `${list.join(', ')}${suffix}`;
}

function getDocumentChanges(log = {}) {
  return log.changes?.documents && typeof log.changes.documents === 'object'
    ? log.changes.documents
    : {};
}

function getSafeJsonText(value) {
  try {
    return JSON.stringify(value || {});
  } catch (_) {
    return '';
  }
}

function getLogSearchHaystack(log = {}) {
  const meta = getTypeMeta(log.type);
  const documents = getDocumentChanges(log);

  return [
    log.id,
    log.type,
    meta.label,
    getActorLabel(log),
    getTargetLabel(log),
    getLogDetails(log),
    log.actorUid,
    log.actorEmail,
    log.targetUid,
    log.targetEmail,
    log.uid,
    log.userUid,
    log.accountUid,
    log.targetUserId,
    log.reason,
    log.message,
    log.event,
    log.source,
    log.courseId,
    log.courseTitle,
    log.warning,
    documents.requestId,
    documents.documentId,
    documents.title,
    documents.fileName,
    getSafeJsonText(documents)
  ].join(' ').toLowerCase();
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

function getTargetEmailCandidate(log = {}) {
  return [
    log.targetEmail,
    log.email,
    log.newEmail,
    log.previousEmail,
    log.recipientEmail,
    log.to
  ].find((value) => typeof value === 'string' && value.includes('@')) || '';
}

function getTargetUidCandidates(log = {}) {
  return [
    log.targetUid,
    log.uid,
    log.userUid,
    log.accountUid,
    log.targetUserId
  ].filter((value, index, array) => typeof value === 'string' && value.trim() && array.indexOf(value) === index);
}

function canTryOpenProfileFromLog(log = {}) {
  if (log.type === 'account.deleted') return false;
  return getTargetUidCandidates(log).length > 0 || Boolean(getTargetEmailCandidate(log));
}

async function resolveProfileUidForLog(log = {}) {
  const uidCandidates = getTargetUidCandidates(log);
  if (uidCandidates[0]) return uidCandidates[0];

  const email = getTargetEmailCandidate(log).trim().toLowerCase();
  if (!email) return '';

  try {
    const emailQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const snap = await getDocs(emailQuery);
    if (!snap.empty) return snap.docs[0].id;
  } catch (error) {
    console.warn('[SBI Audit] Résolution profil par email impossible :', email, error);
  }

  return '';
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
  if (log.type === 'account.first_login_onboarding_completed') details.push('Cases obligatoires validées.');

  const documentChanges = getDocumentChanges(log);
  if (log.type === 'student_documents.requested') {
    details.push(`Demande envoyée : ${formatSmallList(documentChanges.requested, 'Documents demandés')}`);
    if (documentChanges.count !== undefined) details.push(`${documentChanges.count} document(s) demandé(s)`);
  }
  if (log.type === 'student_documents.submitted') {
    details.push(`Documents transmis : ${formatSmallList(documentChanges.submitted, 'Documents transmis')}`);
    if (documentChanges.submittedCount !== undefined) details.push(`${documentChanges.submittedCount}/${documentChanges.requestedCount || '?'} transmis`);
  }
  if (log.type === 'student_documents.validated') {
    details.push(`Validés : ${formatSmallList(documentChanges.validated, 'Documents validés')}`);
    if (documentChanges.validatedCount !== undefined) details.push(`${documentChanges.validatedCount}/${documentChanges.requestedCount || '?'} validé(s)`);
  }
  if (log.type === 'student_documents.partial_review') {
    details.push(`Validés : ${formatSmallList(documentChanges.validated, 'Aucun validé')}`);
    details.push(`À refaire : ${formatSmallList(documentChanges.rejected, 'Aucun refusé')}`);
  }
  if (log.type === 'student_documents.request_canceled') details.push('Demande de documents annulée.');
  if (log.type === 'student_documents.document_uploaded_admin') details.push(`Document ajouté : ${documentChanges.title || documentChanges.fileName || 'Document non nommé'}`);
  if (log.type === 'student_documents.document_archived') details.push(`Document archivé : ${documentChanges.title || documentChanges.fileName || 'Document non nommé'}`);
  if (log.type === 'student_documents.document_deleted') details.push(`Document supprimé : ${documentChanges.title || documentChanges.fileName || 'Document non nommé'}`);
  if (documentChanges.requestId) details.push(`Demande : ${documentChanges.requestId}`);
  if (documentChanges.documentId) details.push(`Document : ${documentChanges.documentId}`);

  if (String(log.type || '').startsWith('course.')) {
    details.push(`Cours : ${log.courseTitle || log.courseId || 'Non renseigné'}`);
    if (log.courseId) details.push(`ID : ${log.courseId}`);
    if (log.contactEmailSent === true) details.push('Email contact envoyé.');
    if (log.teacherNotificationSent === true) details.push('Notification professeur envoyée.');
    if (log.studentNotificationCount !== undefined) details.push(`${log.studentNotificationCount} notification(s) élève.`);
    if (log.studentEmailCount !== undefined) details.push(`${log.studentEmailCount} email(s) élève.`);
    if (Array.isArray(log.replacementPromotionIds) && log.replacementPromotionIds.length) {
      details.push(`Promotions : ${formatSmallList(log.replacementPromotionIds, 'Aucune promotion')}`);
    }
  }

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
  if (changes.promotion) {
    const beforePromotion = changes.promotion.before?.name || 'Aucune promotion';
    const afterPromotion = changes.promotion.after?.name || 'Aucune promotion';
    details.push(`Promotion : ${beforePromotion} → ${afterPromotion}`);
  }
  if (changes.email || log.previousEmail || log.newEmail) {
    details.push(`Email : ${log.previousEmail || changes.email?.before || 'ancien'} → ${log.newEmail || changes.email?.after || 'nouveau'}`);
  }

  if ((log.reason || log.message) && log.type !== 'account.email_bounced') {
    details.push(`Détail : ${truncate(log.reason || log.message, 140)}`);
  }

  return details.join(' · ');
}

function saveCache() {
  scheduleIdle(() => {
    try {
      const limited = logs.slice(0, MAX_CACHE_ITEMS).map(normalizeLog);
      localStorage.setItem(CACHE_KEY, JSON.stringify(limited));
      localStorage.setItem(CACHE_META_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        count: limited.length
      }));
    } catch (error) {
      console.warn('[SBI Audit] Cache journal non sauvegardé :', error);
    }
  });
}

function loadCache() {
  if (hasLoadedFromCache) return;
  hasLoadedFromCache = true;

  scheduleIdle(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        render();
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        logs = parsed.slice(0, MAX_CACHE_ITEMS);
      }
    } catch (error) {
      console.warn('[SBI Audit] Cache journal ignoré :', error);
      logs = [];
    }

    render();
  });
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_META_KEY);
  } catch (_) {
    // ignore
  }
}

function getAuditSearchTerm() {
  return normalizeSearchValue(document.getElementById('audit-search')?.value || '');
}

function getAuditTypeFilter() {
  return document.getElementById('audit-type-filter')?.value || 'all';
}

function getFilteredLogs() {
  const searchTerm = getAuditSearchTerm();
  const typeFilter = getAuditTypeFilter();

  return logs.filter((log) => {
    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesSearch = !searchTerm || getLogSearchHaystack(log).includes(searchTerm);
    return matchesType && matchesSearch;
  });
}

function renderStatCard(label, value) {
  return `
    <div class="sbi-audit-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function summarizeLoadedLogs() {
  const bounceCount = logs.filter((log) => log.type === 'account.email_bounced').length;
  const escalationCount = logs.filter((log) => log.type === 'account.finalization_escalation_required').length;
  const resolvedCount = logs.filter((log) => log.type === 'account.finalization_escalation_resolved').length;
  const createdCount = logs.filter((log) => log.type === 'account.created').length;

  const stats = document.getElementById('audit-stats');
  if (!stats) return;

  stats.innerHTML = `
    ${renderStatCard('Logs en cache', logs.length)}
    ${renderStatCard('Comptes créés', createdCount)}
    ${renderStatCard('Contacts requis', escalationCount)}
    ${renderStatCard('Emails rejetés', bounceCount)}
    ${renderStatCard('Contacts traités', resolvedCount)}
  `;
}

function buildRemoteSearchKey() {
  return `${getAuditSearchTerm()}::${getAuditTypeFilter()}`;
}

function canRunRemoteSearch() {
  const searchTerm = getAuditSearchTerm();
  const typeFilter = getAuditTypeFilter();
  return isAdminLike(currentProfile) && !isLoading && !isRemoteSearching && (searchTerm.length >= 2 || typeFilter !== 'all');
}

function buildRemoteSearchQueries(searchTerm, typeFilter) {
  const collectionRef = collection(db, 'accountAuditLogs');
  const values = compactUniqueStrings([searchTerm, searchTerm.toLowerCase()]);
  const queries = [];

  if (typeFilter !== 'all') {
    queries.push(query(collectionRef, where('type', '==', typeFilter), limit(REMOTE_SEARCH_LIMIT)));
  }

  if (searchTerm.length >= 2) {
    queries.push(query(collectionRef, where(documentId(), '==', searchTerm), limit(1)));

    if (searchTerm.includes('@')) {
      [
        'targetEmail',
        'actorEmail',
        'email',
        'newEmail',
        'previousEmail',
        'recipientEmail',
        'to'
      ].forEach((field) => {
        values.forEach((value) => {
          queries.push(query(collectionRef, where(field, '==', value), limit(REMOTE_SEARCH_LIMIT)));
        });
      });
    } else if (!/\s/.test(searchTerm)) {
      [
        'actorUid',
        'targetUid',
        'uid',
        'userUid',
        'accountUid',
        'targetUserId',
        'changes.documents.requestId',
        'changes.documents.documentId'
      ].forEach((field) => {
        queries.push(query(collectionRef, where(field, '==', searchTerm), limit(REMOTE_SEARCH_LIMIT)));
      });

      if (TYPE_META[searchTerm]) {
        queries.push(query(collectionRef, where('type', '==', searchTerm), limit(REMOTE_SEARCH_LIMIT)));
      }
    }
  }

  return queries.slice(0, MAX_REMOTE_SEARCH_QUERIES);
}

function mergeLogs(nextLogs = [], { keepIds = [] } = {}) {
  const merged = [...nextLogs, ...logs];
  const deduped = [];
  const seen = new Set();
  const protectedIds = new Set(keepIds.filter(Boolean));

  merged.forEach((log) => {
    if (!log.id || seen.has(log.id)) return;
    seen.add(log.id);
    deduped.push(log);
  });

  deduped.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  if (!protectedIds.size || deduped.length <= MAX_CACHE_ITEMS) {
    logs = deduped.slice(0, MAX_CACHE_ITEMS);
    return;
  }

  const protectedLogs = deduped.filter((log) => protectedIds.has(log.id));
  const regularLogs = deduped.filter((log) => !protectedIds.has(log.id));
  logs = [...protectedLogs, ...regularLogs.slice(0, Math.max(0, MAX_CACHE_ITEMS - protectedLogs.length))]
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

function updateRemoteSearchUi() {
  const button = document.getElementById('audit-remote-search-btn');
  const status = document.getElementById('audit-remote-search-status');
  const searchTerm = getAuditSearchTerm();
  const typeFilter = getAuditTypeFilter();

  if (button) {
    button.disabled = !canRunRemoteSearch();
    button.textContent = isRemoteSearching ? 'Recherche...' : 'Rechercher dans tout le journal';
    button.title = searchTerm || typeFilter !== 'all'
      ? 'Lance une recherche Firestore ciblée sans charger tout le journal.'
      : 'Saisis au moins 2 caractères ou choisis un type de log.';
  }

  if (status) {
    status.textContent = remoteSearchStatus || '';
    status.hidden = !remoteSearchStatus;
  }
}

async function runRemoteAuditSearch() {
  if (!canRunRemoteSearch()) return;

  const searchTerm = getAuditSearchTerm();
  const typeFilter = getAuditTypeFilter();
  const remoteKey = buildRemoteSearchKey();
  const searchQueries = buildRemoteSearchQueries(searchTerm, typeFilter);

  if (!searchQueries.length) {
    remoteSearchStatus = 'Recherche globale disponible surtout par email, UID, ID demande, ID document ou type de log.';
    render();
    return;
  }

  isRemoteSearching = true;
  lastRemoteSearchKey = remoteKey;
  remoteSearchStatus = 'Recherche globale ciblée en cours...';
  render();

  try {
    const found = [];

    for (const firestoreQuery of searchQueries) {
      const snap = await getDocs(firestoreQuery);
      snap.forEach((docSnap) => {
        found.push(normalizeLog({ id: docSnap.id, ...(docSnap.data() || {}) }));
      });
    }

    const before = logs.length;
    mergeLogs(found, { keepIds: found.map((log) => log.id) });
    saveCache();

    const visibleMatches = getFilteredLogs().length;
    const added = Math.max(0, logs.length - before);
    remoteSearchStatus = visibleMatches > 0
      ? `${visibleMatches} résultat${visibleMatches > 1 ? 's' : ''} trouvé${visibleMatches > 1 ? 's' : ''} après recherche globale${added ? `, ${added} ajouté${added > 1 ? 's' : ''} au cache` : ''}.`
      : 'Aucun résultat exact trouvé dans le journal global.';
  } catch (error) {
    console.warn('[SBI Audit] Recherche globale impossible :', error);
    remoteSearchStatus = 'Recherche globale indisponible pour cette valeur. Essaie avec un email, UID, ID demande ou ID document exact.';
  } finally {
    isRemoteSearching = false;
    render();
  }
}

async function openAuditProfileFromLogId(logId, button) {
  const log = logs.find((entry) => entry.id === logId);
  if (!log || !button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Ouverture...';

  try {
    const uid = await resolveProfileUidForLog(log);

    if (!uid) {
      button.textContent = 'Introuvable';
      button.classList.add('is-unavailable');
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
        button.classList.remove('is-unavailable');
      }, 1600);
      return;
    }

    sessionStorage.setItem('activeAdminTab', 'view-dashboard');
    sessionStorage.setItem('sbiAdminReturnTarget', 'view-dashboard');
    sessionStorage.setItem('sbiAdminReturnFromProfile', String(Date.now()));

    window.location.href = `/admin/admin-profile.html?id=${encodeURIComponent(uid)}&from=audit-log`;
  } catch (error) {
    console.warn('[SBI Audit] Ouverture profil impossible :', error);
    button.disabled = false;
    button.textContent = originalText;
  }
}

function getProfileActionMarkup(log = {}) {
  if (canTryOpenProfileFromLog(log)) {
    return `<button type="button" class="sbi-audit-profile-btn" data-audit-log-id="${escapeHtml(log.id)}">Profil</button>`;
  }

  if (log.type === 'account.deleted') {
    return '<span>Supprimé</span>';
  }

  return '<span>Sans profil</span>';
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
  const refreshBtn = document.getElementById('audit-refresh-btn');
  if (!list) return;

  summarizeLoadedLogs();

  const filtered = getFilteredLogs();
  const rendered = filtered.slice(0, MAX_RENDERED_ITEMS);
  const isCapped = filtered.length > rendered.length;
  const hasSearch = Boolean(document.getElementById('audit-search')?.value?.trim());

  if (!isAdminLike(currentProfile)) {
    list.innerHTML = '<div class="sbi-audit-empty sbi-audit-error">Accès réservé aux administrateurs.</div>';
  } else if (isLoading && logs.length === 0) {
    list.innerHTML = '<div class="sbi-audit-empty">Chargement léger en cours... Tu peux changer d’onglet, aucun chargement auto ne se relance.</div>';
  } else if (filtered.length === 0) {
    if (logs.length === 0) {
      list.innerHTML = '<div class="sbi-audit-empty">Aucun log en cache. Clique sur “Rafraîchir” pour charger les derniers événements.</div>';
    } else if (hasSearch) {
      list.innerHTML = '<div class="sbi-audit-empty">Aucun résultat dans le cache actuel. Lance “Rechercher dans tout le journal” pour chercher par email, UID, ID demande ou ID document sans charger toute la base.</div>';
    } else {
      list.innerHTML = '<div class="sbi-audit-empty">Aucun log ne correspond au filtre actuel.</div>';
    }
  } else {
    list.innerHTML = [
      rendered.map(renderLogItem).join(''),
      isCapped ? `<div class="sbi-audit-empty">Affichage limité à ${MAX_RENDERED_ITEMS} lignes pour garder le journal fluide. Affine la recherche ou charge moins d’archives.</div>` : ''
    ].join('');
  }

  if (count) {
    const filteredSuffix = filtered.length !== logs.length ? ` · ${filtered.length} trouvée${filtered.length > 1 ? 's' : ''}` : '';
    const capSuffix = isCapped ? ` · ${rendered.length} affichées` : '';
    count.textContent = `${logs.length} entrée${logs.length > 1 ? 's' : ''} en cache${filteredSuffix}${capSuffix}`;
  }

  if (loadMore) {
    loadMore.disabled = isLoading || !hasMore || !isAdminLike(currentProfile);
    loadMore.textContent = isLoading ? 'Chargement...' : hasMore ? 'Charger plus' : 'Fin du journal chargé';
  }

  if (refreshBtn) {
    refreshBtn.disabled = isLoading || !isAdminLike(currentProfile);
    refreshBtn.textContent = isLoading ? 'Chargement...' : 'Rafraîchir';
  }

  updateRemoteSearchUi();
}

async function loadAuditLogs({ reset = false } = {}) {
  if (isLoading || !isAdminLike(currentProfile)) return;

  if (reset) {
    logs = [];
    lastVisibleDoc = null;
    hasMore = true;
    clearCache();
  }

  isLoading = true;
  render();

  try {
    const clauses = [collection(db, 'accountAuditLogs'), orderBy('createdAt', 'desc')];
    if (lastVisibleDoc && !reset) clauses.push(startAfter(lastVisibleDoc));
    clauses.push(limit(PAGE_SIZE));

    const snap = await getDocs(query(...clauses));
    const nextLogs = [];

    snap.forEach((docSnap) => {
      nextLogs.push(normalizeLog({ id: docSnap.id, ...(docSnap.data() || {}) }));
    });

    lastVisibleDoc = snap.docs[snap.docs.length - 1] || lastVisibleDoc;
    hasMore = snap.size === PAGE_SIZE;

    if (reset) {
      logs = [];
    }

    mergeLogs(nextLogs);
    saveCache();
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

function bindAuditProfileButtons() {
  const list = document.getElementById('audit-log-list');
  if (!list || list.dataset.sbiAuditProfileBound === 'true') return;

  list.dataset.sbiAuditProfileBound = 'true';
  list.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-audit-log-id]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    openAuditProfileFromLogId(button.getAttribute('data-audit-log-id'), button);
  }, true);
}

export function mountAdminGlobalAuditLog() {
  mount();
  return () => {
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    isMounted = false;
  };
}

function mount() {
  if (isMounted) return;
  if (!document.getElementById('view-audit-log')) return;

  isMounted = true;

  document.getElementById('audit-refresh-btn')?.addEventListener('click', () => loadAuditLogs({ reset: true }));
  document.getElementById('audit-load-more-btn')?.addEventListener('click', () => loadAuditLogs());
  document.getElementById('audit-remote-search-btn')?.addEventListener('click', runRemoteAuditSearch);
  document.getElementById('audit-search')?.addEventListener('input', () => {
    if (buildRemoteSearchKey() !== lastRemoteSearchKey) remoteSearchStatus = '';
    render();
  });
  document.getElementById('audit-type-filter')?.addEventListener('change', () => {
    if (buildRemoteSearchKey() !== lastRemoteSearchKey) remoteSearchStatus = '';
    render();
  });
  bindAuditProfileButtons();

  unsubscribeAuth?.();
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentProfile = null;
      logs = [];
      render();
      return;
    }

    try {
      const profileQuery = query(collection(db, 'users'), where('__name__', '==', user.uid), limit(1));
      const profileSnap = await getDocs(profileQuery);
      currentProfile = profileSnap.empty ? null : profileSnap.docs[0].data();
    } catch (error) {
      currentProfile = null;
      console.warn('[SBI Audit] Profil admin indisponible :', error);
    }

    render();
    loadCache();
  });

  render();
}

function autoMountAuditLog() {
  if (window.__SBI_APP_SHELL_MOUNTING_AUDIT_LOG) return;
  mount();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMountAuditLog, { once: true });
} else {
  autoMountAuditLog();
}
