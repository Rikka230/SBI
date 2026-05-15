/**
 * SBI 8.0P.166.4 — Chargement rapide du panel profil droit
 *
 * Objectif :
 * - ne pas attendre waitForSbiTopbar() pour afficher le profil admin ;
 * - afficher un cache session immédiatement si disponible ;
 * - lire Firestore une seule fois au login ;
 * - appliquer les données dès que les éléments du panel existent ;
 * - ne pas toucher à la logique notifications existante.
 */

import { db, auth } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

const CACHE_PREFIX = 'sbi:fastProfilePanel:';
const MAX_APPLY_ATTEMPTS = 12;

let lastAppliedUid = '';
let currentApplyToken = 0;

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

function applyProfileToPanel(uid, profile, attempt = 0, token = currentApplyToken) {
  if (!uid || !profile || token !== currentApplyToken) return;

  const topName = document.getElementById('top-user-name');
  const topAvatar = document.getElementById('top-user-avatar');
  const topLevel = document.getElementById('top-user-level');

  if (!topName && !topAvatar && !topLevel) {
    if (attempt < MAX_APPLY_ATTEMPTS) {
      window.setTimeout(() => applyProfileToPanel(uid, profile, attempt + 1, token), attempt < 4 ? 80 : 160);
    }
    return;
  }

  const displayName = getDisplayName(profile);
  const avatarUrl = getAvatarUrl(profile, displayName);
  const userXp = Number(profile.xp || 0);
  const userLevel = Math.floor(userXp / 100) + 1;

  if (topName) topName.textContent = displayName;

  if (topAvatar) {
    topAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;" alt="${escapeAttr(displayName)}" onerror="this.remove(); this.parentElement.textContent='${escapeAttr(displayName.charAt(0).toUpperCase() || 'U')}';">`;
  }

  if (topLevel) topLevel.textContent = `Niveau ${userLevel}`;

  lastAppliedUid = uid;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    currentApplyToken += 1;
    const token = currentApplyToken;

    if (!user?.uid) {
      lastAppliedUid = '';
      return;
    }

    const uid = user.uid;
    const cached = readCachedProfile(uid);

    if (cached) {
      applyProfileToPanel(uid, cached, 0, token);
    }

    try {
      const fresh = await loadFreshProfile(uid);
      if (fresh && token === currentApplyToken) {
        applyProfileToPanel(uid, fresh, 0, token);
      }
    } catch (error) {
      if (!cached && window.localStorage?.getItem('sbiDebugAccess') === 'true') {
        console.warn('[SBI Profile Panel] Profil rapide non chargé :', error);
      }
    }
  });
});

window.addEventListener('sbi:components-ready', () => {
  const user = auth.currentUser;
  if (!user?.uid || lastAppliedUid === user.uid) return;

  const cached = readCachedProfile(user.uid);
  if (cached) {
    currentApplyToken += 1;
    applyProfileToPanel(user.uid, cached, 0, currentApplyToken);
  }
});
