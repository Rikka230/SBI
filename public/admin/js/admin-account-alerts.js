/**
 * SBI 8.0P.166 / P2H.2-E.3
 * Alertes admin visibles pour les finalisations bloquées après 3 relances.
 *
 * Module indépendant pour éviter de retoucher le routeur/PJAX.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let mounted = false;
let currentUid = null;
let currentProfile = null;
let unsubscribeEscalations = null;
let latestAlerts = [];
let observer = null;
let renderingNotifications = false;

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

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return 'date inconnue';

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms));
  } catch (_) {
    return 'date inconnue';
  }
}

function getDisplayName(user = {}) {
  return `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email || 'Compte sans nom';
}

function isOpenEscalation(user = {}) {
  return Boolean(
    user.accountStatus?.finalizationEscalationAt
    && !user.accountStatus?.finalizationEscalationResolvedAt
  );
}

function buildAlertFromUser(user = {}) {
  const accountStatus = user.accountStatus || {};

  return {
    id: `finalization-${user.id}`,
    uid: user.id,
    email: user.email || '',
    name: getDisplayName(user),
    role: user.role || '',
    reminderCount: Number(accountStatus.reminderCount || 3),
    escalationAt: accountStatus.finalizationEscalationAt,
    lastReminderAt: accountStatus.lastReminderSentAt || accountStatus.finalizationEscalationAt
  };
}

function startEscalationListener() {
  stopEscalationListener();

  const escalationsQuery = query(
    collection(db, 'users'),
    where('accountStatus.finalizationReminderEnabled', '==', false)
  );

  unsubscribeEscalations = onSnapshot(escalationsQuery, (snapshot) => {
    const alerts = [];

    snapshot.forEach((docSnap) => {
      const user = { id: docSnap.id, ...(docSnap.data() || {}) };
      if (isOpenEscalation(user)) alerts.push(buildAlertFromUser(user));
    });

    latestAlerts = alerts.sort((a, b) => toMillis(b.escalationAt) - toMillis(a.escalationAt));
    renderAccountEscalationAlerts();
  }, (error) => {
    console.warn('[SBI Account Alerts] Écoute escalades indisponible :', error);
    latestAlerts = [];
    renderAccountEscalationAlerts();
  });
}

function stopEscalationListener() {
  if (typeof unsubscribeEscalations === 'function') unsubscribeEscalations();
  unsubscribeEscalations = null;
}

function updateBadges() {
  const count = latestAlerts.length;
  const bellBadge = document.getElementById('bell-badge');
  const avatarBadge = document.getElementById('avatar-badge');

  [bellBadge, avatarBadge].forEach((badge) => {
    if (!badge) return;

    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = '';
      badge.title = `${count} alerte(s) compte à traiter`;
      badge.dataset.sbiAccountEscalation = 'true';
    } else if (badge.dataset.sbiAccountEscalation === 'true') {
      badge.style.display = 'none';
      badge.dataset.sbiAccountEscalation = '';
    }
  });
}

function renderDashboardBanner() {
  const main = document.querySelector('#main-content .content-wrapper') || document.querySelector('#main-content');
  if (!main) return;

  let banner = document.getElementById('sbi-account-escalation-banner');

  if (latestAlerts.length === 0) {
    banner?.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement('section');
    banner.id = 'sbi-account-escalation-banner';
    main.insertBefore(banner, main.firstChild);
  }

  const count = latestAlerts.length;
  const first = latestAlerts[0];

  banner.innerHTML = `
    <div style="
      margin:0 0 1rem 0;
      padding:1rem 1.1rem;
      border:1px solid rgba(255,74,74,0.35);
      border-radius:14px;
      background:linear-gradient(135deg, rgba(255,74,74,0.13), rgba(42,87,255,0.06));
      box-shadow:0 16px 40px rgba(0,0,0,0.18);
    ">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
        <div>
          <strong style="display:block; color:#fff; font-size:0.98rem;">Finalisation bloquée : ${count} compte${count > 1 ? 's' : ''} à contacter</strong>
          <p style="margin:0.35rem 0 0; color:var(--text-muted); font-size:0.84rem; line-height:1.45;">
            3 relances envoyées. Contact direct requis${first ? `, dernier cas : ${escapeHtml(first.name)}` : ''}.
          </p>
        </div>
        <button type="button" id="sbi-open-first-escalation" style="
          border:0;
          border-radius:999px;
          padding:0.62rem 0.9rem;
          background:#ff4a4a;
          color:#fff;
          font-weight:900;
          cursor:pointer;
        ">Ouvrir le compte</button>
      </div>
    </div>
  `;

  banner.querySelector('#sbi-open-first-escalation')?.addEventListener('click', () => {
    if (first?.uid) openProfile(first.uid);
  }, { once: true });
}

function renderNotificationsPanel() {
  const container = document.getElementById('notifications-list');
  if (!container) return;

  renderingNotifications = true;

  container.querySelectorAll('[data-sbi-account-escalation-notif="true"]').forEach((node) => node.remove());

  if (latestAlerts.length > 0) {
    const wrapper = document.createElement('div');
    wrapper.dataset.sbiAccountEscalationNotif = 'true';

    wrapper.innerHTML = latestAlerts.map((alert) => `
      <div class="notif-item sbi-account-escalation-notif" data-alert-uid="${escapeHtml(alert.uid)}" style="
        display:flex;
        align-items:flex-start;
        gap:1rem;
        padding:1rem;
        border-bottom:1px solid var(--border-color, #333);
        cursor:pointer;
        transition:background .2s;
        background:rgba(255,74,74,.08);
      ">
        <div style="width:8px; height:8px; min-width:8px; background:#ff4a4a; border-radius:50%; flex-shrink:0; margin-top:5px; box-shadow:0 0 8px rgba(255,74,74,.8);"></div>
        <div style="flex-shrink:0;">
          <svg width="20" height="20" style="min-width:20px; flex-shrink:0;" fill="#ff4a4a" viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
        </div>
        <div>
          <p style="margin:0; font-size:.85rem; color:var(--text-main,#fff); font-weight:bold;">Contact direct requis</p>
          <p style="margin:.3rem 0 0; font-size:.8rem; color:var(--text-muted,#9ca3af); line-height:1.4;">
            <strong>${escapeHtml(alert.name)}</strong> n’a pas finalisé son accès après ${alert.reminderCount}/3 relances.
            Dernière relance : ${escapeHtml(formatDate(alert.lastReminderAt))}.
          </p>
        </div>
      </div>
    `).join('');

    container.prepend(wrapper);

    wrapper.querySelectorAll('[data-alert-uid]').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const uid = item.getAttribute('data-alert-uid');
        if (uid) openProfile(uid);
      });
    });
  }

  window.setTimeout(() => {
    renderingNotifications = false;
  }, 0);
}

function openProfile(uid) {
  window.location.assign(`/admin/admin-profile.html?id=${encodeURIComponent(uid)}`);
}

function renderAccountEscalationAlerts() {
  window.SBI_ACCOUNT_ESCALATION_ALERTS = {
    version: '8.0P.166',
    count: latestAlerts.length,
    alerts: latestAlerts.map((alert) => ({
      uid: alert.uid,
      email: alert.email,
      name: alert.name,
      reminderCount: alert.reminderCount
    }))
  };

  updateBadges();
  renderDashboardBanner();
  renderNotificationsPanel();

  window.dispatchEvent(new CustomEvent('sbi:account-escalations-updated', {
    detail: {
      count: latestAlerts.length,
      alerts: latestAlerts
    }
  }));
}

function startDomObserver() {
  if (observer) return;

  observer = new MutationObserver(() => {
    if (renderingNotifications) return;
    window.requestAnimationFrame(() => {
      updateBadges();
      renderDashboardBanner();
      renderNotificationsPanel();
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

export function mountAdminAccountAlerts() {
  if (mounted) return;
  mounted = true;

  startDomObserver();

  onAuthStateChanged(auth, async (user) => {
    stopEscalationListener();
    latestAlerts = [];
    renderAccountEscalationAlerts();

    if (!user) {
      currentUid = null;
      currentProfile = null;
      return;
    }

    currentUid = user.uid;

    try {
      const userSnap = await getDoc(doc(db, 'users', currentUid));
      currentProfile = userSnap.exists() ? userSnap.data() : null;

      if (isAdminLike(currentProfile)) {
        startEscalationListener();
      }
    } catch (error) {
      console.warn('[SBI Account Alerts] Profil admin indisponible :', error);
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAdminAccountAlerts, { once: true });
} else {
  mountAdminAccountAlerts();
}
