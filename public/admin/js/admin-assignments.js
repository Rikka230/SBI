/**
 * SBI 8.0P.167.273 — Écran ADMIN « Devoirs & Évaluations ».
 *
 * Shell maître-détail (cf. admin-late-students) :
 * - chips : À valider · Publiés · Brouillons · Archivés · Tous ;
 * - file de validation (approuver / rejeter) ;
 * - suivi des dépôts par devoir (qui a déposé, qui est corrigé) ;
 * - création (formulaire mutualisé, publication directe).
 *
 * Écritures sensibles via Cloud Functions. Lecture client (admin lit tout).
 */

import { auth, db } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  escapeHtml,
  kindMeta,
  statusMeta,
  subStatusMeta,
  formatDate,
  formatDateTime,
  formatNote,
  snapToArray,
  timestampToMs,
  assignmentCallable,
  getCallableMessage,
  loadFormationsForCreation
} from '/js/assignments/assignment-data.js?v=8.0P.167.273';
import { buildAssignmentFormHtml, wireAssignmentForm } from '/js/assignments/assignment-form.js?v=8.0P.167.273';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;
let currentAdmin = null;
let formCleanup = null;

let assignments = [];
let submissionsByAssignment = new Map();
let formations = [];
let filter = 'pending';
let search = '';
let selectedId = '';
let selectedSubmissionId = '';
let mode = 'view'; // view | create | edit

const FILTERS = [
  { key: 'pending', label: 'À valider', match: (a) => a.status === 'pending_validation' },
  { key: 'published', label: 'Publiés', match: (a) => a.status === 'published' },
  { key: 'draft', label: 'Brouillons', match: (a) => a.status === 'draft' || a.status === 'rejected' },
  { key: 'archived', label: 'Archivés', match: (a) => a.status === 'archived' },
  { key: 'all', label: 'Tous', match: () => true }
];

function root() { return document.getElementById('asg-root'); }

function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-asg-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}

async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Profil admin introuvable.');
  const profile = snap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');
  currentAdmin = { uid: user.uid, profile };
}

async function loadData() {
  const [aSnap, sSnap] = await Promise.all([
    getDocs(collection(db, 'assignments')),
    getDocs(collection(db, 'assignmentSubmissions'))
  ]);
  assignments = snapToArray(aSnap).sort((a, b) => timestampToMs(b.updatedAt) - timestampToMs(a.updatedAt));
  submissionsByAssignment = new Map();
  snapToArray(sSnap).forEach((sub) => {
    const list = submissionsByAssignment.get(sub.assignmentId) || [];
    list.push(sub);
    submissionsByAssignment.set(sub.assignmentId, list);
  });
  formations = await loadFormationsForCreation({ db, isAdmin: true, uid: currentAdmin.uid, userData: {} });
  render();
}

function filteredAssignments() {
  const def = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const needle = search.trim().toLowerCase();
  return assignments
    .filter((a) => def.match(a))
    .filter((a) => !needle || `${a.title} ${a.formationName} ${a.promotionName}`.toLowerCase().includes(needle));
}

function pendingSubmissionsCount() {
  let n = 0;
  submissionsByAssignment.forEach((list) => list.forEach((s) => { if (s.status === 'pending') n += 1; }));
  return n;
}

function badge(label, tone) {
  return `<span class="sbi-asg-badge" data-tone="${tone}">${escapeHtml(label)}</span>`;
}

