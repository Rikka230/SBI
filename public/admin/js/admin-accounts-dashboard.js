/**
 * SBI 8.0P.167.58 / P2I.1 UX
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
let fallbackAccountsSnapshotStarted = false;
let enhanceFrame = 0;

const ONLINE_TTL_MS = 90000;
const FINALIZATION_LINK_OLD_MS = 48 * 60 * 60 * 1000;

function injectStyle() {
  if (document.getElementById('sbi-admin-accounts-css')) return;

  const link = document.createElement('link');
  link.id = 'sbi-admin-accounts-css';
  link.rel = 'stylesheet';
  link.href = '/admin/css/admin-accounts.css?v=8.0P.167.58';
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
    || user.accountStatus?.firstLoginCompletedAt
    || user.lastSeenAt
    || null;
}

function hasConnected(user) {
  return Boolean(
    user.accountStatus?.firstLoginCompleted === true
    || user.accountStatus?.firstLoginAt
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

const SUSPICIOUS_EMAIL_DOMAINS = new Map([
  ['gmal.com', 'gmail.com'],
  ['gmial.com', 'gmail.com'],
  ['gmai.com', 'gmail.com'],
  ['gmail.con', 'gmail.com'],
  ['gmail.cmo', 'gmail.com'],
  ['gmail.comm', 'gmail.com'],
  ['hotmial.com', 'hotmail.com'],
  ['hotmai.com', 'hotmail.com'],
  ['hotmail.con', 'hotmail.com'],
  ['outlok.com', 'outlook.com'],
  ['outlook.con', 'outlook.com'],
  ['yaho.com', 'yahoo.com'],
  ['yahoo.con', 'yahoo.com'],
  ['icloud.con', 'icloud.com']
]);

function isEmailSyntaxValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function getEmailDomain(email) {
  return String(email || '').trim().toLowerCase().split('@').pop() || '';
}

function getSuspiciousEmailSuggestion(email) {
  const domain = getEmailDomain(email);
  if (!domain || !domain.includes('.')) return '';
  if (SUSPICIOUS_EMAIL_DOMAINS.has(domain)) return SUSPICIOUS_EMAIL_DOMAINS.get(domain);

  if (domain.endsWith('.con')) return `${domain.slice(0, -4)}.com`;
  if (domain.endsWith('.cmo')) return `${domain.slice(0, -4)}.com`;
  if (domain.endsWith('.comm')) return `${domain.slice(0, -5)}.com`;

  return '';
}

function getFriendlyBounceDetail(message = '') {
  const raw = String(message || '').toLowerCase();

  if (raw.includes('does not exist') || raw.includes('user unknown') || raw.includes('recipient address rejected') || raw.includes('550-5.1.1')) {
    return 'Adresse inexistante ou refusée';
  }

  if (raw.includes('mailbox full') || raw.includes('quota')) {
    return 'Boîte mail pleine ou indisponible';
  }

  if (raw.includes('blocked') || raw.includes('spam') || raw.includes('complaint')) {
    return 'Adresse bloquée ou refusée';
  }

  return 'Adresse inexistante ou refusée';
}

function getFinalizationEmailIssue(user = {}) {
  const status = user?.accountStatus || {};
  const email = user?.email || '';

  const issueCode = String(
    status.finalizationIssueCode
    || status.emailIssueCode
    || status.emailIssueType
    || status.emailIssue
    || status.emailProblem
    || ''
  ).toLowerCase();

  const deliveryState = String(
    status.emailBounceState
    || status.emailDeliveryState
    || status.emailStatus
    || status.deliveryStatus
    || status.brevoEvent
    || status.finalizationIssueEvent
    || ''
  ).toLowerCase();

  const issueMessage = String(
    status.finalizationIssueMessage
    || status.emailIssueMessage
    || status.emailBounceReason
    || status.emailRejectedReason
    || status.bounceReason
    || status.brevoReason
    || ''
  );

  const issueEvent = status.finalizationIssueEvent || status.brevoEvent || status.emailEvent || '';

  const hasBounceSignal = Boolean(
    status.emailBouncedAt
    || status.lastEmailBounceAt
    || status.emailRejectedAt
    || status.lastBounceAt
    || status.bouncedAt
    || status.rejectedAt
    || status.brevoBounceAt
    || issueCode.includes('bounce')
    || issueCode.includes('bounced')
    || issueCode.includes('reject')
    || issueCode.includes('rejected')
    || issueCode.includes('blocked')
    || issueCode.includes('blacklist')
    || deliveryState.includes('bounce')
    || deliveryState.includes('bounced')
    || deliveryState.includes('reject')
    || deliveryState.includes('rejected')
    || deliveryState.includes('blocked')
    || deliveryState.includes('blacklist')
    || deliveryState.includes('invalid')
  );

  if (hasBounceSignal) {
    return {
      code: 'email_bounced',
      label: 'Email rejeté',
      tone: 'danger',
      detail: getFriendlyBounceDetail(issueMessage || deliveryState || issueCode),
      technicalDetail: issueMessage,
      blocking: true,
      event: issueEvent
    };
  }

  const invalidSignal = Boolean(
    issueCode.includes('invalid')
    || issueCode.includes('syntax')
    || issueCode.includes('malformed')
    || deliveryState.includes('invalid')
    || status.emailInvalidAt
    || status.invalidEmailAt
    || status.finalizationInvalidEmailAt
  );

  if (invalidSignal || !isEmailSyntaxValid(email)) {
    return {
      code: 'invalid_email',
      label: 'Email invalide',
      tone: 'danger',
      detail: issueMessage || 'Adresse à corriger',
      blocking: true,
      event: issueEvent
    };
  }

  const suspiciousSignal = Boolean(
    issueCode.includes('suspect')
    || issueCode.includes('suspicious')
    || status.emailSuspiciousAt
    || status.suspiciousEmailAt
  );

  const suggestion = getSuspiciousEmailSuggestion(email);
  if (suspiciousSignal || suggestion) {
    return {
      code: 'suspicious_email',
      label: 'Email suspect',
      tone: 'warning',
      detail: issueMessage || (suggestion ? `Vérifier le domaine, possible ${suggestion}` : 'Adresse à vérifier'),
      blocking: false,
      suggestion
    };
  }

  return null;
}

function needsDirectFinalizationContact(user) {
  return Boolean(user?.accountStatus?.finalizationEscalationAt && !user?.accountStatus?.finalizationEscalationResolvedAt);
}

function hasResolvedFinalizationContact(user) {
  /*
   * 8.0P.167.43 :
   * Le contact direct traité reste un historique de support.
   * Dès qu'une vraie activité est détectée, l'état courant doit redevenir
   * “Activité détectée” et non rester bloqué sur “Contact direct traité”.
   */
  return Boolean(
    user?.accountStatus?.finalizationEscalationAt
    && user?.accountStatus?.finalizationEscalationResolvedAt
    && !hasConnected(user)
  );
}

