/**
 * SBI 8.0P.167.25 / P2H.2-E.6
 * Alertes admin légères pour comptes bloqués après 3 relances de finalisation.
 *
 * Règle : aucun MutationObserver global, aucune boucle DOM, aucune écoute lourde.
 * Le module écoute uniquement les comptes dont finalizationReminderEnabled === false,
 * puis filtre côté client les escalades ouvertes.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';

const MODULE_VERSION = '8.0P.167.25';
const MAX_ALERTS_RENDERED = 12;

let currentUid = null;
let currentProfile = null;
let unsubscribeEscalations = null;
let latestEscalations = [];
let baseNotificationCount = 0;
let renderRetryCount = 0;

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

function formatDate(value, fallback = 'date inconnue') {
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

function getDisplayName(user = {}) {
  return `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email || 'Compte sans nom';
}

function isOpenFinalizationEscalation(user = {}) {
  return Boolean(
    user.accountStatus?.finalizationEscalationAt
    && !user.accountStatus?.finalizationEscalationResolvedAt
  );
}

function buildEscalation(user = {}) {
  const accountStatus = user.accountStatus || {};
  return {
    id: `account-escalation-${user.id}`,
    uid: user.id,
    type: 'account_finalization_escalation',
    name: getDisplayName(user),
    email: user.email || '',
    role: user.role || '',
    reminderCount: Number(accountStatus.reminderCount || 3),
    escalationAt: accountStatus.finalizationEscalationAt,
    lastReminderAt: accountStatus.lastReminderSentAt || accountStatus.finalizationEscalationAt
  };
}

function stopEscalationListener() {
  if (typeof unsubscribeEscalations === 'function') unsubscribeEscalations();
  unsubscribeEscalations = null;
}

function startEscalationListener() {
  stopEscalationListener();

  const escalationsQuery = query(
    collection(db, 'users'),
    where('accountStatus.finalizationReminderEnabled', '==', false),
    limit(60)
  );

  unsubscribeEscalations = onSnapshot(escalationsQuery, (snapshot) => {
    const alerts = [];

    snapshot.forEach((docSnap) => {
      const user = { id: docSnap.id, ...(docSnap.data() || {}) };
      if (isOpenFinalizationEscalation(user)) alerts.push(buildEscalation(user));
    });

    latestEscalations = alerts.sort((a, b) => toMillis(b.escalationAt) - toMillis(a.escalationAt));
    renderAll();
  }, (error) => {
    latestEscalations = [];
    renderAll();

    if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
      console.warn('[SBI Account Escalations] Écoute indisponible :', error);
    }
  });
}

function getCombinedCount() {
  return baseNotificationCount + latestEscalations.length;
}

function updateBadges() {
  const count = getCombinedCount();
  const displayCount = count > 9 ? '9+' : String(count);
  const badges = [document.getElementById('bell-badge'), document.getElementById('avatar-badge')];

  badges.forEach((badge) => {
    if (!badge) return;

    if (count > 0) {
      badge.textContent = displayCount;
      badge.style.display = '';
      badge.title = `${count} alerte(s) / notification(s)`;
    } else {
      badge.style.display = 'none';
      badge.title = '';
    }
  });
}

function removeEmptyNotificationMessage(container) {
  const emptyText = container.querySelector('p');
  if (!emptyText) return;

  if (emptyText.textContent?.trim() === 'Aucune nouvelle notification.') {
    emptyText.remove();
  }
}

function renderNotificationPanelEscalations() {
  const container = document.getElementById('notifications-list');

  if (!container) {
    if (renderRetryCount < 5) {
      renderRetryCount += 1;
      window.setTimeout(renderNotificationPanelEscalations, 180);
    }
    return;
  }

  renderRetryCount = 0;
  container.querySelectorAll('[data-sbi-account-escalation-notif="true"]').forEach((node) => node.remove());

  if (latestEscalations.length === 0) return;

  removeEmptyNotificationMessage(container);

  const wrapper = document.createElement('div');
  wrapper.dataset.sbiAccountEscalationNotif = 'true';
  wrapper.innerHTML = latestEscalations.slice(0, MAX_ALERTS_RENDERED).map((alert) => `
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
        <p style="margin:0; font-size:.85rem; color:var(--text-main,#fff); font-weight:900;">Contact direct requis</p>
        <p style="margin:.3rem 0 0; font-size:.8rem; color:var(--text-muted,#9ca3af); line-height:1.45;">
          <strong>${escapeHtml(alert.name)}</strong> n’a pas finalisé son accès après ${escapeHtml(alert.reminderCount)}/3 relances.
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

function renderDashboardBanner() {
  const dashboard = document.getElementById('view-dashboard');
  if (!dashboard) return;

  let banner = document.getElementById('sbi-account-escalation-banner');

  if (latestEscalations.length === 0) {
    banner?.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement('section');
    banner.id = 'sbi-account-escalation-banner';
    dashboard.insertBefore(banner, dashboard.firstChild);
  }

  const count = latestEscalations.length;
  const first = latestEscalations[0];

  banner.innerHTML = `
    <div style="
      margin:0 0 1rem 0;
      padding:1rem 1.1rem;
      border:1px solid rgba(255,74,74,0.35);
      border-radius:14px;
      background:linear-gradient(135deg, rgba(255,74,74,0.13), rgba(42,87,255,0.06));
      box-shadow:0 16px 40px rgba(0,0,0,0.16);
    ">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
        <div>
          <strong style="display:block; color:#fff; font-size:0.98rem;">Finalisation bloquée : ${count} compte${count > 1 ? 's' : ''} à contacter</strong>
          <p style="margin:0.35rem 0 0; color:var(--text-muted); font-size:0.84rem; line-height:1.45;">
            3 relances automatiques ont été envoyées sans première connexion${first ? `, dernier cas : ${escapeHtml(first.name)}` : ''}.
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

function renderAll() {
  updateBadges();
  renderDashboardBanner();
  renderNotificationPanelEscalations();

  window.SBI_ACCOUNT_ESCALATIONS_LITE = {
    version: MODULE_VERSION,
    count: latestEscalations.length,
    alerts: latestEscalations.map((alert) => ({
      uid: alert.uid,
      email: alert.email,
      name: alert.name,
      reminderCount: alert.reminderCount
    }))
  };

  window.dispatchEvent(new CustomEvent('sbi:account-escalations-updated', {
    detail: {
      count: latestEscalations.length,
      combinedCount: getCombinedCount()
    }
  }));
}

function openProfile(uid) {
  window.location.assign(`/admin/admin-profile.html?id=${encodeURIComponent(uid)}`);
}

function mount() {
  onAuthStateChanged(auth, async (user) => {
    stopEscalationListener();
    latestEscalations = [];
    renderAll();

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
      currentProfile = null;
      if (window.localStorage?.getItem('sbiDebugAccess') === 'true') {
        console.warn('[SBI Account Escalations] Profil admin indisponible :', error);
      }
    }
  });
}

window.addEventListener('sbi:notifications-updated', (event) => {
  baseNotificationCount = Number(event.detail?.count || 0);
  renderAll();
});

window.addEventListener('sbi:components-ready', renderAll);
window.addEventListener('sbi:admin-index-dom-present', renderAll);
window.addEventListener('sbi:admin-tab-changed', renderAll);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