function render() {
  const r = root();
  if (!r) return;

  const counts = {};
  FILTERS.forEach((f) => { counts[f.key] = assignments.filter((a) => f.match(a)).length; });

  r.innerHTML = `
    <div class="sbi-asg-head">
      <h1>Devoirs & Évaluations</h1>
      <p>Validez les devoirs proposés par les professeurs, suivez les dépôts des élèves et créez vos propres devoirs/évaluations.</p>
    </div>

    <div class="sbi-asg-metrics">
      <div class="sbi-asg-metric"><strong>${assignments.length}</strong><span>devoirs &amp; évals</span></div>
      <div class="sbi-asg-metric"><strong>${counts.pending}</strong><span>à valider</span></div>
      <div class="sbi-asg-metric"><strong>${counts.published}</strong><span>publiés</span></div>
      <div class="sbi-asg-metric"><strong>${pendingSubmissionsCount()}</strong><span>dépôts à corriger</span></div>
    </div>

    <div class="sbi-asg-chips" data-asg-chips>
      ${FILTERS.map((f) => `
        <button type="button" class="sbi-asg-chip ${filter === f.key ? 'is-active' : ''}" data-filter="${f.key}">
          ${escapeHtml(f.label)} <span class="sbi-asg-count">${counts[f.key]}</span>
        </button>`).join('')}
      <button type="button" class="sbi-asg-btn primary" data-asg-create style="margin-left:auto;">+ Créer un devoir / une évaluation</button>
    </div>

    <div class="sbi-asg-toolbar">
      <div class="sbi-asg-search"><input type="search" placeholder="Rechercher (titre, formation, promotion)…" value="${escapeHtml(search)}" data-asg-search></div>
    </div>

    <div class="sbi-asg-shell">
      <div class="sbi-asg-list" data-asg-list>${renderList()}</div>
      <div class="sbi-asg-detail" data-asg-detail>${renderDetail()}</div>
    </div>
  `;
  bindEvents();
}

function renderListItem(a) {
  const km = kindMeta(a.kind);
  const sm = statusMeta(a.status);
  const subs = submissionsByAssignment.get(a.id) || [];
  const corrected = subs.filter((s) => s.status === 'corrected').length;
  return `
    <button type="button" class="sbi-asg-item ${selectedId === a.id ? 'is-selected' : ''}" data-asg-id="${escapeHtml(a.id)}">
      <div class="sbi-asg-item__title">${km.icon} ${escapeHtml(a.title || 'Sans titre')}</div>
      <div class="sbi-asg-item__meta">
        <span>${escapeHtml(a.formationName || '—')}</span>
        ${a.promotionName ? `<span>· ${escapeHtml(a.promotionName)}</span>` : ''}
        ${a.dueAt ? `<span>· ${escapeHtml(formatDate(a.dueAt))}</span>` : ''}
      </div>
      <div class="sbi-asg-item__badges">
        ${badge(km.label, a.kind === 'evaluation' ? 'info' : 'muted')}
        ${badge(sm.label, sm.tone)}
        ${subs.length ? badge(`${corrected}/${subs.length} corrigés`, corrected === subs.length ? 'success' : 'pending') : ''}
      </div>
    </button>
  `;
}

function renderList() {
  const list = filteredAssignments();
  if (!list.length) return '<div class="sbi-asg-status">Aucun devoir dans ce filtre.</div>';
  return list.map(renderListItem).join('');
}

