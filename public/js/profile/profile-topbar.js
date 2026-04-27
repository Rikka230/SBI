import { escapeHTML, getDisplayName, getInitials } from './profile-utils.js';

export function hydrateLoggedInTopbar(userData = {}) {
  const displayName = getDisplayName(userData, 'Étudiant');
  const avatarUrl = userData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111&color=fff`;
  const xp = Number(userData.xp) || 0;
  const level = Math.floor(xp / 100) + 1;

  const topName = document.getElementById('top-user-name');
  if (topName) topName.textContent = displayName;

  const topAvatar = document.getElementById('top-user-avatar');
  if (topAvatar) {
    topAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHTML(displayName)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.remove(); this.parentElement.textContent='${getInitials(displayName)}';">`;
  }

  const topLevel = document.getElementById('top-user-level');
  if (topLevel) topLevel.textContent = userData.role === 'teacher' ? 'Coach SBI' : `Niveau ${level}`;
}

export function hydrateOwnerAvatarInTopbar(downloadURL, displayName) {
  const topAvatar = document.getElementById('top-user-avatar');
  if (!topAvatar || !downloadURL) return;
  topAvatar.innerHTML = `<img src="${downloadURL}" alt="${escapeHTML(displayName)}" style="width:100%; height:100%; object-fit:cover;">`;
}
