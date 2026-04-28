import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { escapeHTML, getDisplayName, SVG_EDIT } from './profile-utils.js';
import { maybeMigrateVisibleLegacyAvatar } from './profile-avatar-cropper.js';
import { updateProfilePresenceStatus } from './profile-presence.js';

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
  renderActivity(data);
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

function renderActivity(data = {}) {
  const list = document.getElementById('prof-activity-list');
  if (!list) return;
  list.innerHTML = `<li>Création du compte : ${data.dateCreation ? new Date(data.dateCreation).toLocaleDateString() : 'Date inconnue'}</li>`;
}
