/**
 * SBI 8.0P.166.5 — Chargement rapide du panel profil droit
 *
 * Objectif :
 * - remplir le vrai panel admin : nav-name / nav-avatar / nav-role ;
 * - garder aussi la compatibilité topbar : top-user-name / top-user-avatar / top-user-level ;
 * - afficher un cache session immédiatement si disponible ;
 * - lire Firestore une seule fois au login ;
 * - réessayer jusqu’à apparition réelle du web component admin-right-panel ;
 * - ne pas toucher à la logique notifications existante.
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

const CACHE_PREFIX = 'sbi:fastProfilePanel:';
const MAX_APPLY_ATTEMPTS = 20;

let currentApplyToken = 0;
let lastPayload = null;

function getCacheKey(uid) {
  return `${CACHE_PREFIX}${uid}`;
}

function readCachedProfile(uid) {
  try {
    const raw = sessionStorage.getItem(getCacheKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeCachedProfile(uid, payload) {
  try {
    sessionStorage.setItem(getCacheKey(uid), JSON.stringify({
      ...payload,
      cachedAt: Date.now()
    }));
  } catch (_) {}
}

function getDisplayName(profile = {}) {
  return `${profile.prenom || ''} ${profile.nom || ''}`.trim()
    || profile.displayName
    || profile.email
    || 'Utilisateur';
}

function getRoleLabel(profile = {}) {
  if (profile.isGod === true) return 'Admin Suprême';
  if (profile.role === 'admin') return 'Administrateur';
  if (profile.role === 'teacher') return 'Professeur';
  if (profile.role === 'student') return 'Élève';
  return 'Compte';
}

function getAvatarUrl(profile = {}, displayName = 'Utilisateur') {
  if (profile.photoURL) return profile.photoURL;

  let bgColor = '111';
  let textColor = 'fff';

  if (profile.role === 'student') {
    bgColor = 'e5e7eb';
    textColor = '2A57FF';
  } else if (profile.role === 'teacher') {
    bgColor = 'fef3c7';
    textColor = 'f59e0b';
  }

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=${bgColor}&color=${textColor}`;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setAvatarElement(element, avatarUrl, displayName) {
  if (!element) return;

  element.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;" alt="${escapeAttr(displayName)}" onerror="this.remove(); this.parentElement.textContent='${escapeAttr(displayName.charAt(0).toUpperCase() || 'U')}';">`;
}

function applyProfileToPanel(uid, profile, attempt = 0, token = currentApplyToken) {
  if (!uid || !profile || token !== currentApplyToken) return false;

  const navName = document.getElementById('nav-name');
  const navAvatar = document.getElementById('nav-avatar');
  const navRole = document.getElementById('nav-role');

  const topName = document.getElementById('top-user-name');
  const topAvatar = document.getElementById('top-user-avatar');
  const topLevel = document.getElementById('top-user-level');

  const hasAnyTarget = Boolean(navName || navAvatar || navRole || topName || topAvatar || topLevel);

  if (!hasAnyTarget) {
    if (attempt < MAX_APPLY_ATTEMPTS) {
      window.setTimeout(
        () => applyProfileToPanel(uid, profile, attempt + 1, token),
        attempt < 6 ? 80 : 160
      );
    }
    return false;
  }

  const displayName = getDisplayName(profile);
  const roleLabel = getRoleLabel(profile);
  const avatarUrl = getAvatarUrl(profile, displayName);
  const userXp = Number(profile.xp || 0);
  const userLevel = Math.floor(userXp / 100) + 1;

  if (navName) navName.textContent = displayName;
  if (navRole) navRole.textContent = roleLabel;
  setAvatarElement(navAvatar, avatarUrl, displayName);

  if (topName) topName.textContent = displayName;
  if (topLevel) topLevel.textContent = `Niveau ${userLevel}`;
  setAvatarElement(topAvatar, avatarUrl, displayName);

  return true;
}

async function loadFreshProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  const payload = {
    uid,
    prenom: data.prenom || '',
    nom: data.nom || '',
    email: data.email || '',
    role: data.role || '',
    isGod: data.isGod === true,
    photoURL: data.photoURL || '',
    xp: data.xp || 0
  };

  writeCachedProfile(uid, payload);
  return payload;
}

function replayLastPayload() {
  const user = auth.currentUser;
  if (!user?.uid) return;

  const payload = lastPayload || readCachedProfile(user.uid);
  if (!payload) return;

  currentApplyToken += 1;
  applyProfileToPanel(user.uid, payload, 0, currentApplyToken);
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    currentApplyToken += 1;
    const token = currentApplyToken;

    if (!user?.uid) {
      lastPayload = null;
      return;
    }

    const uid = user.uid;
    const cached = readCachedProfile(uid);

    if (cached) {
      lastPayload = cached;
      applyProfileToPanel(uid, cached, 0, token);
    }

    try {
      const fresh = await loadFreshProfile(uid);
      if (fresh && token === currentApplyToken) {
        lastPayload = fresh;
        applyProfileToPanel(uid, fresh, 0, token);
      }
    } catch (error) {
      if (!cached && window.localStorage?.getItem('sbiDebugAccess') === 'true') {
        console.warn('[SBI Profile Panel] Profil rapide non chargé :', error);
      }
    }
  });
});

window.addEventListener('sbi:components-ready', replayLastPayload);
window.addEventListener('sbi:topbar-ready', replayLastPayload);
window.addEventListener('sbi:component-mounted', (event) => {
  if (event?.detail?.name === 'admin-right-panel') replayLastPayload();
});