function hasInvalidFinalizationEmail(user) {
  return Boolean(getFinalizationEmailIssue(user));
}

function hasOldFinalizationLink(user) {
  if (!user || hasConnected(user) || needsDirectFinalizationContact(user) || hasResolvedFinalizationContact(user) || hasInvalidFinalizationEmail(user)) return false;

  const accountStatus = user.accountStatus || {};
  const lastSignalMs = Math.max(
    toMillis(accountStatus.lastReminderSentAt),
    toMillis(accountStatus.finalizationInviteSentAt),
    toMillis(accountStatus.lastAccessEmailSentAt),
    toMillis(accountStatus.passwordResetSentAt),
    toMillis(accountStatus.invitationSentAt)
  );

  return Boolean(lastSignalMs && Date.now() - lastSignalMs >= FINALIZATION_LINK_OLD_MS);
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

  const emailIssue = getFinalizationEmailIssue(user);
  if (emailIssue) {
    return {
      label: emailIssue.label,
      tone: emailIssue.tone,
      detail: emailIssue.detail
    };
  }

  if (needsDirectFinalizationContact(user)) {
    return {
      label: 'Contact direct requis',
      tone: 'danger',
      detail: '3 relances envoyées'
    };
  }

  const explicitState = user.accountStatus?.activationState || user.accountStatus?.preparationState || user.activationState || user.preparationState || '';

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

  if (hasResolvedFinalizationContact(user)) {
    return {
      label: 'Contact direct traité',
      tone: 'success',
      detail: getEscalationNotePreview(user) || 'Alerte traitée'
    };
  }

  if (hasOldFinalizationLink(user)) {
    return {
      label: 'Lien ancien',
      tone: 'warning',
      detail: 'Renvoyer finalisation recommandé'
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
    if (activation.tone === 'warning' || activation.tone === 'danger' || preparation === 'to_check' || needsDirectFinalizationContact(user) || hasInvalidFinalizationEmail(user)) {
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


function setAccountsFromUsers(users = [], reason = 'core-cache') {
  const safeUsers = Array.isArray(users) ? users.filter(Boolean) : [];
  accountsById = new Map(safeUsers.map((user) => [user.id, user]));

  renderCounters(safeUsers);

  window.SBI_ACCOUNTS_DASHBOARD_STATE = {
    version: '8.0P.167.58',
    users: safeUsers.length,
    reason,
    updatedAt: new Date().toISOString()
  };

  scheduleEnhanceRenderedAccountRows();
}

function getCoreAccountsUsers() {
  const coreState = window.SBI_ADMIN_USERS_CACHE;
  return Array.isArray(coreState?.users) ? coreState.users : [];
}

function syncAccountsFromCoreState(reason = 'core-state') {
  const users = getCoreAccountsUsers();
  if (!users.length) return false;

  setAccountsFromUsers(users, reason);
  return true;
}

function scheduleEnhanceRenderedAccountRows() {
  if (enhanceFrame) window.cancelAnimationFrame(enhanceFrame);
  enhanceFrame = window.requestAnimationFrame(() => {
    enhanceFrame = 0;
    enhanceRenderedAccountRows();
  });
}


function renderAccountStatusCellHtml(user) {
  const activation = getActivationInfo(user);
  if (!activation) return '';

  const emailIssue = getFinalizationEmailIssue(user);
  const detail = emailIssue ? emailIssue.detail : activation.detail;

  return `
    <span class="sbi-status-dot sbi-status-${escapeHtml(activation.tone)}">${escapeHtml(activation.label)}</span>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
  `;
}

function updateAccountStatusCell(statusCell, user) {
  if (!statusCell || !user) return;

  const html = renderAccountStatusCellHtml(user);
  if (!html) return;

  const signature = [
    user.id || '',
    user.statut || '',
    user.email || '',
    user.accountStatus?.activationState || '',
    user.accountStatus?.preparationState || '',
    user.accountStatus?.finalizationIssueCode || '',
    user.accountStatus?.finalizationIssueMessage || '',
    user.accountStatus?.finalizationIssueEvent || '',
    user.accountStatus?.emailIssueCode || '',
    user.accountStatus?.emailIssueType || '',
    user.accountStatus?.emailIssue || '',
    user.accountStatus?.emailIssueMessage || '',
    user.accountStatus?.emailBounceState || '',
    user.accountStatus?.emailDeliveryState || '',
    user.accountStatus?.emailStatus || '',
    user.accountStatus?.deliveryStatus || '',
    user.accountStatus?.brevoEvent || '',
    user.accountStatus?.emailBouncedAt?.seconds || user.accountStatus?.emailBouncedAt || '',
    user.accountStatus?.lastEmailBounceAt?.seconds || user.accountStatus?.lastEmailBounceAt || '',
    user.accountStatus?.emailRejectedAt?.seconds || user.accountStatus?.emailRejectedAt || '',
    user.accountStatus?.lastBounceAt?.seconds || user.accountStatus?.lastBounceAt || '',
    user.accountStatus?.bouncedAt?.seconds || user.accountStatus?.bouncedAt || '',
    user.accountStatus?.rejectedAt?.seconds || user.accountStatus?.rejectedAt || '',
    user.accountStatus?.emailInvalidAt?.seconds || user.accountStatus?.emailInvalidAt || '',
    user.accountStatus?.invalidEmailAt?.seconds || user.accountStatus?.invalidEmailAt || '',
    user.accountStatus?.emailSuspiciousAt?.seconds || user.accountStatus?.emailSuspiciousAt || '',
    user.accountStatus?.suspiciousEmailAt?.seconds || user.accountStatus?.suspiciousEmailAt || '',
    user.accountStatus?.finalizationEscalationAt?.seconds || user.accountStatus?.finalizationEscalationAt || '',
    user.accountStatus?.finalizationEscalationResolvedAt?.seconds || user.accountStatus?.finalizationEscalationResolvedAt || '',
    user.accountStatus?.finalizationReminderCount ?? '',
    user.accountStatus?.reminderCount ?? '',
    user.accountStatus?.firstLoginCompleted === true ? 'first-ok' : '',
    user.accountStatus?.firstLoginAt?.seconds || user.accountStatus?.firstLoginAt || '',
    user.accountStatus?.lastLoginAt?.seconds || user.accountStatus?.lastLoginAt || '',
    user.lastLoginAt?.seconds || user.lastLoginAt || '',
    user.lastSeenAt?.seconds || user.lastSeenAt || ''
  ].join('|');

  if (statusCell.dataset.sbiStatusSignature === signature && statusCell.dataset.sbiStatusHtml === html) {
    return;
  }

  statusCell.dataset.sbiStatusSignature = signature;
  statusCell.dataset.sbiStatusHtml = html;
  statusCell.innerHTML = html;
  statusCell.style.display = 'flex';
  statusCell.style.flexDirection = 'column';
  statusCell.style.alignItems = 'flex-start';
  statusCell.style.justifyContent = 'center';
  statusCell.style.gap = '0.18rem';
  statusCell.style.textAlign = 'left';
  statusCell.style.minWidth = '0';
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
    row.style.gridTemplateColumns = '64px minmax(108px, .88fr) minmax(138px, 1.1fr) minmax(156px, 1.24fr) 62px 62px';

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
      const emailIssue = getFinalizationEmailIssue(user);
      const escalationText = emailIssue
        ? `<small style="display:block; max-width:100%; color:${emailIssue.tone === 'danger' ? '#ff9b9b' : '#ffe39a'}; font-weight:800; line-height:1.22; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(emailIssue.detail)}</small>`
        : needsDirectFinalizationContact(user)
          ? '<small style="color:#ff9b9b; font-weight:800;">3 relances · contact élève</small>'
          : hasResolvedFinalizationContact(user)
            ? `<small style="color:#9ff3bd; font-weight:800;">Traité${notePreview ? ` · ${escapeHtml(notePreview)}` : ''}</small>`
            : hasOldFinalizationLink(user)
              ? '<small style="color:#ffe39a; font-weight:800;">Renvoyer finalisation recommandé</small>'
              : `<small>${escapeHtml(getAccountPreparationInfo(user))}</small>`;
      // 8.0P.167.54 : le statut détaillé est rendu directement par admin-core pour éviter un second repaint.
    }

    row.title = [
      `Rôle : ${getRoleLabel(user)}`,
      `Activation : ${activation.label}`,
      `Détail : ${activation.detail}`,
      `Dernière activité : ${lastActivity}`,
      `Compte : ${getAccountPreparationInfo(user)}`,
      `Promotion : ${user.promotionName || 'Aucune promotion'}`
    ].join('\n');
  });
}

function observeUsersList() {
  // 8.0P.167.53 : plus de MutationObserver sur toute la liste.
  // L'enhancement est déclenché par l'évènement sbi:accounts-rendered / sbi:accounts-data-updated.
  return;
}

function startFallbackAccountsSnapshot() {
  if (fallbackAccountsSnapshotStarted) return;
  fallbackAccountsSnapshotStarted = true;

  const fallbackUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
    const users = [];
    snapshot.forEach((docSnap) => {
      users.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });

    setAccountsFromUsers(users, 'fallback-snapshot');
  }, (error) => {
    console.warn('[SBI Accounts] Lecture comptes impossible :', error);
  });

  const previousUnsubscribe = unsubscribeAccounts;
  unsubscribeAccounts = () => {
    previousUnsubscribe?.();
    fallbackUnsubscribe?.();
  };
}

