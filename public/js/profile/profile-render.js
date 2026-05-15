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

const ACCOUNT_PREPARATION_LABELS = {
  not_prepared: 'Compte à préparer',
  to_check: 'À vérifier',
  ready: 'Prêt',
  completed: 'Terminé'
};

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

  renderAccountActionsPanel({ uid, data, reloadProfile });

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
    const compactLogs = compactAccountLogs(logs);

    if (compactLogs.length === 0) {
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

    list.innerHTML = compactLogs.slice(0, 10).map(renderAccountLogItem).join('');
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

function normalizePreparationState(value) {
  return Object.prototype.hasOwnProperty.call(ACCOUNT_PREPARATION_LABELS, value) ? value : 'not_prepared';
}

function renderAccountActionsPanel({ uid, data = {}, reloadProfile }) {
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
            Suivi manuel, notes internes et renvoi d’accès sécurisé.
          </p>
        </div>
        <button id="prof-resend-access-btn" type="button" style="
          border:1px solid rgba(251,188,4,0.45);
          background:rgba(251,188,4,0.10);
          color:#fbbc04;
          border-radius:999px;
          padding:0.55rem 0.85rem;
          font-weight:800;
          cursor:pointer;
        ">Renvoyer accès</button>
      </div>

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
        background:rgba(255,255,255,0.035);
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
  const resendButton = panel.querySelector('#prof-resend-access-btn');
  const noteTextarea = panel.querySelector('#prof-account-note');
  const notePreviewText = panel.querySelector('#prof-account-note-preview-text');
  const notePreviewMeta = panel.querySelector('#prof-account-note-meta');

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

  const changes = log.changes || {};
  if (changes.preparationState?.afterLabel) details.push(`Suivi : ${changes.preparationState.afterLabel}`);
  if (changes.accountNote) details.push('Note interne modifiée');

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
