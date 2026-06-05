import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { app } from '/js/firebase-init.js';
import { escapeHTML, getDisplayName, SVG_EDIT } from './profile-utils.js';
import { roleOf } from '/js/learning-access.js?v=8.0P.167.205';
import { maybeMigrateVisibleLegacyAvatar } from './profile-avatar-cropper.js';
import { updateProfilePresenceStatus } from './profile-presence.js';
import {
  recomputeAccountCompleteness,
  renderCompletenessPanelHtml,
  renderCompletenessBadge,
  injectCompletenessBadgeStyles
} from '/js/account-completeness.js?v=8.0P.167.304';

const functionsInstance = getFunctions(app, 'europe-west1');
const adminUpdateUserAccountCallable = httpsCallable(functionsInstance, 'adminUpdateUserAccount');
const adminSendPasswordResetCallable = httpsCallable(functionsInstance, 'adminSendPasswordReset');
const adminSendFinalizationInviteCallable = httpsCallable(functionsInstance, 'adminSendFinalizationInvite');
const adminResolveFinalizationEscalationCallable = httpsCallable(functionsInstance, 'adminResolveFinalizationEscalation');

function injectProfileRoleBadgeStyles() {
  if (document.getElementById('sbi-profile-role-badge-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-profile-role-badge-style';
  style.textContent = `
    /*
     * GPT2.3 : on garde le visuel original du nom + badge.
     * Correction ciblée : déplacer l'identité du profil professeur
     * dans la zone blanche, hors séparation bleu/blanc du bandeau.
     */
    body.sbi-profile-role-teacher .profile-info {
      transform: translateY(36px);
    }

    body.sbi-profile-role-teacher #prof-name {
      margin-top: 0;
    }

    body.sbi-profile-role-teacher #prof-badge-zone {
      display: inline-flex;
      align-items: center;
      transform: translateY(-1px);
    }

    @media (max-width: 720px) {
      body.sbi-profile-role-teacher .profile-info {
        transform: translateY(24px);
      }
    }
  `;
  document.head.appendChild(style);
}


const ACCOUNT_PREPARATION_LABELS = {
  not_prepared: 'Compte à préparer',
  to_check: 'À vérifier',
  ready: 'Prêt',
  completed: 'Terminé'
};

const STUDENT_FOLLOWUP_STATUS_LABELS = {
  not_started: 'À cadrer',
  watching: 'À surveiller',
  in_progress: 'Suivi en cours',
  blocked: 'Point bloquant',
  ok: 'OK'
};

const STUDENT_FOLLOWUP_PRIORITY_LABELS = {
  normal: 'Normale',
  medium: 'À suivre',
  high: 'Prioritaire',
  urgent: 'Urgent'
};

function normalizeProfileRoleForDisplay(profile = {}) {
  if (profile?.isGod === true) return 'admin';
  const role = roleOf(profile, profile.role || 'student');
  if (['admin', 'teacher', 'student'].includes(role)) return role;
  const raw = String(profile.role || profile.userRole || profile.type || '').trim().toLowerCase();
  if (['prof', 'professeur', 'teacher'].includes(raw)) return 'teacher';
  if (['admin', 'administrator'].includes(raw)) return 'admin';
  if (['student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(raw)) return 'student';
  return 'student';
}

function isStudentRole(profile = {}) {
  return normalizeProfileRoleForDisplay(profile) === 'student';
}

function isTeacherRole(profile = {}) {
  return normalizeProfileRoleForDisplay(profile) === 'teacher';
}

function isAdminProfileRole(profile = {}) {
  return normalizeProfileRoleForDisplay(profile) === 'admin';
}

function setDisplay(node, visible, displayValue = '') {
  if (!node) return;
  node.style.display = visible ? displayValue : 'none';
}

function safeClosest(node, selector) {
  try {
    return node?.closest?.(selector) || null;
  } catch (_) {
    return null;
  }
}

function getTrackingTabNode() {
  return Array.from(document.querySelectorAll('.p-tab, .student-sub-nav-item')).find((node) => {
    const action = String(node.getAttribute('onclick') || '');
    return action.includes('ptab-tracking') || action.includes('tab-tracking');
  }) || null;
}

function activateDefaultProfileTabIfNeeded(trackingTab) {
  if (!trackingTab?.classList?.contains('active')) return;
  const fallback = Array.from(document.querySelectorAll('.p-tab, .student-sub-nav-item')).find((node) => {
    const action = String(node.getAttribute('onclick') || '');
    return action.includes('ptab-public') || action.includes('tab-overview');
  });
  fallback?.click?.();
}

function setTrackingTabLabel(tab, data = {}) {
  if (!tab) return;
  const role = normalizeProfileRoleForDisplay(data);
  const icon = '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:text-bottom; margin-right:4px;"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';
  if (role === 'teacher') {
    tab.innerHTML = `${icon} Élèves suivis`;
    return;
  }
  if (role === 'student') {
    tab.innerHTML = `${icon} Suivi pédagogique`;
  }
}

function configureTrackingNavigationForRole(data = {}) {
  const trackingTab = getTrackingTabNode();
  const trackingPanel = document.getElementById('ptab-tracking') || document.getElementById('tab-tracking');
  const isAdminProfile = isAdminProfileRole(data);

  setDisplay(trackingTab, !isAdminProfile);
  setDisplay(trackingPanel, !isAdminProfile);

  if (isAdminProfile) {
    activateDefaultProfileTabIfNeeded(trackingTab);
    return;
  }

  setTrackingTabLabel(trackingTab, data);
}

function clearProfileXpUi() {
  [document.getElementById('prof-xp'), document.getElementById('prof-xp-text')].forEach((el) => {
    if (!el) return;
    el.textContent = '';
    el.onclick = null;
    el.style.cursor = '';
    el.removeAttribute('title');
  });

  const fill = document.getElementById('prof-xp-fill');
  if (fill) fill.style.width = '0%';
}

function configureGamificationForRole(data = {}) {
  const showGamification = isStudentRole(data);

  setDisplay(document.getElementById('prof-gamification'), showGamification, 'block');

  const levelEl = document.getElementById('prof-level');
  const xpEl = document.getElementById('prof-xp');
  const levelChip = safeClosest(xpEl, 'div') || safeClosest(levelEl, 'div');
  setDisplay(levelChip, showGamification);

  const xpFill = document.getElementById('prof-xp-fill');
  const xpBar = safeClosest(xpFill, '.xp-bar-bg') || safeClosest(xpFill, '.xp-bar-container');
  setDisplay(xpBar, showGamification);

  const badgesCard = safeClosest(document.querySelector('.sbi-badges-grid'), '.hub-card');
  setDisplay(badgesCard, showGamification);

  if (!showGamification) clearProfileXpUi();
}

function applyRoleSpecificProfileChrome(data = {}) {
  const role = normalizeProfileRoleForDisplay(data);
  document.body.classList.toggle('sbi-profile-role-admin', role === 'admin');
  document.body.classList.toggle('sbi-profile-role-teacher', role === 'teacher');
  document.body.classList.toggle('sbi-profile-role-student', role === 'student');

  configureGamificationForRole(data);
  configureTrackingNavigationForRole(data);
}

function getPromotionLabelForProfile(promotion = {}) {
  return promotion?.name || promotion?.promotionName || 'Promotion sans nom';
}

async function loadPromotionsForProfile(db, { includeArchived = true } = {}) {
  try {
    const snap = await getDocs(query(collection(db, 'promotions')));
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (!includeArchived && data.status === 'archived') return;
      rows.push({ id: docSnap.id, ...data });
    });
    rows.sort((a, b) => {
      const aStart = String(a.startDate || '9999-99-99');
      const bStart = String(b.startDate || '9999-99-99');
      const dateCompare = aStart.localeCompare(bStart);
      if (dateCompare) return dateCompare;
      return getPromotionLabelForProfile(a).localeCompare(getPromotionLabelForProfile(b), 'fr', { sensitivity: 'base' });
    });
    return rows;
  } catch (error) {
    console.warn('[SBI Profile] Promotions non chargées :', error);
    return [];
  }
}

function normalizeProfileSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getPromotionMetaLine(promotion = {}) {
  const parts = [];
  if (promotion.formationName || promotion.formationId) parts.push(promotion.formationName || promotion.formationId);
  const dateLine = [formatSbiDate(promotion.startDate, ''), formatSbiDate(promotion.endDate, '')].filter(Boolean).join(' → ');
  if (dateLine) parts.push(dateLine);
  return parts.join(' · ') || 'Formation / dates non renseignées';
}

export async function renderProfileShell({ db, uid, data, context, reloadProfile }) {
  injectProfileRoleBadgeStyles();
  const displayName = getDisplayName(data, 'Utilisateur Sans Nom');
  const nameEl = document.getElementById('prof-name');

  if (nameEl) {
    // Badge ✗ de complétude à côté du nom : OUTIL ADMIN uniquement (il pointe vers
    // /admin/admin-profile.html). Un élève/prof ne doit JAMAIS le voir — ni sur son
    // propre profil (il a la jauge dédiée), ni sur le profil d'autrui (fuite).
    const nameCompletenessBadge = context && context.isAdmin
      ? renderCompletenessBadge(data, { uid: data.id || uid })
      : '';
    nameEl.innerHTML = `${escapeHTML(displayName)}<span id="prof-name-completeness">${nameCompletenessBadge}</span> <span id="prof-badge-zone" style="margin-left: 10px; font-size: 0.45em; vertical-align: middle;"></span>`;
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
  applyRoleSpecificProfileChrome(data);
  if (isStudentRole(data)) {
    await renderXp({ db, uid, data, context, reloadProfile });
  } else {
    clearProfileXpUi();
  }
  renderPromotionSidebarPanel({ db, uid, data, context, reloadProfile });
  renderStudentFollowupPanel({ db, uid, data, context, reloadProfile });
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
  } else if (data.role === 'teacher' || data.role === 'prof') {
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

  // ?tab=account : activer l'onglet « Activité » et défiler vers la complétude.
  maybeFocusAccountTabFromUrl();

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


function getProfileSidebarPromotionMount() {
  const sidebar = document.querySelector('.profile-sidebar');
  if (!sidebar) return null;

  let panel = document.getElementById('prof-promotion-sidebar-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'prof-promotion-sidebar-panel';
  panel.className = 'data-group sbi-profile-promotion-card';

  const formationsBlock = document.getElementById('prof-formations-list')?.closest?.('.data-group');
  if (formationsBlock?.parentNode) {
    formationsBlock.parentNode.insertBefore(panel, formationsBlock.nextSibling);
  } else {
    sidebar.appendChild(panel);
  }

  return panel;
}

function renderPromotionSidebarPanel({ db, uid, data = {}, context, reloadProfile }) {
  const existing = document.getElementById('prof-promotion-sidebar-panel');

  if (!context?.isAdmin || !isStudentRole(data)) {
    existing?.remove();
    return;
  }

  const panel = getProfileSidebarPromotionMount();
  if (!panel) return;

  const promotionId = String(data.promotionId || '').trim();
  const promotionName = data.promotionName || '';
  const promotionStatus = data.promotionStatus || '';
  const promotionFormation = data.promotionFormationName || data.formationName || '';
  const promotionDates = [data.promotionStartDate, data.promotionEndDate]
    .filter(Boolean)
    .map((value) => formatSbiDate(value, ''))
    .filter(Boolean)
    .join(' → ');

  panel.dataset.currentPromotionId = promotionId;
  panel.innerHTML = `
    <div class="sbi-profile-promotion-card__head">
      <h4>Promotion</h4>
      <span class="sbi-profile-promotion-card__badge ${promotionStatus === 'archived' ? 'is-archived' : ''}">
        ${promotionId ? escapeHTML(promotionStatus === 'archived' ? 'Archivée' : 'Active') : 'À affecter'}
      </span>
    </div>
    <div class="sbi-profile-promotion-card__current">
      <strong>${promotionName ? escapeHTML(promotionName) : 'Aucune promotion'}</strong>
      <p id="prof-current-promotion-meta">${promotionId ? escapeHTML([promotionFormation, promotionDates].filter(Boolean).join(' · ') || 'Chargement des détails...') : 'Associez cet élève à une promotion depuis cette fiche.'}</p>
    </div>
    <div class="sbi-profile-promotion-card__actions">
      <button type="button" id="prof-open-promotion-picker" class="sbi-profile-promotion-card__primary">${promotionId ? 'Modifier' : 'Affecter'}</button>
      ${promotionId ? '<button type="button" id="prof-remove-promotion" class="sbi-profile-promotion-card__ghost">Retirer</button>' : ''}
    </div>
    <p id="prof-sidebar-promotion-status" class="sbi-profile-promotion-card__status"></p>
  `;

  const status = panel.querySelector('#prof-sidebar-promotion-status');
  const setPromotionStatus = (message = '', tone = 'muted') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  if (promotionId) {
    hydratePromotionSidebarDetails({ db, promotionId, panel });
  }

  panel.querySelector('#prof-open-promotion-picker')?.addEventListener('click', () => {
    openPromotionPickerModal({ db, uid, data, reloadProfile });
  });

  panel.querySelector('#prof-remove-promotion')?.addEventListener('click', async () => {
    const button = panel.querySelector('#prof-remove-promotion');
    if (!button) return;

    button.disabled = true;
    setPromotionStatus('Retrait en cours...');

    try {
      await adminUpdateUserAccountCallable({ uid, promotionId: '' });
      setPromotionStatus('Promotion retirée.', 'success');
      await reloadProfile?.(uid);
    } catch (error) {
      console.warn('[SBI Profile] Retrait promotion impossible :', error);
      setPromotionStatus(getCallableUiMessage(error, 'Retrait impossible.'), 'error');
      button.disabled = false;
    }
  });
}


async function hydratePromotionSidebarDetails({ db, promotionId, panel }) {
  const meta = panel?.querySelector?.('#prof-current-promotion-meta');
  if (!db || !promotionId || !meta) return;

  try {
    const snap = await getDoc(doc(db, 'promotions', promotionId));
    if (!snap.exists()) {
      meta.textContent = 'Promotion introuvable.';
      return;
    }

    const promotion = { id: snap.id, ...snap.data() };
    meta.textContent = getPromotionMetaLine(promotion);
  } catch (error) {
    console.warn('[SBI Profile] Détails promotion non chargés :', error);
    meta.textContent = 'Détails promotion non disponibles.';
  }
}

function ensurePromotionPickerModal() {
  let modal = document.getElementById('sbi-promotion-picker-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'sbi-promotion-picker-modal';
  modal.className = 'sbi-promotion-picker-modal';
  modal.innerHTML = `
    <div class="sbi-promotion-picker-modal__backdrop" data-close-promotion-picker="true"></div>
    <section class="sbi-promotion-picker-modal__panel" role="dialog" aria-modal="true" aria-labelledby="sbi-promotion-picker-title">
      <div class="sbi-promotion-picker-modal__header">
        <div>
          <p>Assignation élève</p>
          <h3 id="sbi-promotion-picker-title">Choisir une promotion</h3>
        </div>
        <button type="button" class="sbi-promotion-picker-modal__close" data-close-promotion-picker="true" aria-label="Fermer">×</button>
      </div>
      <div class="sbi-promotion-picker-modal__filters">
        <label>
          <span>Recherche</span>
          <input type="search" id="sbi-promotion-picker-search" placeholder="Nom, formation, date...">
        </label>
        <label>
          <span>Formation</span>
          <select id="sbi-promotion-picker-formation"></select>
        </label>
        <label>
          <span>Statut</span>
          <select id="sbi-promotion-picker-status">
            <option value="active">Actives</option>
            <option value="all">Toutes</option>
            <option value="archived">Archivées</option>
          </select>
        </label>
      </div>
      <div id="sbi-promotion-picker-status-line" class="sbi-promotion-picker-modal__status">Chargement des promotions...</div>
      <div id="sbi-promotion-picker-results" class="sbi-promotion-picker-modal__results"></div>
    </section>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target?.dataset?.closePromotionPicker === 'true') closePromotionPickerModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) closePromotionPickerModal();
  });

  return modal;
}

function closePromotionPickerModal() {
  const modal = document.getElementById('sbi-promotion-picker-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  document.body.classList.remove('sbi-promotion-picker-open');
}

function renderPromotionPickerFilters(modal, promotions = []) {
  const formationSelect = modal.querySelector('#sbi-promotion-picker-formation');
  if (!formationSelect) return;

  const formationMap = new Map();
  promotions.forEach((promotion) => {
    const id = promotion.formationId || promotion.formationName || '';
    if (!id) return;
    formationMap.set(id, promotion.formationName || promotion.formationId || id);
  });

  const options = Array.from(formationMap.entries())
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr', { sensitivity: 'base' }));

  formationSelect.innerHTML = `
    <option value="">Toutes les formations</option>
    ${options.map(([id, label]) => `<option value="${escapeHTML(id)}">${escapeHTML(label)}</option>`).join('')}
  `;
}

function renderPromotionPickerResults({ modal, promotions, currentPromotionId, onAssign }) {
  const searchInput = modal.querySelector('#sbi-promotion-picker-search');
  const formationSelect = modal.querySelector('#sbi-promotion-picker-formation');
  const statusSelect = modal.querySelector('#sbi-promotion-picker-status');
  const results = modal.querySelector('#sbi-promotion-picker-results');
  const statusLine = modal.querySelector('#sbi-promotion-picker-status-line');
  if (!results || !statusLine) return;

  const search = normalizeProfileSearch(searchInput?.value || '');
  const formationId = formationSelect?.value || '';
  const statusFilter = statusSelect?.value || 'active';

  const filtered = promotions.filter((promotion) => {
    const promotionStatus = promotion.status === 'archived' ? 'archived' : 'active';
    if (statusFilter !== 'all' && promotionStatus !== statusFilter) return false;
    if (formationId && promotion.formationId !== formationId && promotion.formationName !== formationId) return false;

    if (!search) return true;
    const haystack = normalizeProfileSearch([
      promotion.name,
      promotion.promotionName,
      promotion.formationName,
      promotion.formationId,
      promotion.startDate,
      promotion.endDate,
      promotion.status
    ].filter(Boolean).join(' '));
    return haystack.includes(search);
  });

  const visible = filtered.slice(0, 60);
  statusLine.textContent = filtered.length
    ? `${filtered.length} promotion${filtered.length > 1 ? 's' : ''} trouvée${filtered.length > 1 ? 's' : ''}${filtered.length > visible.length ? ' · 60 affichées maximum, affine la recherche.' : ''}`
    : 'Aucune promotion ne correspond aux filtres.';

  results.innerHTML = visible.map((promotion) => {
    const isCurrent = promotion.id === currentPromotionId;
    const isArchived = promotion.status === 'archived';
    const meta = getPromotionMetaLine(promotion);
    return `
      <article class="sbi-promotion-picker-card ${isCurrent ? 'is-current' : ''} ${isArchived ? 'is-archived' : ''}">
        <div>
          <div class="sbi-promotion-picker-card__title">
            <strong>${escapeHTML(getPromotionLabelForProfile(promotion))}</strong>
            ${isCurrent ? '<span>Actuelle</span>' : ''}
            ${isArchived ? '<em>Archivée</em>' : ''}
          </div>
          <p>${escapeHTML(meta)}</p>
        </div>
        <button type="button" data-promotion-id="${escapeHTML(promotion.id)}" ${isCurrent ? 'disabled' : ''}>
          ${isCurrent ? 'Déjà affectée' : 'Assigner'}
        </button>
      </article>
    `;
  }).join('') || '<div class="sbi-promotion-picker-empty">Aucun résultat. Essayez une recherche plus courte ou le statut “Toutes”.</div>';

  results.querySelectorAll('button[data-promotion-id]').forEach((button) => {
    button.addEventListener('click', () => onAssign(button.dataset.promotionId || '', button));
  });
}

async function openPromotionPickerModal({ db, uid, data = {}, reloadProfile }) {
  const modal = ensurePromotionPickerModal();
  const searchInput = modal.querySelector('#sbi-promotion-picker-search');
  const formationSelect = modal.querySelector('#sbi-promotion-picker-formation');
  const statusSelect = modal.querySelector('#sbi-promotion-picker-status');
  const results = modal.querySelector('#sbi-promotion-picker-results');
  const statusLine = modal.querySelector('#sbi-promotion-picker-status-line');
  const currentPromotionId = String(data.promotionId || '').trim();

  modal.classList.add('is-open');
  document.body.classList.add('sbi-promotion-picker-open');
  if (results) results.innerHTML = '';
  if (statusLine) statusLine.textContent = 'Chargement des promotions...';
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = 'active';

  const promotions = await loadPromotionsForProfile(db, { includeArchived: true });
  renderPromotionPickerFilters(modal, promotions);

  const rerender = () => renderPromotionPickerResults({
    modal,
    promotions,
    currentPromotionId,
    onAssign: async (promotionId, button) => {
      const previousText = button?.textContent || 'Assigner';
      if (button) {
        button.disabled = true;
        button.textContent = 'Assignation...';
      }
      if (statusLine) statusLine.textContent = 'Affectation en cours...';

      try {
        await adminUpdateUserAccountCallable({ uid, promotionId });
        if (statusLine) statusLine.textContent = 'Promotion affectée.';
        closePromotionPickerModal();
        await reloadProfile?.(uid);
      } catch (error) {
        console.warn('[SBI Profile] Affectation promotion impossible :', error);
        if (statusLine) statusLine.textContent = getCallableUiMessage(error, 'Affectation impossible.');
        if (button) {
          button.disabled = false;
          button.textContent = previousText;
        }
      }
    }
  });

  if (searchInput) searchInput.oninput = rerender;
  if (formationSelect) formationSelect.onchange = rerender;
  if (statusSelect) statusSelect.onchange = rerender;

  rerender();
  setTimeout(() => searchInput?.focus(), 80);
}


function normalizeStudentFollowupStatus(value) {
  return Object.prototype.hasOwnProperty.call(STUDENT_FOLLOWUP_STATUS_LABELS, value) ? value : 'not_started';
}

function normalizeStudentFollowupPriority(value) {
  return Object.prototype.hasOwnProperty.call(STUDENT_FOLLOWUP_PRIORITY_LABELS, value) ? value : 'normal';
}

function getStudentFollowup(data = {}) {
  const followup = data.studentFollowup || {};
  return {
    status: normalizeStudentFollowupStatus(followup.status || 'not_started'),
    priority: normalizeStudentFollowupPriority(followup.priority || 'normal'),
    referentName: followup.referentName || '',
    referentEmail: followup.referentEmail || '',
    nextActionAt: followup.nextActionAt || '',
    note: followup.note || '',
    updatedAt: followup.updatedAt || null,
    updatedByEmail: followup.updatedByEmail || '',
    updatedByName: followup.updatedByName || ''
  };
}

function setStudentFollowupVisibility(visible) {
  document.querySelectorAll('.student-followup-section').forEach((node) => {
    node.style.display = visible ? '' : 'none';
  });
}

function renderStudentFollowupPanel({ db, uid, data = {}, context, reloadProfile }) {
  const panel = document.getElementById('prof-student-followup-panel');
  const isVisible = Boolean(context?.isAdmin && isStudentRole(data));
  setStudentFollowupVisibility(isVisible);

  if (!panel) return;

  if (!isVisible) {
    panel.innerHTML = `
      <p style="color:var(--text-muted); font-size:0.9rem; margin:0; line-height:1.5;">
        Le suivi pédagogique détaillé est disponible uniquement pour les comptes élèves.
      </p>
    `;
    return;
  }

  const followup = getStudentFollowup(data);
  const promotionLabel = data.promotionName || 'Aucune promotion affectée';
  const formationLabel = data.promotionFormationName
    || data.promotionFormationId
    || data.formationName
    || data.formation
    || (data.promotionId ? 'Chargement formation...' : 'Formation non renseignée');
  const lastUpdate = followup.updatedAt
    ? `${formatSbiDate(followup.updatedAt, 'date inconnue')}${followup.updatedByEmail ? ` · ${followup.updatedByEmail}` : ''}`
    : 'Aucune mise à jour enregistrée';

  panel.innerHTML = `
    <div class="sbi-student-followup">
      <div class="sbi-student-followup__header">
        <div>
          <p>Fiche élève</p>
          <h4>Suivi pédagogique</h4>
        </div>
        <span class="sbi-student-followup__pill" data-priority="${escapeHTML(followup.priority)}">
          ${escapeHTML(STUDENT_FOLLOWUP_PRIORITY_LABELS[followup.priority])}
        </span>
      </div>

      <div class="sbi-student-followup__snapshot">
        <div>
          <span>Promotion</span>
          <strong>${escapeHTML(promotionLabel)}</strong>
        </div>
        <div>
          <span>Formation liée</span>
          <strong id="prof-student-followup-formation-label" data-promotion-id="${escapeHTML(data.promotionId || '')}">${escapeHTML(formationLabel)}</strong>
        </div>
        <div>
          <span>Dernière activité</span>
          <strong>${escapeHTML(formatSbiDate(data.accountStatus?.lastLoginAt || data.lastLoginAt || data.lastSeenAt, 'Aucune activité'))}</strong>
        </div>
        <div>
          <span>Prochaine action</span>
          <strong>${escapeHTML(followup.nextActionAt ? formatSbiDate(followup.nextActionAt, 'À définir') : 'À définir')}</strong>
        </div>
      </div>

      <div class="sbi-student-followup__grid">
        <label>
          <span>Statut de suivi</span>
          <select id="prof-student-followup-status">
            ${Object.entries(STUDENT_FOLLOWUP_STATUS_LABELS).map(([value, label]) => `
              <option value="${escapeHTML(value)}"${value === followup.status ? ' selected' : ''}>${escapeHTML(label)}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>Priorité / vigilance</span>
          <select id="prof-student-followup-priority">
            ${Object.entries(STUDENT_FOLLOWUP_PRIORITY_LABELS).map(([value, label]) => `
              <option value="${escapeHTML(value)}"${value === followup.priority ? ' selected' : ''}>${escapeHTML(label)}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>Contact référent</span>
          <input id="prof-student-followup-referent-name" type="text" maxlength="120" placeholder="Nom du référent" value="${escapeHTML(followup.referentName)}">
        </label>
        <label>
          <span>Email référent</span>
          <input id="prof-student-followup-referent-email" type="email" maxlength="160" placeholder="referent@sbi..." value="${escapeHTML(followup.referentEmail)}">
        </label>
        <label>
          <span>Prochaine action prévue</span>
          <input id="prof-student-followup-next-action" type="date" value="${escapeHTML(followup.nextActionAt)}">
        </label>
      </div>

      <label class="sbi-student-followup__note">
        <span>Notes de suivi pédagogique</span>
        <textarea id="prof-student-followup-note" rows="6" maxlength="3000" placeholder="Ex : dossier à vérifier, point pédagogique prévu, besoin de relance administrative, vigilance ou blocage...">${escapeHTML(followup.note)}</textarea>
      </label>

      <div class="sbi-student-followup__footer">
        <span id="prof-student-followup-meta">Dernière mise à jour : ${escapeHTML(lastUpdate)}</span>
        <span id="prof-student-followup-status-line"></span>
        <button id="prof-save-student-followup-btn" type="button">Sauvegarder le suivi pédagogique</button>
      </div>
    </div>
  `;

  const statusLine = panel.querySelector('#prof-student-followup-status-line');
  const saveButton = panel.querySelector('#prof-save-student-followup-btn');

  hydrateStudentFollowupFormationSnapshot({ db, data, panel });


  saveButton?.addEventListener('click', async () => {
    const payload = {
      status: panel.querySelector('#prof-student-followup-status')?.value || 'not_started',
      priority: panel.querySelector('#prof-student-followup-priority')?.value || 'normal',
      referentName: panel.querySelector('#prof-student-followup-referent-name')?.value || '',
      referentEmail: panel.querySelector('#prof-student-followup-referent-email')?.value || '',
      nextActionAt: panel.querySelector('#prof-student-followup-next-action')?.value || '',
      note: panel.querySelector('#prof-student-followup-note')?.value || ''
    };

    saveButton.disabled = true;
    saveButton.style.opacity = '0.65';
    if (statusLine) {
      statusLine.dataset.tone = 'muted';
      statusLine.textContent = 'Sauvegarde...';
    }

    try {
      await adminUpdateUserAccountCallable({ uid, studentFollowup: payload });
      if (statusLine) {
        statusLine.dataset.tone = 'success';
        statusLine.textContent = 'Suivi pédagogique sauvegardé.';
      }
      await reloadProfile?.(uid);
    } catch (error) {
      console.warn('[SBI Profile] Sauvegarde suivi pédagogique impossible :', error);
      if (statusLine) {
        statusLine.dataset.tone = 'error';
        statusLine.textContent = getCallableUiMessage(error, 'Sauvegarde impossible.');
      }
    } finally {
      saveButton.disabled = false;
      saveButton.style.opacity = '';
    }
  });
}


async function hydrateStudentFollowupFormationSnapshot({ db, data = {}, panel }) {
  const label = panel?.querySelector?.('#prof-student-followup-formation-label');
  const promotionId = String(data.promotionId || label?.dataset?.promotionId || '').trim();
  if (!label || !db || !promotionId) return;

  const alreadyKnown = data.promotionFormationName || data.promotionFormationId || data.formationName || data.formation;
  if (alreadyKnown) return;

  try {
    const snap = await getDoc(doc(db, 'promotions', promotionId));
    if (!snap.exists()) {
      label.textContent = 'Promotion introuvable';
      return;
    }

    const promotion = snap.data() || {};
    const formationLabel = promotion.formationName || promotion.formationId || 'Formation non renseignée';
    label.textContent = formationLabel;
  } catch (error) {
    console.warn('[SBI Profile] Formation liée non chargée depuis la promotion :', error);
    label.textContent = 'Formation non disponible';
  }
}

/**
 * Si l'URL contient ?tab=account, active l'onglet profil qui contient le
 * panneau « Actions compte » (#ptab-activity) puis défile en douceur vers
 * la carte de complétude (#prof-account-completeness).
 * Respecte prefers-reduced-motion. Idempotent : ne s'exécute qu'une fois.
 */
function maybeFocusAccountTabFromUrl() {
  if (maybeFocusAccountTabFromUrl._done) return;

  let tabParam = '';
  try {
    const url = new URL(
      window.SBI_APP_SHELL_CURRENT_URL || window.location.href,
      window.location.origin
    );
    tabParam = url.searchParams.get('tab') || '';
  } catch (_) {
    return;
  }

  if (tabParam !== 'account') return;
  maybeFocusAccountTabFromUrl._done = true;

  // Active l'onglet « Activité » (celui qui cible #ptab-activity).
  const activityTab = Array.from(document.querySelectorAll('.p-tab')).find((node) => {
    const action = String(node.getAttribute('onclick') || '');
    return action.includes('ptab-activity');
  });
  activityTab?.click?.();

  // Défile vers la carte de complétude une fois le panneau monté.
  const scrollToCard = () => {
    const target = document.getElementById('prof-account-completeness');
    if (!target) return;
    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    } catch (_) {}
    try {
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    } catch (_) {
      target.scrollIntoView();
    }
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToCard));
  } else {
    setTimeout(scrollToCard, 60);
  }
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

  // --- Alertes BLOQUANTES : rendues HORS du repli (importantes) -----------
  const blockingAlertsHtml = `
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
  `;

  // --- Contenu replié : état détaillé + alertes secondaires + suivi + note -
  const advancedHtml = `
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
  `;

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

      <!-- EN HAUT : carte Complétude du compte (jauge + checklist) -->
      <div id="prof-account-completeness" aria-label="Complétude du compte" aria-live="polite" style="
        margin:0 0 0.95rem 0;
        padding:0.9rem 1rem;
        border:1px solid rgba(255,255,255,0.10);
        border-radius:12px;
        background:var(--sbi-profile-activity-bg, rgba(255,255,255,0.035));
        color:var(--text-main, #fff);
      ">
        <p style="margin:0; color:var(--text-muted); font-size:0.82rem;">Calcul de la complétude…</p>
      </div>

      <!-- Alertes bloquantes : toujours visibles -->
      ${blockingAlertsHtml}

      <!-- Reste replié pour épurer -->
      <details class="sbi-acc-advanced">
        <summary style="
          cursor:pointer;
          font-weight:800;
          color:var(--text-main, #fff);
          font-size:0.86rem;
          padding:0.55rem 0;
          list-style:revert;
          outline:none;
        ">Actions avancées &amp; notes</summary>
        <div style="margin-top:0.75rem;">
          ${advancedHtml}
        </div>
      </details>
    </div>
  `;

  const status = panel.querySelector('#prof-account-actions-status');
  const saveButton = panel.querySelector('#prof-save-account-followup-btn');
  const resendButton = panel.querySelector('#prof-resend-access-btn');
  const finalizationButton = panel.querySelector('#prof-send-finalization-btn');
  const resolveEscalationButton = panel.querySelector('#prof-resolve-escalation-btn');
  const noteTextarea = panel.querySelector('#prof-account-note');
  const notePreviewText = panel.querySelector('#prof-account-note-preview-text');
  const notePreviewMeta = panel.querySelector('#prof-account-note-meta');


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

  // --- Carte « Complétude du compte » : calcul à l'ouverture --------------
  // Le panel n'est rendu que pour les admins (cf. renderActivity), donc on
  // peut appeler la CF sans contrôle de rôle supplémentaire.
  injectCompletenessBadgeStyles();
  loadAccountCompletenessCard({ uid, role: data.role });
}

/**
 * Charge (ou recharge) la carte de complétude dans #prof-account-completeness.
 * Affiche un skeleton pendant le calcul, gère l'erreur de façon non bloquante,
 * et installe le bouton « Recalculer ».
 * @param {{ uid:String }} params
 */
async function loadAccountCompletenessCard({ uid, role = '' }) {
  const container = document.getElementById('prof-account-completeness');
  if (!container || !uid) return;

  container.innerHTML = `
    <p style="margin:0; color:var(--text-muted); font-size:0.82rem;">Calcul de la complétude…</p>
  `;

  try {
    const result = await recomputeAccountCompleteness({ uid });
    const completeness = result?.data?.completeness || {};
    const panelHtml = renderCompletenessPanelHtml(completeness, { uid });

    // Rafraîchit le badge ✗ à côté du nom avec la complétude fraîchement calculée.
    const headerBadge = document.getElementById('prof-name-completeness');
    if (headerBadge) headerBadge.innerHTML = renderCompletenessBadge({ role, completeness }, { uid });

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start; flex-wrap:wrap;">
        <div style="flex:1 1 auto; min-width:0;">${panelHtml}</div>
        <button id="prof-account-completeness-recalc" type="button" style="
          flex:0 0 auto;
          border:1px solid rgba(255,255,255,0.18);
          background:rgba(255,255,255,0.06);
          color:var(--text-main, #fff);
          border-radius:999px;
          padding:0.4rem 0.8rem;
          font-weight:800;
          font-size:0.78rem;
          cursor:pointer;
        ">Recalculer</button>
      </div>
    `;
  } catch (error) {
    console.warn('[SBI Profile] Calcul de la complétude impossible :', error);
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:center; flex-wrap:wrap;">
        <p style="margin:0; color:var(--text-muted); font-size:0.82rem;">
          Complétude indisponible pour le moment.
        </p>
        <button id="prof-account-completeness-recalc" type="button" style="
          flex:0 0 auto;
          border:1px solid rgba(255,255,255,0.18);
          background:rgba(255,255,255,0.06);
          color:var(--text-main, #fff);
          border-radius:999px;
          padding:0.4rem 0.8rem;
          font-weight:800;
          font-size:0.78rem;
          cursor:pointer;
        ">Réessayer</button>
      </div>
    `;
  }

  const recalcButton = container.querySelector('#prof-account-completeness-recalc');
  recalcButton?.addEventListener('click', () => {
    loadAccountCompletenessCard({ uid });
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
    'student_documents.requested': {
      label: 'Demande de documents envoyée',
      color: '#fbbc04'
    },
    'student_documents.submitted': {
      label: 'Documents élève transmis',
      color: '#2ed573'
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
  if (changes.documents) {
    if (changes.documents.count !== undefined) details.push(`${changes.documents.count} document(s) demandé(s)`);
    if (changes.documents.submittedCount !== undefined && changes.documents.requestedCount !== undefined) {
      details.push(`${changes.documents.submittedCount}/${changes.documents.requestedCount} document(s) transmis`);
    }
    if (changes.documents.requestId) details.push(`Demande : ${changes.documents.requestId}`);
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