function startAccountsSnapshot() {
  if (unsubscribeAccounts) return;

  const onCoreAccountsUpdated = (event) => {
    const users = event?.detail?.users || getCoreAccountsUsers();
    setAccountsFromUsers(users, event?.detail?.reason || 'core-event');
  };

  window.addEventListener('sbi:accounts-data-updated', onCoreAccountsUpdated);

  unsubscribeAccounts = () => {
    window.removeEventListener('sbi:accounts-data-updated', onCoreAccountsUpdated);
  };

  syncAccountsFromCoreState('core-cache-existing');

  window.setTimeout(() => {
    if (accountsById.size === 0 && window.__SBI_ADMIN_CORE_ACCOUNTS_OWNER !== true) {
      startFallbackAccountsSnapshot();
    }
  }, 1600);
}

function navigateToProfile(uid) {
  if (!uid) return;

  try {
    sessionStorage.setItem('activeAdminTab', 'view-users');
    sessionStorage.setItem('sbiAdminReturnTarget', 'view-users');
    sessionStorage.setItem('sbiAdminReturnFromProfile', String(Date.now()));
  } catch {}

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
    scheduleEnhanceRenderedAccountRows();
    return;
  }

  if (!ensureAccountsShell()) return;

  mounted = true;
  injectStyle();
  bindProfileNavigation();
  observeUsersList();
  startAccountsSnapshot();
  scheduleEnhanceRenderedAccountRows();
}

function unmountAdminAccountsDashboard() {
  if (enhanceFrame) window.cancelAnimationFrame(enhanceFrame);
  enhanceFrame = 0;

  listObserver?.disconnect?.();
  listObserver = null;
  unsubscribeAccounts?.();
  unsubscribeAccounts = null;
  fallbackAccountsSnapshotStarted = false;
  mounted = false;
}

window.SBI_ADMIN_ACCOUNTS_DASHBOARD_UNMOUNT = unmountAdminAccountsDashboard;

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
  window.requestAnimationFrame(() => {
    mount();
    syncAccountsFromCoreState('accounts-rendered');
    scheduleEnhanceRenderedAccountRows();
  });
});

window.addEventListener('sbi:accounts-data-updated', (event) => {
  setAccountsFromUsers(event?.detail?.users || getCoreAccountsUsers(), event?.detail?.reason || 'accounts-data-updated');
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
