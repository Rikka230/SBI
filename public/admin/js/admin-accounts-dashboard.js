/**
 * SBI 8.0P.166.3 / P2H.2-E.3 UX
 * Structure lecture seule "Comptes & accès".
 *
 * Objectif :
 * - garder la section Comptes propre ;
 * - conserver les compteurs utiles ;
 * - afficher l’activité réelle avant un ancien état pending_password ;
 * - ne pas importer, supprimer en masse ou envoyer de mails groupés ;
 * - ne pas toucher aux workflows sensibles déjà validés.
 */

import { db } from '/js/firebase-init.js';
import {
  collection,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let mounted = false;
let unsubscribeAccounts = null;
let accountsById = new Map();
let listObserver = null;

const ONLINE_TTL_MS = 90000;

function injectStyle() {
  if (document.getElementById('sbi-admin-accounts-css')) return;

  const link = document.createElement('link');
  link.id = 'sbi-admin-accounts-css';
  link.rel = 'stylesheet';
  link.href = '/admin/css/admin-accounts.css?v=8.0P.166.3';
  document.head.append(link);
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

function formatDate(value, fallback = 'Non renseigné') {
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

function isOnline(user) {
  if (!user || user.statut === 'suspendu') return false;
  if (user.isOnline !== true) return false;

  const lastSeenMs = toMillis(user.lastSeenAt);
  if (!lastSeenMs) return false;

  return Date.now() - lastSeenMs <= ONLINE_TTL_MS;
}

function getLastActivityDate(user) {
  return user.accountStatus?.lastLoginAt
    || user.lastLoginAt
    || user.accountStatus?.firstLoginAt
    || user.firstLoginAt
    || user.lastSeenAt
    || null;
}

function hasConnected(user) {
  return Boolean(
    user.accountStatus?.firstLoginAt
    || user.firstLoginAt
    || user.accountStatus?.lastLoginAt
    || user.lastLoginAt
    || user.lastSeenAt
  );
}

function getRoleLabel(user) {
  if (user?.isGod === true) return 'Suprême';
  if (user?.role === 'admin') return 'Admin';
  if (user?.role === 'teacher') return 'Professeur';
  if (user?.role === 'student') return 'Élève';
  return 'Non défini';
}

function needsDirectFinalizationContact(user) {
  return Boolean(user?.accountStatus?.finalizationEscalationAt && !user?.accountStatus?.finalizationEscalationResolvedAt);
}

function hasResolvedFinalizationContact(user) {
  return Boolean(user?.accountStatus?.finalizationEscalationAt && user?.accountStatus?.finalizationEscalationResolvedAt);
}

function getEscalationNotePreview(user) {
  const note = String(user?.accountStatus?.finalizationEscalationResolutionNote || '').trim();
  if (!note) return '';
  return note.length > 46 ? `${note.slice(0, 46)}…` : note;
}

function getActivationInfo(user) {
  if (!user) {
    return {
      label: 'Inconnu',
      tone: 'muted',
      detail: 'Compte non chargé'
    };
  }

  if (user.statut === 'suspendu') {
    return {
      label: 'Suspendu',
      tone: 'danger',
      detail: 'Accès bloqué'
    };
  }

  if (needsDirectFinalizationContact(user)) {
    return {
      label: 'Contact direct requis',
      tone: 'danger',
      detail: '3 relances envoyées'
    };
  }

  if (hasResolvedFinalizationContact(user)) {
    return {
      label: 'Contact direct traité',
      tone: 'success',
      detail: getEscalationNotePreview(user) || 'Alerte traitée'
    };
  }

  const explicitState = user.accountStatus?.activationState || user.activationState || '';

  if (explicitState === 'blocked') {
    return {
      label: 'Bloqué',
      tone: 'danger',
      detail: 'Support requis'
    };
  }

  if (explicitState === 'active') {
    return {
      label: 'Activité détectée',
      tone: 'success',
      detail: formatDate(getLastActivityDate(user), 'Première connexion validée')
    };
  }

  /*
   * P2H.2-B.1 :
   * Si une vraie activité existe, elle doit primer sur un ancien
   * activationState = pending_password encore présent en base.
   */
  if (hasConnected(user)) {
    return {
      label: 'Activité détectée',
      tone: 'success',
      detail: formatDate(getLastActivityDate(user), 'Activité enregistrée')
    };
  }

  if (explicitState === 'pending_password') {
    return {
      label: 'Mot de passe attendu',
      tone: 'warning',
      detail: 'Lien à utiliser ou renvoyer'
    };
  }

  if (user.invitationSentAt || user.accountStatus?.invitationSentAt || user.createdAt || user.dateCreation) {
    return {
      label: 'Jamais connecté',
      tone: 'warning',
      detail: 'Invitation ou accès à vérifier'
    };
  }

  return {
    label: 'À vérifier',
    tone: 'warning',
    detail: 'Historique incomplet'
  };
}

function getAccountPreparationInfo(user) {
  const state = user?.accountStatus?.preparationState || user?.preparationState || 'not_prepared';
  const labels = {
    not_prepared: 'Compte à préparer',
    to_check: 'À vérifier',
    ready: 'Prêt',
    completed: 'Terminé'
  };

  return labels[state] || 'Compte à préparer';
}

function getAccessCount(user) {
  const ids = Array.isArray(user?.formationIds) ? user.formationIds : [];
  const access = Array.isArray(user?.formationsAcces) ? user.formationsAcces : [];

  const set = new Set([...ids, ...access].filter(Boolean));
  return set.size;
}

function buildCounterCard(id, label) {
  return `
    <article class="sbi-account-counter" data-sbi-account-stat="${id}">
      <span>${escapeHtml(label)}</span>
      <strong>-</strong>
    </article>
  `;
}

function ensureAccountsShell() {
  const section = document.getElementById('view-users');
  if (!section) return false;

  section.classList.add('sbi-accounts-view');

  const heading = section.querySelector('h2');
  if (heading) heading.textContent = 'Comptes & accès';

  const header = section.firstElementChild;
  if (header) {
    header.classList.add('sbi-accounts-header');

    const oldIntro = header.querySelector('.sbi-accounts-header-copy');
    if (oldIntro) oldIntro.remove();

    if (!header.querySelector('.sbi-accounts-header-note')) {
      const note = document.createElement('p');
      note.className = 'sbi-accounts-header-note';
      note.textContent = 'Création, accès, activation et vérification des comptes.';
      heading?.insertAdjacentElement('afterend', note);
    }
  }

  const searchInput = document.getElementById('search-user');
  if (searchInput) searchInput.placeholder = 'Rechercher un compte...';

  const createForm = document.getElementById('create-user-form');
  const workspace = createForm?.closest('div')?.parentElement;
  if (workspace) {
    workspace.classList.add('sbi-accounts-workspace');
    workspace.firstElementChild?.classList.add('sbi-account-create-card');
    workspace.lastElementChild?.classList.add('sbi-account-list-card');

    const createTitle = workspace.firstElementChild?.querySelector('h3');
    if (createTitle) createTitle.textContent = 'Créer un compte';

    const listTitle = workspace.lastElementChild?.querySelector('h3');
    if (listTitle) listTitle.textContent = 'Liste des comptes';

    const previousOverview = workspace.previousElementSibling;
    if (previousOverview?.classList?.contains('sbi-accounts-overview')) {
      previousOverview.remove();
    }

    if (!workspace.previousElementSibling?.classList?.contains('sbi-accounts-counters')) {
      const counters = document.createElement('div');
      counters.className = 'sbi-accounts-counters';
      counters.innerHTML = `
        ${buildCounterCard('total', 'Comptes')}
        ${buildCounterCard('students', 'Élèves')}
        ${buildCounterCard('teachers', 'Professeurs')}
        ${buildCounterCard('admins', 'Admins')}
        ${buildCounterCard('never', 'Jamais connectés')}
        ${buildCounterCard('suspended', 'Suspendus')}
        ${buildCounterCard('online', 'En ligne')}
        ${buildCounterCard('tocheck', 'À vérifier')}
      `;
      workspace.parentNode.insertBefore(counters, workspace);
    }
  }

  return true;
}

function updateStat(id, value) {
  const card = document.querySelector(`[data-sbi-account-stat="${id}"] strong`);
  if (card) card.textContent = String(value);
}

function renderCounters(users) {
  const stats = users.reduce((acc, user) => {
    acc.total += 1;
    if (user.role === 'student') acc.students += 1;
    if (user.role === 'teacher') acc.teachers += 1;
    if (user.role === 'admin' || user.isGod === true) acc.admins += 1;
    if (!hasConnected(user)) acc.never += 1;
    if (user.statut === 'suspendu') acc.suspended += 1;
    if (isOnline(user)) acc.online += 1;

    const activation = getActivationInfo(user);
    const preparation = user.accountStatus?.preparationState || user.preparationState;
    if (activation.tone === 'warning' || activation.tone === 'danger' || preparation === 'to_check' || needsDirectFinalizationContact(user)) {
      acc.tocheck += 1;
    }

    return acc;
  }, {
    total: 0,
    students: 0,
    teachers: 0,
    admins: 0,
    never: 0,
    suspended: 0,
    online: 0,
    tocheck: 0
  });

  Object.entries(stats).forEach(([key, value]) => updateStat(key, value));
}

function enhanceRenderedAccountRows() {
  const container = document.getElementById('users-list-container');
  if (!container || accountsById.size === 0) return;

  container.querySelectorAll('.btn-view-profile[data-id]').forEach((button) => {
    const uid = button.getAttribute('data-id');
    const user = accountsById.get(uid);
    if (!user) return;

    const row = button.closest('div');
    if (!row || row.dataset.sbiAccountEnhanced === 'true') return;

    row.dataset.sbiAccountEnhanced = 'true';
    row.classList.add('sbi-account-row');
    row.style.gridTemplateColumns = '85px minmax(150px, 1fr) minmax(190px, 1.45fr) minmax(110px, .8fr) 75px 75px';

    const emailCell = row.children?.[2];
    const statusCell = row.children?.[3];

    const activation = getActivationInfo(user);
    const accessCount = getAccessCount(user);
    const lastActivity = formatDate(getLastActivityDate(user), 'Jamais connecté');

    if (emailCell) {
      emailCell.classList.add('sbi-account-email-cell');
      emailCell.innerHTML = `
        <span class="sbi-account-email-line">${escapeHtml(user.email || 'Email manquant')}</span>
        <span class="sbi-account-card-meta">
          ${escapeHtml(lastActivity)} · ${accessCount} accès formation${accessCount > 1 ? 's' : ''}
        </span>
      `;
    }

    if (statusCell) {
      statusCell.classList.add('sbi-account-status-cell');
      const notePreview = getEscalationNotePreview(user);
      const escalationText = needsDirectFinalizationContact(user)
        ? '<small style="color:#ff9b9b; font-weight:800;">3 relances · contact élève</small>'
        : hasResolvedFinalizationContact(user)
          ? `<small style="color:#9ff3bd; font-weight:800;">Traité${notePreview ? ` · ${escapeHtml(notePreview)}` : ''}</small>`
          : `<small>${escapeHtml(getAccountPreparationInfo(user))}</small>`;

      statusCell.innerHTML = `
        <span class="sbi-status-dot sbi-status-${activation.tone}">${escapeHtml(activation.label)}</span>
        ${escalationText}
      `;
    }

    row.title = [
      `Rôle : ${getRoleLabel(user)}`,
      `Activation : ${activation.label}`,
      `Détail : ${activation.detail}`,
      `Dernière activité : ${lastActivity}`,
      `Compte : ${getAccountPreparationInfo(user)}`
    ].join('\n');
  });
}

function observeUsersList() {
  const container = document.getElementById('users-list-container');
  if (!container || listObserver) return;

  listObserver = new MutationObserver(() => {
    window.requestAnimationFrame(enhanceRenderedAccountRows);
  });

  listObserver.observe(container, { childList: true, subtree: true });
}

function startAccountsSnapshot() {
  if (unsubscribeAccounts) return;

  unsubscribeAccounts = onSnapshot(collection(db, 'users'), (snapshot) => {
    const users = [];
    const nextMap = new Map();

    snapshot.forEach((docSnap) => {
      const user = { id: docSnap.id, ...(docSnap.data() || {}) };
      users.push(user);
      nextMap.set(docSnap.id, user);
    });

    accountsById = nextMap;
    renderCounters(users);
    enhanceRenderedAccountRows();

    window.SBI_ACCOUNTS_DASHBOARD_STATE = {
      version: '8.0P.166.3',
      users: users.length,
      updatedAt: new Date().toISOString()
    };
  }, (error) => {
    console.warn('[SBI Accounts] Lecture comptes impossible :', error);
  });
}

function navigateToProfile(uid) {
  if (!uid) return;

  const href = `/admin/admin-profile.html?id=${encodeURIComponent(uid)}`;
  const url = new URL(href, window.location.origin);

  /*
   * On laisse le routeur PJAX interne intercepter un vrai lien si possible.
   * En fallback, on garde une navigation classique propre.
   */
  const ghostLink = document.createElement('a');
  ghostLink.href = href;
  ghostLink.setAttribute('data-sbi-href', href);
  ghostLink.style.display = 'none';
  document.body.appendChild(ghostLink);

  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0
  });

  const intercepted = !ghostLink.dispatchEvent(clickEvent);
  ghostLink.remove();

  if (!intercepted) {
    window.location.href = url.pathname + url.search;
  }
}

function bindProfileNavigation() {
  if (document.body.dataset.sbiAccountProfileNavBound === 'true') return;
  document.body.dataset.sbiAccountProfileNavBound = 'true';

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.btn-view-profile[data-id]');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    navigateToProfile(button.getAttribute('data-id'));
  }, true);
}

function resetAccountsMountIfDomWasReplaced() {
  const section = document.getElementById('view-users');
  if (!section) return false;

  const needsRemount = mounted && !section.classList.contains('sbi-accounts-view');
  if (!needsRemount) return false;

  listObserver?.disconnect?.();
  listObserver = null;
  mounted = false;
  return true;
}

function mount() {
  resetAccountsMountIfDomWasReplaced();

  if (mounted) {
    ensureAccountsShell();
    enhanceRenderedAccountRows();
    return;
  }

  if (!ensureAccountsShell()) return;

  mounted = true;
  injectStyle();
  bindProfileNavigation();
  observeUsersList();
  startAccountsSnapshot();
  enhanceRenderedAccountRows();
}

export function mountAdminAccountsDashboard() {
  const tryMount = () => {
    mount();

    if (!mounted) {
      window.setTimeout(mount, 200);
      window.setTimeout(mount, 800);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryMount, { once: true });
  } else {
    tryMount();
  }
}

window.addEventListener('sbi:accounts-rendered', () => {
  window.requestAnimationFrame(mount);
});

window.addEventListener('sbi:components-ready', () => {
  window.requestAnimationFrame(mount);
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
