import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
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
  await renderActivity({ db, uid, data, context });
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

async function renderActivity({ db, uid, data = {}, context }) {
  const list = document.getElementById('prof-activity-list');
  if (!list) return;

  const fallbackCreationDate = data.dateCreation
    ? formatSbiDate(data.dateCreation, 'Date inconnue')
    : formatSbiDate(data.createdAt, 'Date inconnue');

  if (!context.isAdmin) {
    list.innerHTML = `
      <li style="line-height:1.7;">
        <strong style="color:#fff;">Création du compte</strong>
        <span style="color:var(--text-muted);"> · ${escapeHTML(fallbackCreationDate)}</span>
      </li>
    `;
    return;
  }

  list.innerHTML = `
    <li style="list-style:none; padding:0.75rem 0; color:var(--text-muted);">
      Chargement du journal compte...
    </li>
  `;

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

    if (logs.length === 0) {
      list.innerHTML = `
        <li style="line-height:1.7;">
          <strong style="color:#fff;">Création du compte</strong>
          <span style="color:var(--text-muted);"> · ${escapeHTML(fallbackCreationDate)}</span>
        </li>
        <li style="list-style:none; margin-top:0.75rem; color:var(--text-muted);">
          Aucun journal compte détaillé pour le moment.
        </li>
      `;
      return;
    }

    list.innerHTML = logs.slice(0, 50).map(renderAccountLogItem).join('');
  } catch (error) {
    console.warn('[SBI Profile] Journal compte indisponible :', error);
    list.innerHTML = `
      <li style="line-height:1.7;">
        <strong style="color:#fff;">Création du compte</strong>
        <span style="color:var(--text-muted);"> · ${escapeHTML(fallbackCreationDate)}</span>
      </li>
      <li style="list-style:none; margin-top:0.75rem; color:#fbbc04;">
        Journal compte indisponible pour le moment.
      </li>
    `;
  }
}

function renderAccountLogItem(log = {}) {
  const meta = getAccountLogMeta(log.type);
  const date = formatSbiDate(log.createdAt, 'Date inconnue');
  const actor = getAccountLogActor(log);
  const details = getAccountLogDetails(log);

  return `
    <li style="
      list-style:none;
      margin:0 0 0.75rem 0;
      padding:0.85rem 0.95rem;
      border:1px solid rgba(255,255,255,0.08);
      border-left:3px solid ${meta.color};
      border-radius:10px;
      background:rgba(255,255,255,0.035);
    ">
      <div style="display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; align-items:flex-start;">
        <strong style="color:#fff; font-size:0.92rem;">${escapeHTML(meta.label)}</strong>
        <span style="color:var(--text-muted); font-size:0.78rem;">${escapeHTML(date)}</span>
      </div>
      <div style="margin-top:0.35rem; color:var(--text-muted); font-size:0.82rem; line-height:1.55;">
        ${escapeHTML(actor)}
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

  if (log.emailSent === true) details.push('Email envoyé');
  if (log.emailSent === false) details.push('Email non envoyé');
  if (log.page) details.push(`Page : ${log.page}`);
  if (log.targetRole) details.push(`Rôle : ${log.targetRole}`);
  if (log.updated !== undefined) details.push(`Éléments mis à jour : ${log.updated}`);
  if (log.skipped !== undefined) details.push(`Éléments inchangés : ${log.skipped}`);

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
