import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ONLINE_TTL_MS } from './profile-utils.js';

let unsubscribeProfilePresence = null;
let profilePresenceRefreshIntervalId = null;
let latestPresenceData = null;

export function presenceToMillis(value) {
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

export function isUserReallyOnline(userData) {
  if (!userData || userData.statut === 'suspendu') return false;
  if (userData.isOnline !== true) return false;
  const lastSeenMs = presenceToMillis(userData.lastSeenAt);
  if (!lastSeenMs) return false;
  return Date.now() - lastSeenMs <= ONLINE_TTL_MS;
}

export function updateProfilePresenceStatus(data) {
  const dot = document.getElementById('prof-online-dot');
  const statusText = document.getElementById('prof-status-text');
  if (!dot || !statusText || !data) return;

  if (data.statut === 'suspendu') {
    dot.className = 'online-dot offline';
    statusText.textContent = 'Compte Suspendu';
    return;
  }

  if (isUserReallyOnline(data)) {
    dot.className = 'online-dot';
    statusText.textContent = 'En Ligne';
  } else {
    dot.className = 'online-dot offline';
    statusText.textContent = 'Hors Ligne';
  }
}

function isDebugProfilePresenceEnabled() {
  try {
    return localStorage.getItem('sbiDebugAccess') === 'true';
  } catch {
    return false;
  }
}

function isExpectedPresenceAccessError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied')
    || message.includes('missing or insufficient permissions')
    || message.includes('permission');
}

export function startProfilePresenceListener(db, uid) {
  if (!uid) return;

  stopProfilePresenceListener();

  unsubscribeProfilePresence = onSnapshot(doc(db, 'users', uid), (snap) => {
    if (!snap.exists()) return;
    latestPresenceData = snap.data();
    updateProfilePresenceStatus(latestPresenceData);
  }, (error) => {
    if (isExpectedPresenceAccessError(error)) {
      if (isDebugProfilePresenceEnabled()) console.debug('[SBI Profile] Écoute présence limitée :', error);
      return;
    }

    console.warn('Erreur écoute présence profil :', error);
  });

  profilePresenceRefreshIntervalId = window.setInterval(() => {
    if (latestPresenceData) updateProfilePresenceStatus(latestPresenceData);
  }, 30000);
}

export function stopProfilePresenceListener() {
  if (unsubscribeProfilePresence) {
    unsubscribeProfilePresence();
    unsubscribeProfilePresence = null;
  }

  if (profilePresenceRefreshIntervalId) {
    window.clearInterval(profilePresenceRefreshIntervalId);
    profilePresenceRefreshIntervalId = null;
  }
}
