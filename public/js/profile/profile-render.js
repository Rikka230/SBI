import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { app } from '/js/firebase-init.js';
import { escapeHTML, getDisplayName, SVG_EDIT } from './profile-utils.js';
import { maybeMigrateVisibleLegacyAvatar } from './profile-avatar-cropper.js';
import { updateProfilePresenceStatus } from './profile-presence.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const adminUpdateUserAccountCallable = httpsCallable(functionsInstance, 'adminUpdateUserAccount');
const adminSendPasswordResetCallable = httpsCallable(functionsInstance, 'adminSendPasswordReset');
const adminSendFinalizationInviteCallable = httpsCallable(functionsInstance, 'adminSendFinalizationInvite');
const adminResolveFinalizationEscalationCallable = httpsCallable(functionsInstance, 'adminResolveFinalizationEscalation');

const ACCOUNT_PREPARATION_LABELS = {
  not_prepared: 'Compte à préparer',
  to_check: 'À vérifier',
  ready: 'Prêt',
  completed: 'Terminé'
};

function isStudentRole(profile = {}) {
  const role = String(profile.role || '').toLowerCase();
  return ['student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(role);
}

function getPromotionLabelForProfile(promotion = {}) {
  return promotion?.name || promotion?.promotionName || 'Promotion sans nom';
}

async function loadActivePromotionsForProfile(db) {
  try {
    const snap = await getDocs(query(collection(db, 'promotions')));
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (data.status === 'archived') return;
      rows.push({ id: docSnap.id, ...data });
    });
    rows.sort((a, b) => getPromotionLabelForProfile(a).localeCompare(getPromotionLabelForProfile(b), 'fr', { sensitivity: 'base' }));
    return rows;
  } catch (error) {
    console.warn('[SBI Profile] Promotions non chargées :', error);
    return [];
  }
}

function renderPromotionOptions(promotions = [], currentPromotionId = '') {
  return `
    <option value="">Aucune promotion</option>
    ${promotions.map((promotion) => `
      <option value="${escapeHTML(promotion.id)}"${promotion.id === currentPromotionId ? ' selected' : ''}>${escapeHTML(getPromotionLabelForProfile(promotion))}</option>
    `).join('')}
  `;
}

export async function renderProfileShell({ db, uid, data, context, reloadProfile }) {
  const displayName = getDisplayName(data, 'Utilisateur Sans Nom');
  const nameEl = document.getElementById('prof-name');

  if (nameEl) {
    nameEl.innerHTML = `${escapeHTML(displayName)} <span id="prof-badge-zone" style="margin-left: 10px; font-size: 0.45em; vertical-align: middle;"></span>`;
  }

  const bioDisplay = document.getElementById('prof-bio-display');
  if (bioDisplay) bioDisplay.textContent = data.bio || 'Élève de la plateforme SBI';

  const bioInput = document.getElementById('prof-bio');
  if (bioInput) bioInput.value = data.bio || '';

  const avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111&color=fff&size=150`;
  const avatarImg = document.getElementById('prof-avatar-img');
  if (avatarImg) avatarImg.src = avatarUrl;

  await maybeMigrateVisibleLegacyAvatar({ uid, data, avatarImg, context });
  updateProfilePresenceStatus(data);

  renderRoleBadge(data);
  await renderXp({ db, uid, data, context, reloadProfile });
  renderPrivateData(data, context);
  await renderActivity({ db, uid, data, context, reloadProfile });
}

function renderRoleBadge(data = {}) {
  const badgeZone = document.getElementById('prof-badge-zone');
  if (!badgeZone) return;

  if (data.isGod) {
    badgeZone.innerHTML = `<span style="background:rgba(255,215,0,0.15); color:#ffd700; padding:4px 8px; border-radius:4px; font-weight:bold;">SUPRÊME</span>`;
  } else if (data.role === 'admin') {
    badgeZone.innerHTML = `<span style="background:rgba(255,74,74,0.15); color:#ff4a4a; padding:4px 8px; border-radius:4px; font-weight:bold;">ADMIN</span>`;
  } else if (data.role === 'teacher') {
    badgeZone.innerHTML = `<span style="background:rgba(251,188,4,0.15); color:#fbbc04; padding:4px 8px; border-radius:4px; font-weight:bold;">PROFESSEUR</span>`;
  } else {
    badgeZone.innerHTML = `<span style="background:rgba(42, 87, 255, 0.15); color:#2A57FF; padding:4px 8px; border-radius:4px; font-weight:bold;">ÉLÈVE</span>`;
  }
}

async function renderXp({ db, uid, data = {}, context, reloadProfile }) {
  const xp = Number(data.xp) || 0;
  const level = Math.floor(xp / 100) + 1;

  const levelEl = document.getElementById('prof-level');
  if (levelEl) levelEl.textContent = level;

  const badgeBronze = document.getElementById('badge-bronze');
  const badgeSilver = document.getElementById('badge-silver');
  const badgeGold = document.getElementById('badge-gold');
  const badgeDiamond = document.getElementById('badge-diamond');

  [badgeBronze, badgeSilver, badgeGold, badgeDiamond].forEach((badge) => badge?.classList.remove('unlocked'));
  if (badgeBronze && level >= 2) badgeBronze.classList.add('unlocked');
  if (badgeSilver && level >= 5) badgeSilver.classList.add('unlocked');
  if (badgeGold && level >= 10) badgeGold.classList.add('unlocked');
  if (badgeDiamond && level >= 20) badgeDiamond.classList.add('unlocked');

  [document.getElementById('prof-xp'), document.getElementById('prof-xp-text')].forEach((el) => {
    if (!el) return;
    el.innerHTML = `${xp}`;

    if (context.isAdmin) {
      el.innerHTML = `${xp} ${SVG_EDIT}`;
      el.style.cursor = 'pointer';
      el.title = "Cliquez pour modifier l'XP brute";
      el.onclick = async () => {
        const newXp = prompt(`Modifier l'XP de cet élève (Actuel : ${xp}) :`, xp);
        if (newXp !== null && !isNaN(newXp) && newXp.trim() !== '') {
          await updateDoc(doc(db, 'users', uid), { xp: parseInt(newXp, 10) });
          await reloadProfile(uid);
        }
      };
    }
  });

  const fill = document.getElementById('prof-xp-fill');
  if (fill) fill.style.width = Math.min((xp / 1000) * 100, 100) + '%';
}