function renderDetail() {
  if (mode === 'create' || mode === 'edit') {
    const editing = mode === 'edit' ? assignments.find((a) => a.id === selectedId) : null;
    return `
      <h2>${mode === 'edit' ? 'Modifier' : 'Créer'} un devoir / une évaluation</h2>
      <p class="sbi-asg-detail__sub">En tant qu'admin, « Publier » met le devoir en ligne immédiatement.</p>
      ${buildAssignmentFormHtml({ assignment: editing, formations, isAdmin: true })}
    `;
  }

  const a = assignments.find((x) => x.id === selectedId);
  if (!a) return '<div class="sbi-asg-detail__empty">Sélectionne un devoir à gauche pour voir le détail, la validation et le suivi des dépôts.</div>';

  const km = kindMeta(a.kind);
  const sm = statusMeta(a.status);
  const subs = (submissionsByAssignment.get(a.id) || []).slice().sort((x, y) => timestampToMs(y.submittedAt) - timestampToMs(x.submittedAt));

  let actions = '';
  if (a.status === 'pending_validation') {
    actions = `
      <div class="sbi-asg-section-title">Validation</div>
      <textarea class="sbi-asg-textarea" rows="2" placeholder="Motif (en cas de rejet)" data-asg-reason></textarea>
      <div class="sbi-asg-actions">
        <button type="button" class="sbi-asg-btn primary" data-asg-validate="approve">Approuver &amp; publier</button>
        <button type="button" class="sbi-asg-btn danger" data-asg-validate="reject">Rejeter</button>
      </div>`;
  } else if (a.status === 'draft' || a.status === 'rejected') {
    actions = `
      ${a.status === 'rejected' && a.rejectionReason ? `<p class="sbi-asg-status" data-tone="error">Rejeté : ${escapeHtml(a.rejectionReason)}</p>` : ''}
      <div class="sbi-asg-actions">
        <button type="button" class="sbi-asg-btn primary" data-asg-edit>Modifier / publier</button>
      </div>`;
  } else if (a.status === 'published') {
    actions = `
      <div class="sbi-asg-actions">
        <button type="button" class="sbi-asg-btn" data-asg-edit>Modifier</button>
        <button type="button" class="sbi-asg-btn" data-asg-validate="archive">Archiver</button>
      </div>`;
  } else if (a.status === 'archived') {
    actions = `<div class="sbi-asg-actions"><button type="button" class="sbi-asg-btn" data-asg-validate="republish">Republier</button></div>`;
  }

  const corrected = subs.filter((s) => s.status === 'corrected').length;
  const tracking = `
    <div class="sbi-asg-section-title">Suivi des dépôts (${subs.length}${subs.length ? ` · ${corrected} corrigés` : ''})</div>
    ${subs.length ? `
      <table class="sbi-asg-table">
        <thead><tr><th>Élève</th><th>Déposé le</th><th>Statut</th><th>Note</th><th></th></tr></thead>
        <tbody>
          ${subs.map((s) => {
            const ssm = subStatusMeta(s.status);
            return `<tr>
              <td>${escapeHtml(s.studentName || s.studentUid || '—')}</td>
              <td>${escapeHtml(formatDateTime(s.submittedAt) || '—')}</td>
              <td>${badge(ssm.label, ssm.tone)}</td>
              <td>${escapeHtml(formatNote(s.correction) || '—')}</td>
              <td><button type="button" class="sbi-asg-btn ghost" data-open-sub="${escapeHtml(s.id)}" style="padding:.25rem .55rem;">${s.status === 'corrected' ? 'Revoir' : 'Corriger'}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<p class="sbi-asg-status">Aucun dépôt pour le moment.</p>'}
    ${selectedSubmissionId ? renderAdminCorrection(subs.find((s) => s.id === selectedSubmissionId), a) : ''}
  `;

  return `
    <h2>${km.icon} ${escapeHtml(a.title || 'Sans titre')}</h2>
    <div class="sbi-asg-detail__sub">
      ${badge(km.label, a.kind === 'evaluation' ? 'info' : 'muted')}
      ${badge(sm.label, sm.tone)}
      ${a.kind === 'evaluation' && a.gradeMax ? `<span>Barème /${escapeHtml(String(a.gradeMax))}</span>` : ''}
      <span>${escapeHtml(a.formationName || '—')}${a.promotionName ? ` · ${escapeHtml(a.promotionName)}` : ''}</span>
      <span>${escapeHtml(formatDate(a.dueAt))}</span>
      ${a.isQualiopiEvidence ? badge('Qualiopi', 'success') : ''}
      ${a.createdByName ? `<span>par ${escapeHtml(a.createdByName)}</span>` : ''}
    </div>
    ${a.consigne ? `<div class="sbi-asg-consigne">${escapeHtml(a.consigne)}</div>` : '<p class="sbi-asg-status">Aucune consigne saisie.</p>'}
    ${actions}
    ${a.status === 'published' || a.status === 'archived' ? tracking : ''}
    <div class="sbi-asg-actions" style="margin-top:1.25rem; border-top:1px solid var(--border-color,#333); padding-top:.9rem;">
      <button type="button" class="sbi-asg-btn danger" data-asg-delete="${escapeHtml(a.id)}">Supprimer ce devoir</button>
    </div>
  `;
}

function renderFileLinks(files) {
  if (!Array.isArray(files) || !files.length) return '<p class="sbi-asg-status">Aucun fichier déposé.</p>';
  return `<ul class="sbi-asg-filelist">${files.map((f) => `
    <li>📎 ${f.downloadURL ? `<a href="${escapeHtml(f.downloadURL)}" target="_blank" rel="noopener">${escapeHtml(f.fileName || 'fichier')}</a>` : escapeHtml(f.fileName || 'fichier')}</li>
  `).join('')}</ul>`;
}

function renderAdminCorrection(sub, a) {
  if (!sub) return '';
  const isEval = a.kind === 'evaluation';
  const gradeMax = Number(a.gradeMax) > 0 ? Number(a.gradeMax) : 20;
  const corr = sub.correction || null;
  return `
    <div class="sbi-asg-section-title">Correction — ${escapeHtml(sub.studentName || sub.studentUid || 'Élève')}</div>
    ${renderFileLinks(sub.files)}
    ${sub.text ? `<div class="sbi-asg-consigne" style="margin-top:.5rem;">${escapeHtml(sub.text)}</div>` : ''}
    <div class="sbi-asg-field" style="margin-top:.6rem;">
      <label for="asg-admin-feedback">Retour à l'élève</label>
      <textarea id="asg-admin-feedback" class="sbi-asg-textarea" rows="4" placeholder="Points forts, axes d'amélioration…">${escapeHtml(corr?.feedback || '')}</textarea>
    </div>
    ${isEval ? `
      <div class="sbi-asg-field" style="max-width:220px;">
        <label for="asg-admin-note">Note (sur ${gradeMax})</label>
        <input id="asg-admin-note" class="sbi-asg-input" type="number" min="0" max="${gradeMax}" step="0.5" value="${corr && Number.isFinite(Number(corr.note)) ? escapeHtml(String(corr.note)) : ''}">
      </div>` : ''}
    <p class="sbi-asg-status" data-asg-corr-status hidden></p>
    <div class="sbi-asg-actions">
      <button type="button" class="sbi-asg-btn primary" data-asg-correct="${escapeHtml(sub.id)}">${corr ? 'Mettre à jour la correction' : 'Enregistrer la correction'}</button>
      <button type="button" class="sbi-asg-btn ghost" data-asg-close-sub>Fermer</button>
    </div>
  `;
}

function teardownForm() {
  formCleanup?.();
  formCleanup = null;
}

function mountFormIfNeeded() {
  if (mode !== 'create' && mode !== 'edit') return;
  const detail = root()?.querySelector('[data-asg-detail]');
  if (!detail) return;
  const editing = mode === 'edit' ? assignments.find((a) => a.id === selectedId) : null;
  formCleanup = wireAssignmentForm({
    root: detail,
    db,
    isAdmin: true,
    assignment: editing,
    onSaved: async () => {
      mode = 'view';
      teardownForm();
      await loadData();
    },
    onCancel: () => { mode = 'view'; teardownForm(); render(); }
  });
}

async function handleValidate(decision, button) {
  const a = assignments.find((x) => x.id === selectedId);
  if (!a) return;
  let rejectionReason = '';
  if (decision === 'reject') {
    rejectionReason = root()?.querySelector('[data-asg-reason]')?.value?.trim() || '';
    if (!window.confirm('Rejeter ce devoir ? Le professeur pourra le corriger et le re-soumettre.')) return;
  }
  button.disabled = true;
  try {
    await assignmentCallable('validateAssignment')({ assignmentId: a.id, decision, rejectionReason });
    await loadData();
  } catch (error) {
    console.error('[SBI Assignments admin] validation impossible :', error);
    window.alert(getCallableMessage(error, 'Validation impossible.'));
    button.disabled = false;
  }
}

async function handleDelete(assignmentId, button) {
  const a = assignments.find((x) => x.id === assignmentId);
  if (!a) return;
  const subs = submissionsByAssignment.get(assignmentId) || [];
  const warn = subs.length
    ? `Supprimer « ${a.title || 'ce devoir'} » ET les ${subs.length} dépôt(s) associé(s) ? Cette action est définitive.`
    : `Supprimer définitivement « ${a.title || 'ce devoir'} » ?`;
  if (!window.confirm(warn)) return;
  button.disabled = true;
  try {
    await assignmentCallable('deleteAssignment')({ assignmentId });
    selectedId = '';
    selectedSubmissionId = '';
    await loadData();
  } catch (error) {
    console.error('[SBI Assignments admin] suppression impossible :', error);
    window.alert(getCallableMessage(error, 'Suppression impossible.'));
    button.disabled = false;
  }
}

async function handleCorrect(submissionId, button) {
  const feedback = root()?.querySelector('#asg-admin-feedback')?.value?.trim() || '';
  const noteInput = root()?.querySelector('#asg-admin-note');
  const note = noteInput ? noteInput.value : undefined;
  const statusEl = root()?.querySelector('[data-asg-corr-status]');
  const setCorrStatus = (m, tone = 'muted') => { if (statusEl) { statusEl.hidden = !m; statusEl.textContent = m; statusEl.dataset.tone = tone; } };
  if (!feedback && (note === undefined || String(note).trim() === '')) {
    setCorrStatus('Ajoute un retour ou une note.', 'error');
    return;
  }
  button.disabled = true;
  setCorrStatus('Enregistrement…');
  try {
    await assignmentCallable('correctAssignmentSubmission')({ submissionId, feedback, note });
    await loadData();
  } catch (error) {
    console.error('[SBI Assignments admin] correction impossible :', error);
    setCorrStatus(getCallableMessage(error, 'Correction impossible.'), 'error');
    button.disabled = false;
  }
}

function bindEvents() {
  const r = root();
  if (!r) return;

  r.querySelector('[data-asg-chips]')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (chip) { filter = chip.dataset.filter; render(); return; }
    if (e.target.closest('[data-asg-create]')) { mode = 'create'; selectedId = ''; render(); }
  });

  r.querySelector('[data-asg-search]')?.addEventListener('input', (e) => {
    search = e.target.value;
    const listEl = r.querySelector('[data-asg-list]');
    if (listEl) listEl.innerHTML = renderList();
  });

  r.querySelector('[data-asg-list]')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-asg-id]');
    if (!item) return;
    selectedId = item.dataset.asgId;
    selectedSubmissionId = '';
    mode = 'view';
    teardownForm();
    render();
  });

  const detail = r.querySelector('[data-asg-detail]');
  detail?.addEventListener('click', (e) => {
    const validateBtn = e.target.closest('[data-asg-validate]');
    if (validateBtn) { handleValidate(validateBtn.dataset.asgValidate, validateBtn); return; }
    if (e.target.closest('[data-asg-edit]')) { mode = 'edit'; render(); return; }
    const deleteBtn = e.target.closest('[data-asg-delete]');
    if (deleteBtn) { handleDelete(deleteBtn.dataset.asgDelete, deleteBtn); return; }
    const correctBtn = e.target.closest('[data-asg-correct]');
    if (correctBtn) { handleCorrect(correctBtn.dataset.asgCorrect, correctBtn); return; }
    const openSub = e.target.closest('[data-open-sub]');
    if (openSub) { selectedSubmissionId = openSub.dataset.openSub; render(); return; }
    if (e.target.closest('[data-asg-close-sub]')) { selectedSubmissionId = ''; render(); return; }
  });

  mountFormIfNeeded();
}

export function mountAdminAssignments() {
  const view = document.getElementById('view-assignments');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_ADMIN_ASSIGNMENTS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadData();
    } catch (error) {
      console.warn('[SBI Assignments admin] accès refusé :', error);
      setStatus(error?.message || 'Accès réservé aux administrateurs.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false;
    mountedView = null;
    teardownForm();
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
  window.SBI_ADMIN_ASSIGNMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminAssignments(), { once: true });
} else {
  mountAdminAssignments();
}
