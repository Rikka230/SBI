/**
 * SBI 8.0P.155 / P2H.2-A
 * Structure lecture seule "Comptes & accès".
 *
 * Objectif :
 * - préparer une vraie section Comptes avant migration élèves ;
 * - ne pas importer, supprimer en masse ou envoyer de mails groupés ;
 * - ne pas toucher aux workflows sensibles déjà validés ;
 * - enrichir la lecture admin à partir de Firestore.
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
  link.href = '/admin/css/admin-accounts.css?v=8.0P.155';
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

function getCreationDate(user) {
  return user.createdAt || user.dateCreation || user.created_at || null;
}

function getLastActivityDate(user) {
  return user.lastLoginAt
    || user.accountStatus?.lastLoginAt
    || user.firstLoginAt
    || user.accountStatus?.firstLoginAt
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

  const explicitState = user.accountStatus?.activationState || user.activationState || '';

  if (explicitState === 'active') {
    return {
      label: 'Activé',
      tone: 'success',
      detail: 'Première connexion validée'
    };
  }

  if (explicitState === 'blocked') {
    return {
      label: 'Bloqué',
      tone: 'danger',
      detail: 'Support requis'
    };
  }

  if (explicitState === 'pending_password') {
    return {
      label: 'Mot de passe attendu',
      tone: 'warning',
      detail: 'Lien à utiliser ou renvoyer'
    };
  }

  if (hasConnected(user)) {
    return {
      label: 'Activité détectée',
      tone: 'success',
      detail: formatDate(getLastActivityDate(user), 'Activité enregistrée')
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

function getMigrationInfo(user) {
  const state = user?.accountStatus?.migrationState || user?.migrationState || 'not_started';
  const labels = {
    not_started: 'Non démarrée',
    to_check: 'À vérifier',
    ready: 'Prêt',
    migrated: 'Migré'
  };

  return labels[state] || 'Non démarrée';
}

function getAccessCount(user) {
  const ids = Array.isArray(user?.formationIds) ? user.formationIds : [];
  const access = Array.isArray(user?.formationsAcces) ? user.formationsAcces : [];

  const set = new Set([...ids, ...access].filter(Boolean));
  return set.size;
}

function buildStatCard(id, label, value = '-') {
  return `
    <article class="sbi-account-stat" data-sbi-account-stat="${id}">
      <span>${label}</span>
      <strong>${value}</strong>
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

    if (!header.querySelector('.sbi-accounts-header-copy')) {
      const copy = document.createElement('p');
      copy.className = 'sbi-accounts-header-copy';
      copy.textContent = 'Base de suivi des accès avant migration élèves : création, activation, rôles, état de connexion et accès formations.';
      heading?.insertAdjacentElement('afterend', copy);
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

    if (!workspace.previousElementSibling?.classList?.contains('sbi-accounts-overview')) {
      const overview = document.createElement('div');
      overview.className = 'sbi-accounts-overview';
      overview.innerHTML = `
        <div class="sbi-accounts-overview-main">
          <div>
            <span class="sbi-kicker">Support migration</span>
            <h3>Suivi des comptes</h3>
            <p>Cette vue prépare la migration : elle donne une lecture claire des comptes existants sans lancer d’import ni d’action groupée.</p>
          </div>
          <div class="sbi-accounts-roadmap">
            <span>Étape actuelle</span>
            <strong>P2H.2-A</strong>
            <small>Structure Comptes</small>
          </div>
        </div>
        <div class="sbi-accounts-stats">
          ${buildStatCard('total', 'Comptes')}
          ${buildStatCard('students', 'Élèves')}
          ${buildStatCard('teachers', 'Professeurs')}
          ${buildStatCard('admins', 'Admins')}
          ${buildStatCard('never', 'Jamais connectés')}
          ${buildStatCard('suspended', 'Suspendus')}
          ${buildStatCard('online', 'En ligne')}
          ${buildStatCard('tocheck', 'À vérifier')}
        </div>
      `;
      workspace.parentNode.insertBefore(overview, workspace);
    }
  }

  return true;
}

function updateStat(id, value) {
  const card = document.querySelector(`[data-sbi-account-stat="${id}"] strong`);
  if (card) card.textContent = String(value);
}

function renderOverview(users) {
  const stats = users.reduce((acc, user) => {
    acc.total += 1;
    if (user.role === 'student') acc.students += 1;
    if (user.role === 'teacher') acc.teachers += 1;
    if (user.role === 'admin' || user.isGod === true) acc.admins += 1;
    if (!hasConnected(user)) acc.never += 1;
    if (user.statut === 'suspendu') acc.suspended += 1;
    if (isOnline(user)) acc.online += 1;

    const activation = getActivationInfo(user);
    const migration = user.accountStatus?.migrationState || user.migrationState;
    if (activation.tone === 'warning' || activation.tone === 'danger' || migration === 'to_check') {
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
      statusCell.innerHTML = `
        <span class="sbi-status-dot sbi-status-${activation.tone}">${escapeHtml(activation.label)}</span>
        <small>${escapeHtml(getMigrationInfo(user))}</small>
      `;
    }

    row.title = [
      `Rôle : ${getRoleLabel(user)}`,
      `Activation : ${activation.label}`,
      `Détail : ${activation.detail}`,
      `Dernière activité : ${lastActivity}`,
      `Migration : ${getMigrationInfo(user)}`
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
    renderOverview(users);
    enhanceRenderedAccountRows();

    window.SBI_ACCOUNTS_DASHBOARD_STATE = {
      version: '8.0P.155',
      users: users.length,
      updatedAt: new Date().toISOString()
    };
  }, (error) => {
    console.warn('[SBI Accounts] Lecture comptes impossible :', error);
  });
}

function mount() {
  if (mounted) return;
  if (!ensureAccountsShell()) return;

  mounted = true;
  injectStyle();
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