function renderPrivateData(data = {}, context) {
  if (!context.isOwner && !context.isAdmin) return;

  const emailEl = document.getElementById('prof-email');
  if (emailEl) {
    emailEl.tagName === 'INPUT' ? emailEl.value = data.email || '' : emailEl.textContent = data.email || '';
  }

  if (context.isOwner) {
    const btnChangeAdmin = document.getElementById('btn-change-email-admin');
    if (btnChangeAdmin) btnChangeAdmin.style.display = 'block';
  }

  const phone = document.getElementById('prof-phone');
  if (phone) phone.value = data.privateData?.phone || '';

  const address = document.getElementById('prof-address');
  if (address) address.value = data.privateData?.address || '';

  const time = document.getElementById('prof-time');
  if (time) {
    const total = Number(data.totalConnectionTime) || 0;
    time.textContent = `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
  }
}

async function renderActivity({ db, uid, data = {}, context, reloadProfile }) {
  const list = document.getElementById('prof-activity-list');
  if (!list) return;

  list.style.margin = '0';
  list.style.padding = '0';

  const fallbackCreationDate = data.dateCreation
    ? formatSbiDate(data.dateCreation, 'Date inconnue')
    : formatSbiDate(data.createdAt, 'Date inconnue');

  if (!context.isAdmin) {
    list.innerHTML = renderAccountLogsReadOnlyCreation(fallbackCreationDate);
    return;
  }

  renderAccountActionsPanel({ db, uid, data, reloadProfile });

  list.innerHTML = renderAccountLogsLoading();

  try {
    const logsQuery = query(
      collection(db, 'accountAuditLogs'),
      where('targetUid', '==', uid),
      limit(80)
    );

    const logsSnap = await getDocs(logsQuery);
    const logs = [];

    logsSnap.forEach((docSnap) => {
      logs.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });

    logs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    const compactLogs = compactAccountLogs(logs);

    if (compactLogs.length === 0) {
      list.innerHTML = renderAccountLogsEmpty(fallbackCreationDate);
      return;
    }

    list.innerHTML = renderAccountLogsPanel({
      logs: compactLogs.slice(0, 24),
      compactCount: compactLogs.length,
      rawCount: logs.length,
      fallbackCreationDate
    });
  } catch (error) {
    console.warn('[SBI Profile] Journal compte indisponible :', error);
    list.innerHTML = renderAccountLogsUnavailable(fallbackCreationDate);
  }
}

function renderAccountLogsReadOnlyCreation(fallbackCreationDate) {
  return `
    <li class="sbi-profile-activity-entry" style="line-height:1.7;">
      <strong style="color:var(--text-main, #111827);">Création du compte</strong>
      <span style="color:var(--text-muted, #6b7280);"> · ${escapeHTML(fallbackCreationDate)}</span>
    </li>
  `;
}

function renderAccountLogsLoading() {
  return `
    <li style="
      list-style:none;
      padding:0.95rem 1rem;
      border:1px solid var(--sbi-profile-activity-border, rgba(255,255,255,0.08));
      border-radius:12px;
      background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.035));
      color:var(--text-muted);
    ">
      Chargement du journal compte...
    </li>
  `;
}

function renderAccountLogsEmpty(fallbackCreationDate) {
  return `
    <li style="
      list-style:none;
      padding:1rem;
      border:1px solid var(--sbi-profile-activity-border, rgba(255,255,255,0.08));
      border-radius:12px;
      background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.035));
    ">
      <div style="display:flex; justify-content:space-between; gap:0.85rem; flex-wrap:wrap;">
        <strong style="color:#fff;">Journal du compte</strong>
        <span style="color:var(--text-muted); font-size:0.78rem;">Création · ${escapeHTML(fallbackCreationDate)}</span>
      </div>
      <p style="margin:0.65rem 0 0; color:var(--text-muted); font-size:0.84rem; line-height:1.5;">
        Aucun journal compte détaillé pour le moment.
      </p>
    </li>
  `;
}

function renderAccountLogsUnavailable(fallbackCreationDate) {
  return `
    <li style="
      list-style:none;
      padding:1rem;
      border:1px solid rgba(251,188,4,0.18);
      border-left:3px solid #fbbc04;
      border-radius:12px;
      background:rgba(251,188,4,0.055);
    ">
      <div style="display:flex; justify-content:space-between; gap:0.85rem; flex-wrap:wrap;">
        <strong style="color:#fff;">Journal du compte</strong>
        <span style="color:var(--text-muted); font-size:0.78rem;">Création · ${escapeHTML(fallbackCreationDate)}</span>
      </div>
      <p style="margin:0.65rem 0 0; color:#fbbc04; font-size:0.84rem; line-height:1.5;">
        Journal compte indisponible pour le moment.
      </p>
    </li>
  `;
}

function renderAccountLogsPanel({ logs = [], compactCount = 0, rawCount = 0, fallbackCreationDate = 'Date inconnue' }) {
  const visibleCount = logs.length;
  const hiddenCount = Math.max(compactCount - visibleCount, 0);
  const hiddenLabel = hiddenCount > 0
    ? ` · ${hiddenCount} entrée${hiddenCount > 1 ? 's' : ''} plus ancienne${hiddenCount > 1 ? 's' : ''} masquée${hiddenCount > 1 ? 's' : ''}`
    : '';

  return `
    <li style="
      list-style:none;
      margin:0;
      padding:0;
    ">
      <div style="
        border:1px solid var(--sbi-profile-activity-border, rgba(255,255,255,0.08));
        border-radius:14px;
        background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.032));
        overflow:hidden;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          gap:0.85rem;
          flex-wrap:wrap;
          align-items:flex-start;
          padding:0.95rem 1rem;
          border-bottom:1px solid rgba(255,255,255,0.08);
          background:rgba(0,0,0,0.18);
        ">
          <div>
            <strong style="display:block; color:#fff; font-size:0.94rem;">Journal du compte</strong>
            <span style="display:block; color:var(--text-muted); font-size:0.78rem; margin-top:0.22rem;">
              Création · ${escapeHTML(fallbackCreationDate)}
            </span>
          </div>
          <span style="
            color:#dbe5ff;
            background:rgba(42,87,255,0.12);
            border:1px solid rgba(42,87,255,0.24);
            border-radius:999px;
            padding:0.35rem 0.6rem;
            font-size:0.72rem;
            font-weight:800;
          ">
            ${visibleCount}/${compactCount} affichées
          </span>
        </div>

        <div style="
          padding:0.85rem 0.85rem 0.15rem;
          max-height:min(52vh, 520px);
          overflow-y:auto;
          overscroll-behavior:contain;
          scrollbar-width:thin;
        ">
          <ul style="margin:0; padding:0;">
            ${logs.map(renderAccountLogItem).join('')}
          </ul>
        </div>

        <div style="
          padding:0.7rem 1rem;
          border-top:1px solid rgba(255,255,255,0.07);
          color:var(--text-muted);
          font-size:0.74rem;
          line-height:1.45;
          background:rgba(0,0,0,0.12);
        ">
          ${rawCount} log${rawCount > 1 ? 's' : ''} lu${rawCount > 1 ? 's' : ''} · ${compactCount} entrée${compactCount > 1 ? 's' : ''} après regroupement${hiddenLabel}
        </div>
      </div>
    </li>
  `;
}

function normalizePreparationState(value) {
  return Object.prototype.hasOwnProperty.call(ACCOUNT_PREPARATION_LABELS, value) ? value : 'not_prepared';
}

function hasFinalizedFirstAccess(data = {}) {
  return Boolean(
    data.accountStatus?.firstLoginCompleted === true
    || data.accountStatus?.firstLoginAt
    || data.firstLoginAt
    || data.accountStatus?.lastLoginAt
    || data.lastLoginAt
    || data.accountStatus?.activationState === 'active'
    || data.activationState === 'active'
  );
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
    return 'Adresse inexistante ou inaccessible. Corrigez l’adresse avant de renvoyer une finalisation.';
  }

  if (raw.includes('mailbox full') || raw.includes('quota')) {
    return 'Boîte mail pleine ou temporairement indisponible. Vérifiez l’adresse avant de relancer.';
  }

  if (raw.includes('blocked') || raw.includes('spam') || raw.includes('complaint')) {
    return 'Adresse bloquée ou refusée. Corrigez l’adresse avant de renvoyer une finalisation.';
  }

  return 'Adresse rejetée par le serveur email. Corrigez l’adresse avant de renvoyer une finalisation.';
}

function truncateTechnicalDetail(value = '', maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function getFinalizationEmailIssue(data = {}) {
  const accountStatus = data.accountStatus || {};
  const issueCode = accountStatus.finalizationIssueCode || '';
  const issueMessage = accountStatus.finalizationIssueMessage || '';
  const issueEvent = accountStatus.finalizationIssueEvent || '';
  const email = data.email || '';

  if (issueCode === 'email_bounced') {
    return {
      code: 'email_bounced',
      label: 'Email rejeté',
      detail: getFriendlyBounceDetail(issueMessage),
      technicalDetail: truncateTechnicalDetail(issueMessage),
      tone: '#ff4a4a',
      blocking: true,
      event: issueEvent
    };
  }

  if (issueCode === 'invalid_email' || !isEmailSyntaxValid(email)) {
    return {
      code: 'invalid_email',
      label: 'Email invalide',
      detail: issueMessage || 'Adresse email invalide ou manquante. Corrigez l’adresse avant de relancer la finalisation.',
      tone: '#ff4a4a',
      blocking: true,
      event: issueEvent
    };
  }

  const suggestion = getSuspiciousEmailSuggestion(email);
  if (suggestion) {
    return {
      code: 'suspicious_email',
      label: 'Email suspect',
      detail: `Le domaine de l’adresse semble suspect. Vérifiez l’adresse avant relance, possible : ${suggestion}.`,
      tone: '#fbbc04',
      blocking: false,
      suggestion
    };
  }

  return null;
}

function getFinalizationInfo(data = {}) {
  const finalized = hasFinalizedFirstAccess(data);
  const accountStatus = data.accountStatus || {};
  const inviteCount = Number(accountStatus.finalizationInviteCount || 0);
  const reminderCount = Number(accountStatus.reminderCount || 0);
  const lastInviteAt = accountStatus.finalizationInviteSentAt || null;
  const lastReminderAt = accountStatus.lastReminderSentAt || null;
  const escalationAt = accountStatus.finalizationEscalationAt || null;
  const escalationResolvedAt = accountStatus.finalizationEscalationResolvedAt || null;
  const escalationResolutionNote = accountStatus.finalizationEscalationResolutionNote || '';
  const escalationResolvedByEmail = accountStatus.finalizationEscalationResolvedByEmail || '';
  const issueCode = accountStatus.finalizationIssueCode || '';
  const issueMessage = accountStatus.finalizationIssueMessage || '';
  const lastAccessEmailAt = accountStatus.lastAccessEmailSentAt || accountStatus.passwordResetSentAt || accountStatus.invitationSentAt || null;
  const lastSignalMs = Math.max(
    toMillis(lastReminderAt),
    toMillis(lastInviteAt),
    toMillis(lastAccessEmailAt)
  );
  const isOldFinalizationLink = Boolean(lastSignalMs && Date.now() - lastSignalMs >= 48 * 60 * 60 * 1000);
  const emailIssue = getFinalizationEmailIssue(data);

  if (finalized) {
    return {
      finalized,
      label: 'Compte finalisé',
      detail: formatSbiDate(data.accountStatus?.firstLoginAt || data.firstLoginAt || data.accountStatus?.lastLoginAt || data.lastLoginAt || data.accountStatus?.firstLoginCompletedAt, 'Première connexion validée'),
      tone: '#2ed573',
      inviteCount,
      lastInviteAt
    };
  }

  if (emailIssue) {
    return {
      finalized,
      label: emailIssue.label,
      detail: emailIssue.detail,
      tone: emailIssue.tone,
      inviteCount,
      reminderCount,
      lastInviteAt,
      lastReminderAt,
      issueCode: emailIssue.code,
      issueMessage: emailIssue.detail,
      issueTechnicalDetail: emailIssue.technicalDetail || '',
      issueEvent: emailIssue.event || '',
      needsEmailCorrection: emailIssue.blocking,
      needsEmailVerification: !emailIssue.blocking
    };
  }

  if (escalationAt && !escalationResolvedAt) {
    return {
      finalized,
      label: 'Contact direct requis',
      detail: `Finalisation bloquée : 3 relances envoyées. Dernière relance : ${formatSbiDate(lastReminderAt || escalationAt, 'date inconnue')}`,
      tone: '#ff4a4a',
      inviteCount,
      reminderCount,
      lastInviteAt,
      lastReminderAt,
      escalationAt,
      escalationResolvedAt,
      needsDirectContact: true
    };
  }

  if (escalationAt && escalationResolvedAt) {
    return {
      finalized,
      label: 'Contact direct traité',
      detail: `Alerte traitée le ${formatSbiDate(escalationResolvedAt, 'date inconnue')}`,
      tone: '#2ed573',
      inviteCount,
      reminderCount,
      lastInviteAt,
      lastReminderAt,
      escalationAt,
      escalationResolvedAt,
      escalationResolutionNote,
      escalationResolvedByEmail,
      needsDirectContact: false
    };
  }

  if (isOldFinalizationLink) {
    return {
      finalized,
      label: 'Lien ancien',
      detail: 'Dernier lien envoyé il y a plus de 48h. Renvoyer une finalisation est recommandé si le compte n’a jamais été activé.',
      tone: '#fbbc04',
      inviteCount,
      reminderCount,
      lastInviteAt,
      lastReminderAt,
      lastAccessEmailAt,
      escalationAt,
      linkLikelyOld: true
    };
  }

  return {
    finalized,
    label: 'Finalisation en attente',
    detail: lastReminderAt
      ? `Dernière relance auto : ${formatSbiDate(lastReminderAt, 'date inconnue')}`
      : lastInviteAt
        ? `Dernière invitation : ${formatSbiDate(lastInviteAt, 'date inconnue')}`
        : 'Aucune relance de finalisation enregistrée',
    tone: '#fbbc04',
    inviteCount,
    reminderCount,
    lastInviteAt,
    lastReminderAt,
    lastAccessEmailAt,
    escalationAt
  };
}

function renderAccountActionsPanel({ db, uid, data = {}, reloadProfile }) {
  const list = document.getElementById('prof-activity-list');
  const group = list?.closest?.('.data-group');
  if (!group || !uid) return;

  let panel = document.getElementById('prof-account-actions-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'prof-account-actions-panel';
    group.insertBefore(panel, list);
  }

  const currentState = normalizePreparationState(data.accountStatus?.preparationState || data.preparationState || 'not_prepared');
  const currentNote = getAccountInternalNote(data);
  const noteMeta = getAccountInternalNoteMeta(data);
  const finalizationInfo = getFinalizationInfo(data);
  const promotionName = data.promotionName || '';
  const promotionStatusValue = data.promotionStatus || '';
  const notePreviewHtml = currentNote
    ? escapeHTML(currentNote).replace(/\n/g, '<br>')
    : 'Aucune note interne enregistrée pour ce compte.';

  panel.innerHTML = `
    <div style="
      margin:0 0 1rem 0;
      padding:1rem;
      border:1px solid rgba(42,87,255,0.18);
      border-radius:12px;
      background:rgba(42,87,255,0.045);
    ">
      <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; align-items:flex-start; margin-bottom:0.85rem;">
        <div>
          <strong style="color:#fff;">Actions compte</strong>
          <p style="margin:0.25rem 0 0; color:var(--text-muted); font-size:0.82rem; line-height:1.45;">
            Suivi manuel, notes internes, accès et finalisation du compte.
          </p>
        </div>
        <div style="display:flex; gap:0.55rem; flex-wrap:wrap; justify-content:flex-end;">
          <button id="prof-send-finalization-btn" type="button" style="
            border:1px solid rgba(42,87,255,0.55);
            background:rgba(42,87,255,0.12);
            color:#dbe5ff;
            border-radius:999px;
            padding:0.55rem 0.85rem;
            font-weight:900;
            cursor:pointer;
          ">Renvoyer finalisation</button>
          <button id="prof-resend-access-btn" type="button" style="
            border:1px solid rgba(251,188,4,0.45);
            background:rgba(251,188,4,0.10);
            color:#fbbc04;
            border-radius:999px;
            padding:0.55rem 0.85rem;
            font-weight:800;
            cursor:pointer;
          ">Reset accès</button>
        </div>
      </div>

      <div id="prof-promotion-assignment-panel" style="
        margin:0 0 0.85rem 0;
        padding:0.8rem 0.9rem;
        border:1px solid rgba(42,87,255,0.18);
        border-radius:10px;
        background:rgba(42,87,255,0.06);
      ">
        <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; align-items:center; margin-bottom:0.55rem;">
          <strong style="color:#dbe5ff; font-size:0.88rem;">Promotion</strong>
          <span id="prof-current-promotion-label" style="color:${promotionName ? '#9fb2ff' : 'var(--text-muted)'}; font-size:0.78rem; font-weight:800;">
            ${promotionName ? escapeHTML(promotionName) : 'Aucune promotion affectée'}
          </span>
        </div>
        <p style="margin:0 0 0.65rem 0; color:var(--text-muted); font-size:0.78rem; line-height:1.45;">
          ${promotionName ? `Statut promotion : ${escapeHTML(promotionStatusValue || 'active')}` : 'Affectation à faire directement depuis cette fiche élève.'}
        </p>
        ${isStudentRole(data) ? `
          <div style="display:grid; grid-template-columns:minmax(180px,1fr) auto; gap:0.6rem; align-items:end;">
            <div>
              <label style="display:block; color:var(--text-muted); font-size:0.72rem; font-weight:900; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.35rem;">Affectation</label>
              <select id="prof-promotion-select" data-current-promotion-id="${escapeHTML(data.promotionId || '')}" style="
                width:100%;
                box-sizing:border-box;
                padding:0.7rem 0.75rem;
                background:#111827;
                color:#fff;
                border:1px solid rgba(255,255,255,0.12);
                border-radius:8px;
                outline:none;
              ">
                <option value="">Chargement des promotions...</option>
              </select>
            </div>
            <button id="prof-save-promotion-btn" type="button" style="
              border:1px solid rgba(42,87,255,0.55);
              background:rgba(42,87,255,0.14);
              color:#dbe5ff;
              border-radius:8px;
              padding:0.72rem 0.85rem;
              font-weight:900;
              cursor:pointer;
              white-space:nowrap;
            ">Sauvegarder</button>
          </div>
          <p id="prof-promotion-status" style="margin:0.45rem 0 0; color:var(--text-muted); font-size:0.76rem; min-height:1rem;"></p>
        ` : `
          <p style="margin:0; color:var(--text-muted); font-size:0.78rem; line-height:1.45;">
            L’affectation promotion est disponible uniquement sur les comptes élèves.
          </p>
        `}
      </div>

      <div style="
        margin:0 0 0.85rem 0;
        padding:0.8rem 0.9rem;
        border:1px solid rgba(255,255,255,0.10);
        border-radius:10px;
        background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.035));
      ">
        <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; align-items:center;">
          <strong style="color:${finalizationInfo.tone}; font-size:0.88rem;">${escapeHTML(finalizationInfo.label)}</strong>
          <span style="color:var(--text-muted); font-size:0.76rem;">Manuelles : ${finalizationInfo.inviteCount} · Auto : ${finalizationInfo.reminderCount || 0}/3</span>
        </div>
        <p style="margin:0.35rem 0 0; color:var(--text-muted); font-size:0.8rem; line-height:1.45;">
          ${escapeHTML(finalizationInfo.detail)}
        </p>
      </div>

      ${finalizationInfo.needsEmailCorrection ? `
        <div style="
          margin:0 0 0.85rem 0;
          padding:0.95rem 1rem;
          border:1px solid rgba(255,74,74,0.38);
          border-left:4px solid #ff4a4a;
          border-radius:12px;
          background:rgba(255,74,74,0.09);
        ">
          <strong style="display:block; color:#ff9b9b; font-size:0.9rem; margin-bottom:0.35rem;">
            ${escapeHTML(finalizationInfo.label)} : correction requise
          </strong>
          <p style="margin:0; color:#ffd6d6; font-size:0.82rem; line-height:1.5;">
            ${escapeHTML(finalizationInfo.detail)}
          </p>
          ${finalizationInfo.issueTechnicalDetail ? `
            <details style="margin-top:0.7rem; color:rgba(255,214,214,0.74); font-size:0.74rem; line-height:1.45;">
              <summary style="cursor:pointer; font-weight:800; color:#ffb4b4;">Détail technique</summary>
              <p style="margin:0.45rem 0 0; word-break:break-word;">${escapeHTML(finalizationInfo.issueTechnicalDetail)}</p>
            </details>
          ` : ''}
        </div>
      ` : ''}

      ${finalizationInfo.needsEmailVerification ? `
        <div style="
          margin:0 0 0.85rem 0;
          padding:0.9rem 1rem;
          border:1px solid rgba(251,188,4,0.32);
          border-left:4px solid #fbbc04;
          border-radius:12px;
          background:rgba(251,188,4,0.08);
        ">
          <strong style="display:block; color:#ffe39a; font-size:0.88rem; margin-bottom:0.35rem;">
            Email suspect : vérification recommandée
          </strong>
          <p style="margin:0; color:rgba(255,239,190,0.84); font-size:0.8rem; line-height:1.5;">
            ${escapeHTML(finalizationInfo.detail)}
          </p>
        </div>
      ` : ''}

      ${finalizationInfo.linkLikelyOld ? `
        <div style="
          margin:0 0 0.85rem 0;
          padding:0.9rem 1rem;
          border:1px solid rgba(251,188,4,0.32);
          border-left:4px solid #fbbc04;
          border-radius:12px;
          background:rgba(251,188,4,0.08);
        ">
          <strong style="display:block; color:#ffe39a; font-size:0.88rem; margin-bottom:0.35rem;">
            Lien de finalisation ancien
          </strong>
          <p style="margin:0; color:rgba(255,239,190,0.84); font-size:0.8rem; line-height:1.5;">
            Le dernier lien envoyé date de plus de 48h. Utilisez “Renvoyer finalisation” si l’utilisateur n’a pas activé son accès.
          </p>
        </div>
      ` : ''}

      ${finalizationInfo.needsDirectContact ? `
        <div style="
          margin:0 0 0.85rem 0;
          padding:0.95rem 1rem;
          border:1px solid rgba(255,74,74,0.38);
          border-left:4px solid #ff4a4a;
          border-radius:12px;
          background:rgba(255,74,74,0.09);
        ">
          <strong style="display:block; color:#ff9b9b; font-size:0.9rem; margin-bottom:0.35rem;">
            Finalisation bloquée : contact direct requis
          </strong>
          <p style="margin:0 0 0.75rem; color:#ffd6d6; font-size:0.82rem; line-height:1.5;">
            3 relances automatiques ont été envoyées sans première connexion. Contactez l’élève directement, puis notez l’action réalisée.
          </p>
          <label for="prof-escalation-resolution-note" style="display:block; color:#fff; font-size:0.78rem; font-weight:800; margin-bottom:0.35rem;">
            Note de traitement
          </label>
          <textarea id="prof-escalation-resolution-note" rows="3" placeholder="Ex : Appel effectué, message vocal laissé, relance WhatsApp envoyée..." style="
            width:100%;
            box-sizing:border-box;
            border:1px solid rgba(255,255,255,0.14);
            background:rgba(0,0,0,0.24);
            color:#fff;
            border-radius:10px;
            padding:0.75rem;
            resize:vertical;
            min-height:84px;
            outline:none;
          "></textarea>
          <div style="display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
            <button id="prof-resolve-escalation-btn" type="button" style="
              border:1px solid rgba(255,255,255,0.18);
              background:rgba(255,255,255,0.08);
              color:#fff;
              border-radius:999px;
              padding:0.55rem 0.85rem;
              font-weight:900;
              cursor:pointer;
            ">Marquer contact traité</button>
            <span style="color:rgba(255,214,214,0.76); font-size:0.75rem;">Le compteur Auto reste à 3/3.</span>
          </div>
        </div>
      ` : ''}

      ${(!finalizationInfo.needsDirectContact && finalizationInfo.escalationResolvedAt) ? `
        <div style="
          margin:0 0 0.85rem 0;
          padding:0.9rem 1rem;
          border:1px solid rgba(46,213,115,0.28);
          border-left:4px solid #2ed573;
          border-radius:12px;
          background:rgba(46,213,115,0.08);
        ">
          <strong style="display:block; color:#9ff3bd; font-size:0.88rem; margin-bottom:0.35rem;">
            Contact direct traité
          </strong>
          <p style="margin:0; color:rgba(220,255,232,0.82); font-size:0.8rem; line-height:1.5;">
            Traité le ${escapeHTML(formatSbiDate(finalizationInfo.escalationResolvedAt, 'date inconnue'))}${finalizationInfo.escalationResolvedByEmail ? ` par ${escapeHTML(finalizationInfo.escalationResolvedByEmail)}` : ''}.
          </p>
          ${finalizationInfo.escalationResolutionNote ? `
            <p style="margin:0.55rem 0 0; color:#fff; font-size:0.82rem; line-height:1.5;">
              <strong>Note :</strong> ${escapeHTML(finalizationInfo.escalationResolutionNote)}
            </p>
          ` : ''}
        </div>
      ` : ''}

      <label style="display:block; color:var(--text-muted); font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.35rem;">
        Suivi du compte
      </label>
      <select id="prof-account-preparation-state" style="
        width:100%;
        box-sizing:border-box;
        padding:0.75rem;
        margin-bottom:0.75rem;
        background:#111827;
        color:#fff;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:8px;
        outline:none;
      ">
        ${Object.entries(ACCOUNT_PREPARATION_LABELS).map(([value, label]) => `
          <option value="${escapeHTML(value)}"${value === currentState ? ' selected' : ''}>${escapeHTML(label)}</option>
        `).join('')}
      </select>

      <div id="prof-account-note-preview" style="
        margin:0 0 0.75rem 0;
        padding:0.85rem;
        border:1px solid rgba(255,255,255,0.10);
        border-radius:10px;
        background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.035));
      ">
        <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.35rem;">
          <strong style="color:#fff; font-size:0.86rem;">Note enregistrée</strong>
          <span id="prof-account-note-meta" style="color:var(--text-muted); font-size:0.74rem;">${escapeHTML(noteMeta)}</span>
        </div>
        <p id="prof-account-note-preview-text" style="margin:0; color:#dbe5ff; font-size:0.84rem; line-height:1.55; white-space:normal;">
          ${notePreviewHtml}
        </p>
      </div>

      <label style="display:block; color:var(--text-muted); font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.35rem;">
        Modifier la note interne
      </label>
      <textarea id="prof-account-note" rows="4" maxlength="2000" style="
        width:100%;
        box-sizing:border-box;
        min-height:92px;
        padding:0.85rem;
        background:#0b1020;
        color:#fff;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:8px;
        resize:vertical;
        outline:none;
        font-family:inherit;
      " placeholder="Ajouter une note interne sur ce compte...">${escapeHTML(currentNote)}</textarea>
      <p style="margin:0.4rem 0 0; color:var(--text-muted); font-size:0.74rem; line-height:1.35;">
        La note reste visible dans le bloc “Note enregistrée” après sauvegarde.
      </p>

      <div style="display:flex; justify-content:flex-end; gap:0.75rem; flex-wrap:wrap; margin-top:0.85rem;">
        <span id="prof-account-actions-status" style="margin-right:auto; color:var(--text-muted); font-size:0.8rem; align-self:center;"></span>
        <button id="prof-save-account-followup-btn" type="button" style="
          border:0;
          background:var(--accent-blue, #2A57FF);
          color:#fff;
          border-radius:8px;
          padding:0.65rem 1rem;
          font-weight:900;
          cursor:pointer;
        ">Sauvegarder le suivi</button>
      </div>
    </div>
  `;

  const status = panel.querySelector('#prof-account-actions-status');
  const saveButton = panel.querySelector('#prof-save-account-followup-btn');
  const promotionSelect = panel.querySelector('#prof-promotion-select');
  const promotionSaveButton = panel.querySelector('#prof-save-promotion-btn');
  const promotionStatusEl = panel.querySelector('#prof-promotion-status');
  const promotionLabel = panel.querySelector('#prof-current-promotion-label');
  const resendButton = panel.querySelector('#prof-resend-access-btn');
  const finalizationButton = panel.querySelector('#prof-send-finalization-btn');
  const resolveEscalationButton = panel.querySelector('#prof-resolve-escalation-btn');
  const noteTextarea = panel.querySelector('#prof-account-note');
  const notePreviewText = panel.querySelector('#prof-account-note-preview-text');
  const notePreviewMeta = panel.querySelector('#prof-account-note-meta');

  if (promotionSelect) {
    loadActivePromotionsForProfile(db).then((rows) => {
      const currentPromotionId = promotionSelect.dataset.currentPromotionId || '';
      promotionSelect.innerHTML = renderPromotionOptions(rows, currentPromotionId);
      if (!rows.length && promotionStatusEl) {
        promotionStatusEl.style.color = 'var(--text-muted)';
        promotionStatusEl.textContent = 'Aucune promotion active disponible.';
      }
    });
  }

  promotionSaveButton?.addEventListener('click', async () => {
    const promotionId = promotionSelect?.value || '';
    const currentPromotionId = promotionSelect?.dataset.currentPromotionId || '';

    if (promotionId === currentPromotionId) {
      if (promotionStatusEl) {
        promotionStatusEl.style.color = 'var(--text-muted)';
        promotionStatusEl.textContent = 'Aucun changement à sauvegarder.';
      }
      return;
    }

    promotionSaveButton.disabled = true;
    promotionSaveButton.style.opacity = '0.65';
    if (promotionStatusEl) {
      promotionStatusEl.style.color = 'var(--text-muted)';
      promotionStatusEl.textContent = 'Affectation en cours...';
    }

    try {
      await adminUpdateUserAccountCallable({ uid, promotionId });
      const selectedLabel = promotionSelect?.selectedOptions?.[0]?.textContent || '';
      if (promotionSelect) promotionSelect.dataset.currentPromotionId = promotionId;
      if (promotionLabel) {
        promotionLabel.textContent = promotionId ? selectedLabel : 'Aucune promotion affectée';
        promotionLabel.style.color = promotionId ? '#9fb2ff' : 'var(--text-muted)';
      }
      if (promotionStatusEl) {
        promotionStatusEl.style.color = '#2ed573';
        promotionStatusEl.textContent = promotionId ? 'Promotion affectée.' : 'Promotion retirée.';
      }
      await reloadProfile?.(uid);
    } catch (error) {
      console.warn('[SBI Profile] Affectation promotion impossible :', error);
      if (promotionStatusEl) {
        promotionStatusEl.style.color = '#ff4a4a';
        promotionStatusEl.textContent = getCallableUiMessage(error, 'Affectation impossible.');
      }
    } finally {
      promotionSaveButton.disabled = false;
      promotionSaveButton.style.opacity = '';
    }
  });

  if ((finalizationInfo.finalized || finalizationInfo.needsEmailCorrection) && finalizationButton) {
    finalizationButton.disabled = true;
    finalizationButton.style.opacity = '0.55';
    finalizationButton.style.cursor = 'not-allowed';
    finalizationButton.title = finalizationInfo.needsEmailCorrection
      ? 'Corrigez l’adresse email avant de renvoyer une finalisation.'
      : 'Le compte a déjà finalisé sa première connexion.';
  }

  saveButton?.addEventListener('click', async () => {
    const preparationState = panel.querySelector('#prof-account-preparation-state')?.value || 'not_prepared';
    let accountNote = noteTextarea?.value || '';

    if (currentNote && !accountNote.trim()) {
      accountNote = currentNote;
      if (noteTextarea) noteTextarea.value = currentNote;
    }

    saveButton.disabled = true;
    saveButton.style.opacity = '0.65';
    if (status) {
      status.style.color = 'var(--text-muted)';
      status.textContent = 'Sauvegarde...';
    }

    try {
      await adminUpdateUserAccountCallable({ uid, preparationState, accountNote });

      if (notePreviewText) {
        notePreviewText.innerHTML = accountNote.trim()
          ? escapeHTML(accountNote).replace(/\n/g, '<br>')
          : 'Aucune note interne enregistrée pour ce compte.';
      }
      if (notePreviewMeta) notePreviewMeta.textContent = 'Mis à jour à l’instant';
      if (status) {
        status.style.color = '#2ed573';
        status.textContent = 'Suivi sauvegardé. Note accessible ci-dessus.';
      }
    } catch (error) {
      console.warn('[SBI Profile] Sauvegarde suivi compte impossible :', error);
      if (status) {
        status.style.color = '#ff4a4a';
        status.textContent = getCallableUiMessage(error, 'Sauvegarde impossible.');
      }
    } finally {
      saveButton.disabled = false;
      saveButton.style.opacity = '';
    }
  });

  resolveEscalationButton?.addEventListener('click', async () => {
    const resolutionNote = panel.querySelector('#prof-escalation-resolution-note')?.value?.trim() || '';

    resolveEscalationButton.disabled = true;
    resolveEscalationButton.style.opacity = '0.65';

    if (status) {
      status.style.color = 'var(--text-muted)';
      status.textContent = 'Traitement de l’alerte...';
    }

    try {
      await adminResolveFinalizationEscalationCallable({
        uid,
        note: resolutionNote
      });

      if (status) {
        status.style.color = '#2ed573';
        status.textContent = 'Alerte marquée comme traitée.';
      }

      await reloadProfile?.(uid);
    } catch (error) {
      console.warn('[SBI Profile] Traitement alerte finalisation impossible :', error);
      if (status) {
        status.style.color = '#ff4a4a';
        status.textContent = getCallableUiMessage(error, 'Traitement impossible.');
      }
    } finally {
      resolveEscalationButton.disabled = false;
      resolveEscalationButton.style.opacity = '';
    }
  });

  finalizationButton?.addEventListener('click', async () => {
    if (finalizationInfo.finalized || finalizationInfo.needsEmailCorrection) return;

    const confirmed = window.confirm('Renvoyer une invitation de finalisation à ce compte ?');
    if (!confirmed) return;

    finalizationButton.disabled = true;
    finalizationButton.style.opacity = '0.65';
    if (status) {
      status.style.color = 'var(--text-muted)';
      status.textContent = 'Envoi de l’invitation de finalisation...';
    }

    try {
      await adminSendFinalizationInviteCallable({ uid });
      if (status) {
        status.style.color = '#2ed573';
        status.textContent = 'Invitation de finalisation envoyée.';
      }
      await reloadProfile?.(uid);
    } catch (error) {
      console.warn('[SBI Profile] Invitation de finalisation impossible :', error);
      if (status) {
        status.style.color = '#ff4a4a';
        status.textContent = getCallableUiMessage(error, 'Envoi impossible.');
      }
    } finally {
      finalizationButton.disabled = false;
      finalizationButton.style.opacity = '';
    }
  });

  resendButton?.addEventListener('click', async () => {
    const confirmed = window.confirm('Renvoyer un email d’accès / réinitialisation à ce compte ?');
    if (!confirmed) return;

    resendButton.disabled = true;
    resendButton.style.opacity = '0.65';
    if (status) {
      status.style.color = 'var(--text-muted)';
      status.textContent = 'Envoi du lien...';
    }

    try {
      await adminSendPasswordResetCallable({ uid });
      if (status) {
        status.style.color = '#2ed573';
        status.textContent = 'Lien envoyé.';
      }
      await reloadProfile?.(uid);
    } catch (error) {
      console.warn('[SBI Profile] Renvoi accès impossible :', error);
      if (status) {
        status.style.color = '#ff4a4a';
        status.textContent = getCallableUiMessage(error, 'Envoi impossible.');
      }
    } finally {
      resendButton.disabled = false;
      resendButton.style.opacity = '';
    }
  });
}

function getAccountInternalNote(data = {}) {
  return data.adminNotes?.accountNote
    || data.adminNotes?.preparationNote
    || '';
}

function getAccountInternalNoteMeta(data = {}) {
  const updatedAt = data.adminNotes?.updatedAt || data.adminNotes?.accountNoteUpdatedAt || null;
  const updatedBy = data.adminNotes?.updatedByName || data.adminNotes?.updatedByEmail || data.adminNotes?.updatedBy || '';
  const dateLabel = formatSbiDate(updatedAt, 'Aucune mise à jour');

  if (!updatedAt && !updatedBy) return 'Aucune note enregistrée';
  if (updatedBy) return `${dateLabel} · ${updatedBy}`;
  return dateLabel;
}

function getCallableUiMessage(error, fallback) {
  const raw = error?.message || error?.details?.message || fallback;
  return String(raw).replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || fallback;
}

function compactAccountLogs(logs = []) {
  const compact = [];
  let previousLoginMs = 0;
  let skippedLoginCount = 0;

  logs.forEach((log) => {
    const type = log?.type || '';
    const createdAtMs = toMillis(log?.createdAt);

    if (type === 'account.login_tracked') {
      if (previousLoginMs && Math.abs(previousLoginMs - createdAtMs) < (30 * 60 * 1000)) {
        skippedLoginCount += 1;
        return;
      }

      previousLoginMs = createdAtMs;
    }

    compact.push(log);
  });

  if (skippedLoginCount > 0 && compact.length > 0) {
    compact[0] = {
      ...compact[0],
      compactedLoginCount: skippedLoginCount
    };
  }

  return compact;
}

function renderAccountLogItem(log = {}) {
  const meta = getAccountLogMeta(log.type);
  const date = formatSbiDate(log.createdAt, 'Date inconnue');
  const actor = getAccountLogActor(log);
  const details = getAccountLogDetails(log);
  const compactNote = log.compactedLoginCount ? ` · ${log.compactedLoginCount} connexion(s) rapprochée(s) masquée(s)` : '';

  return `
    <li style="
      list-style:none;
      margin:0 0 0.75rem 0;
      padding:0.85rem 0.95rem;
      border:1px solid var(--sbi-profile-activity-border, rgba(255,255,255,0.08));
      border-left:3px solid ${meta.color};
      border-radius:10px;
      background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.035));
    ">
      <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; align-items:flex-start;">
        <strong style="color:#fff; font-size:0.92rem;">${escapeHTML(meta.label)}</strong>
        <span style="color:var(--text-muted); font-size:0.78rem;">${escapeHTML(date)}</span>
      </div>
      <div style="margin-top:0.35rem; color:var(--text-muted); font-size:0.82rem; line-height:1.55;">
        ${escapeHTML(actor + compactNote)}
      </div>
      ${details ? `<div style="margin-top:0.35rem; color:#dbe5ff; font-size:0.8rem; line-height:1.5;">${escapeHTML(details)}</div>` : ''}
    </li>
  `;
}

function getAccountLogMeta(type = '') {
  const map = {
    'account.created': {
      label: 'Compte créé',
      color: '#2A57FF'
    },
    'account.password_reset_sent': {
      label: 'Reset mot de passe envoyé',
      color: '#fbbc04'
    },
    'account.finalization_invite_sent': {
      label: 'Invitation finalisation envoyée',
      color: '#2A57FF'
    },
    'account.finalization_reminder_sent': {
      label: 'Relance automatique envoyée',
      color: '#fbbc04'
    },
    'account.finalization_escalation_required': {
      label: 'Contact direct requis',
      color: '#ff4a4a'
    },
    'account.finalization_reminder_skipped': {
      label: 'Relance non envoyée',
      color: '#ff4a4a'
    },
    'account.email_bounced': {
      label: 'Email rejeté par Brevo',
      color: '#ff4a4a'
    },
    'account.email_bounce_unmatched': {
      label: 'Bounce Brevo sans compte',
      color: '#fbbc04'
    },
    'account.finalization_escalation_resolved': {
      label: 'Contact direct traité',
      color: '#2ed573'
    },
    'account.public_password_reset_requested': {
      label: 'Demande mot de passe oublié',
      color: '#fbbc04'
    },
    'account.login_tracked': {
      label: 'Connexion détectée',
      color: '#2ed573'
    },
    'account.email_changed': {
      label: 'Email modifié',
      color: '#2A57FF'
    },
    'account.updated': {
      label: 'Compte mis à jour',
      color: '#2A57FF'
    },
    'account.followup_updated': {
      label: 'Suivi compte mis à jour',
      color: '#2A57FF'
    },
    'account.promotion_updated': {
      label: 'Promotion élève modifiée',
      color: '#2A57FF'
    },
    'account.deleted': {
      label: 'Compte supprimé',
      color: '#ff4a4a'
    },
    'account.formation_indexes_synced': {
      label: 'Accès formations synchronisés',
      color: '#2A57FF'
    }
  };

  return map[type] || {
    label: type ? type.replace(/^account\./, '').replace(/_/g, ' ') : 'Action compte',
    color: '#8a93a6'
  };
}

function getAccountLogActor(log = {}) {
  if (log.actorUid === 'public') {
    return `Source : page publique${log.source ? ` · ${log.source}` : ''}`;
  }

  if (log.actorEmail) {
    return `Action par : ${log.actorEmail}`;
  }

  if (log.actorUid) {
    return `Action par UID : ${log.actorUid}`;
  }

  return 'Source : système SBI';
}

function getAccountLogDetails(log = {}) {
  const details = [];

  if (log.type === 'account.finalization_invite_sent') details.push('Email finalisation envoyé');
  if (log.type === 'account.finalization_reminder_sent') details.push('Relance automatique envoyée');
  if (log.type === 'account.finalization_reminder_skipped' && log.reason === 'invalid-email') details.push('Email invalide ou manquant');
  if (log.type === 'account.email_bounced') details.push('Retour Brevo : email rejeté');
  if (log.event) details.push(`Événement : ${log.event}`);
  if (log.reason && log.type === 'account.email_bounced') details.push(`Raison : ${log.reason}`);
  if (log.type === 'account.finalization_escalation_required') details.push('Alerte générée après 3 relances');
  if (log.type === 'account.finalization_escalation_resolved' && log.note) details.push(`Note : ${log.note}`);
  if (log.emailSent === true) details.push('Email envoyé');
  if (log.emailSent === false) details.push('Email non envoyé');
  if (log.page) details.push(`Page : ${log.page}`);
  if (log.targetRole) details.push(`Rôle : ${log.targetRole}`);
  if (log.updated !== undefined) details.push(`Éléments mis à jour : ${log.updated}`);
  if (log.skipped !== undefined) details.push(`Éléments inchangés : ${log.skipped}`);

  const changes = log.changes || {};
  if (changes.preparationState?.afterLabel) details.push(`Suivi : ${changes.preparationState.afterLabel}`);
  if (changes.accountNote) details.push('Note interne modifiée');
  if (changes.promotion) {
    const beforePromotion = changes.promotion.before?.name || 'Aucune promotion';
    const afterPromotion = changes.promotion.after?.name || 'Aucune promotion';
    details.push(`Promotion : ${beforePromotion} → ${afterPromotion}`);
  }

  return details.join(' · ');
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

function formatSbiDate(value, fallback = 'Non renseigné') {
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
