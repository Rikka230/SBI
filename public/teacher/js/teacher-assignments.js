/**
 * SBI 8.0P.167.273 — Espace PROF « Devoirs & Évaluations ».
 *
 * Onglets : « À corriger » (dépôts en attente dans ses formations) et
 * « Mes devoirs » (devoirs de ses formations + édition de ses brouillons).
 * Création → part en validation admin. Correction via Cloud Function.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, documentId
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  escapeHtml, kindMeta, statusMeta, subStatusMeta, formatDate, formatDateTime, formatNote,
  snapToArray, timestampToMs, chunk, assignmentCallable, getCallableMessage,
  loadFormationsForCreation, TEACHER_ROLES, cursusBadgeHtml
} from '/js/assignments/assignment-data.js?v=8.0P.167.360';
import { buildAssignmentFormHtml, wireAssignmentForm } from '/js/assignments/assignment-form.js?v=8.0P.167.360';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;
let formCleanup = null;

let caller = null; // {uid, isAdmin}
let formations = [];
let formationIds = [];
let assignments = [];
let assignmentById = new Map();
let submissions = [];
let submissionsByAssignment = new Map();

let tab = 'correct'; // correct | assignments
let search = '';
let selectedSubmissionId = '';
let selectedAssignmentId = '';
let mode = 'view'; // view | create | edit

function root() { return document.getElementById('asg-root'); }
function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-asg-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}
function badge(label, tone) { return `<span class="sbi-asg-badge" data-tone="${tone}">${escapeHtml(label)}</span>`; }

async function loadCaller(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Compte introuvable.');
  const data = snap.data() || {};
  const isAdmin = data.isGod === true || data.role === 'admin';
  const isTeacher = TEACHER_ROLES.includes(String(data.role || '').toLowerCase());
  if (!isAdmin && !isTeacher) throw new Error('Accès réservé aux professeurs.');
  caller = { uid: user.uid, isAdmin, data };
}

async function queryByFormationIn(collectionName) {
  const out = [];
  for (const part of chunk(formationIds, 10)) {
    if (!part.length) continue;
    try {
      const snap = await getDocs(query(collection(db, collectionName), where('formationId', 'in', part)));
      out.push(...snapToArray(snap));
    } catch (error) {
      console.warn(`[SBI Assignments prof] requête ${collectionName} échouée :`, error?.message || error);
    }
  }
  return out;
}

async function loadData() {
  formations = await loadFormationsForCreation({ db, isAdmin: caller.isAdmin, uid: caller.uid, userData: caller.data });
  formationIds = formations.map((f) => f.id);

  if (!formationIds.length) {
    assignments = []; submissions = [];
  } else {
    assignments = await queryByFormationIn('assignments');
    submissions = await queryByFormationIn('assignmentSubmissions');
  }

  assignmentById = new Map(assignments.map((a) => [a.id, a]));
  submissionsByAssignment = new Map();
  submissions.forEach((s) => {
    const list = submissionsByAssignment.get(s.assignmentId) || [];
    list.push(s);
    submissionsByAssignment.set(s.assignmentId, list);
  });

  assignments.sort((a, b) => timestampToMs(b.updatedAt) - timestampToMs(a.updatedAt));
  render();
}

function pendingSubmissions() {
  return submissions
    .filter((s) => s.status === 'pending')
    .sort((a, b) => timestampToMs(a.submittedAt) - timestampToMs(b.submittedAt)); // plus anciens d'abord
}

function render() {
  const r = root();
  if (!r) return;

  const pending = pendingSubmissions();
  const correctedCount = submissions.filter((s) => s.status === 'corrected').length;

  r.innerHTML = `
    <div class="sbi-asg-head">
      <h1>Devoirs & Évaluations</h1>
      <p>Corrigez les dépôts de vos élèves et créez des devoirs/évaluations (validés ensuite par l'administration).</p>
    </div>

    <div class="sbi-asg-chips" data-asg-chips>
      <button type="button" class="sbi-asg-chip ${tab === 'correct' ? 'is-active' : ''}" data-tab="correct">À corriger <span class="sbi-asg-count">${pending.length}</span></button>
      <button type="button" class="sbi-asg-chip ${tab === 'assignments' ? 'is-active' : ''}" data-tab="assignments">Mes devoirs <span class="sbi-asg-count">${assignments.length}</span></button>
      <button type="button" class="sbi-asg-btn primary" data-asg-create style="margin-left:auto;">+ Créer</button>
    </div>

    ${!formationIds.length ? '<div class="sbi-asg-status">Aucune formation ne vous est rattachée pour le moment.</div>' : `
    <div class="sbi-asg-shell">
      <div class="sbi-asg-list" data-asg-list>${tab === 'correct' ? renderCorrectList(pending) : renderAssignmentList()}</div>
      <div class="sbi-asg-detail" data-asg-detail>${renderDetail()}</div>
    </div>`}
  `;
  bindEvents();
}

function renderCorrectList(pending) {
  if (!pending.length) return '<div class="sbi-asg-status">Aucun dépôt en attente de correction. 🎉</div>';
  return pending.map((s) => {
    const a = assignmentById.get(s.assignmentId) || {};
    const km = kindMeta(a.kind);
    return `
      <button type="button" class="sbi-asg-item ${selectedSubmissionId === s.id ? 'is-selected' : ''}" data-sub-id="${escapeHtml(s.id)}">
        <div class="sbi-asg-item__title">${escapeHtml(s.studentName || s.studentUid || 'Élève')}</div>
        <div class="sbi-asg-item__meta"><span>${km.icon} ${escapeHtml(a.title || 'Devoir')}</span><span>· ${escapeHtml(s.formationName || a.formationName || '')}</span></div>
        <div class="sbi-asg-item__meta"><span>Déposé le ${escapeHtml(formatDateTime(s.submittedAt) || '—')}</span></div>
      </button>`;
  }).join('');
}

function renderAssignmentList() {
  const needle = search.trim().toLowerCase();
  const list = assignments.filter((a) => !needle || `${a.title} ${a.formationName}`.toLowerCase().includes(needle));
  if (!list.length) return '<div class="sbi-asg-status">Aucun devoir.</div>';
  return list.map((a) => {
    const km = kindMeta(a.kind);
    const sm = statusMeta(a.status);
    const subs = submissionsByAssignment.get(a.id) || [];
    return `
      <button type="button" class="sbi-asg-item ${selectedAssignmentId === a.id ? 'is-selected' : ''}" data-asg-id="${escapeHtml(a.id)}">
        <div class="sbi-asg-item__title">${km.icon} ${escapeHtml(a.title || 'Sans titre')}</div>
        <div class="sbi-asg-item__meta"><span>${escapeHtml(a.formationName || '')}</span>${a.promotionName ? `<span>· ${escapeHtml(a.promotionName)}</span>` : ''}</div>
        <div class="sbi-asg-item__badges">${badge(sm.label, sm.tone)}${cursusBadgeHtml(a)}${subs.length ? badge(`${subs.length} dépôt(s)`, 'info') : ''}</div>
      </button>`;
  }).join('');
}

function renderFileLinks(files) {
  if (!Array.isArray(files) || !files.length) return '<p class="sbi-asg-status">Aucun fichier déposé.</p>';
  return `<ul class="sbi-asg-filelist">${files.map((f) => `
    <li>📎 ${f.downloadURL ? `<a href="${escapeHtml(f.downloadURL)}" target="_blank" rel="noopener">${escapeHtml(f.fileName || 'fichier')}</a>` : escapeHtml(f.fileName || 'fichier')}</li>
  `).join('')}</ul>`;
}

function renderDetail() {
  if (mode === 'create' || mode === 'edit') {
    const editing = mode === 'edit' ? assignmentById.get(selectedAssignmentId) : null;
    return `
      <h2>${mode === 'edit' ? 'Modifier' : 'Créer'} un devoir / une évaluation</h2>
      <p class="sbi-asg-detail__sub">À l'envoi, le devoir part en validation auprès de l'administration.</p>
      ${buildAssignmentFormHtml({ assignment: editing, formations, isAdmin: false })}
    `;
  }

  if (tab === 'correct') return renderCorrectionDetail();
  return renderAssignmentDetail();
}

function renderCorrectionDetail() {
  const s = submissions.find((x) => x.id === selectedSubmissionId);
  if (!s) return '<div class="sbi-asg-detail__empty">Sélectionne un dépôt à corriger.</div>';
  const a = assignmentById.get(s.assignmentId) || {};
  const km = kindMeta(a.kind);
  const isEval = a.kind === 'evaluation';
  const gradeMax = Number(a.gradeMax) > 0 ? Number(a.gradeMax) : 20;
  const corr = s.correction || null;

  return `
    <h2>${km.icon} ${escapeHtml(a.title || 'Devoir')}</h2>
    <div class="sbi-asg-detail__sub">
      <span><strong>${escapeHtml(s.studentName || 'Élève')}</strong></span>
      <span>${escapeHtml(s.formationName || a.formationName || '')}</span>
      <span>Déposé le ${escapeHtml(formatDateTime(s.submittedAt) || '—')}</span>
      ${badge(subStatusMeta(s.status).label, subStatusMeta(s.status).tone)}
    </div>
    ${a.consigne ? `<div class="sbi-asg-section-title">Consigne</div><div class="sbi-asg-consigne">${escapeHtml(a.consigne)}</div>` : ''}

    <div class="sbi-asg-section-title">Dépôt de l'élève</div>
    ${renderFileLinks(s.files)}
    ${s.text ? `<div class="sbi-asg-consigne" style="margin-top:.5rem;">${escapeHtml(s.text)}</div>` : ''}

    <div class="sbi-asg-section-title">${corr ? 'Mettre à jour la correction' : 'Corriger'}</div>
    <div class="sbi-asg-field">
      <label for="asg-feedback">Retour à l'élève</label>
      <textarea id="asg-feedback" class="sbi-asg-textarea" rows="5" placeholder="Points forts, axes d'amélioration…">${escapeHtml(corr?.feedback || '')}</textarea>
    </div>
    ${isEval ? `
      <div class="sbi-asg-field" style="max-width:220px;">
        <label for="asg-note">Note (sur ${gradeMax})</label>
        <input id="asg-note" class="sbi-asg-input" type="number" min="0" max="${gradeMax}" step="0.5" value="${corr && Number.isFinite(Number(corr.note)) ? escapeHtml(String(corr.note)) : ''}">
      </div>` : ''}
    <p class="sbi-asg-status" data-asg-corr-status hidden></p>
    <div class="sbi-asg-actions">
      <button type="button" class="sbi-asg-btn primary" data-asg-correct="${escapeHtml(s.id)}">${corr ? 'Mettre à jour' : 'Enregistrer la correction'}</button>
      <button type="button" class="sbi-asg-btn danger" data-asg-delsub="${escapeHtml(s.id)}">Supprimer ce dépôt</button>
    </div>
  `;
}

function renderAssignmentDetail() {
  const a = assignmentById.get(selectedAssignmentId);
  if (!a) return '<div class="sbi-asg-detail__empty">Sélectionne un devoir à gauche.</div>';
  const km = kindMeta(a.kind);
  const sm = statusMeta(a.status);
  const subs = (submissionsByAssignment.get(a.id) || []).slice().sort((x, y) => timestampToMs(y.submittedAt) - timestampToMs(x.submittedAt));
  const isOwner = a.createdBy === caller.uid;
  const canEdit = (isOwner || caller.isAdmin) && (a.status === 'draft' || a.status === 'rejected');

  return `
    <h2>${km.icon} ${escapeHtml(a.title || 'Sans titre')}</h2>
    <div class="sbi-asg-detail__sub">
      ${badge(km.label, a.kind === 'evaluation' ? 'info' : 'muted')}
      ${badge(sm.label, sm.tone)}
      <span>${escapeHtml(a.formationName || '')}${a.promotionName ? ` · ${escapeHtml(a.promotionName)}` : ''}</span>
      <span>${escapeHtml(formatDate(a.dueAt))}</span>
    </div>
    ${a.status === 'rejected' && a.rejectionReason ? `<p class="sbi-asg-status" data-tone="error">Rejeté par l'admin : ${escapeHtml(a.rejectionReason)}</p>` : ''}
    ${a.status === 'pending_validation' ? '<p class="sbi-asg-status">En attente de validation par l\'administration.</p>' : ''}
    ${a.consigne ? `<div class="sbi-asg-consigne">${escapeHtml(a.consigne)}</div>` : ''}
    ${canEdit ? `<div class="sbi-asg-actions"><button type="button" class="sbi-asg-btn primary" data-asg-edit>Modifier / renvoyer</button></div>` : ''}

    <div class="sbi-asg-section-title">Dépôts (${subs.length})</div>
    ${subs.length ? `
      <table class="sbi-asg-table">
        <thead><tr><th>Élève</th><th>Déposé</th><th>Statut</th><th>Note</th></tr></thead>
        <tbody>${subs.map((s) => {
          const ssm = subStatusMeta(s.status);
          return `<tr>
            <td><button type="button" class="sbi-asg-btn ghost" data-open-sub="${escapeHtml(s.id)}" style="padding:.2rem .4rem;">${escapeHtml(s.studentName || s.studentUid || '—')}</button></td>
            <td>${escapeHtml(formatDateTime(s.submittedAt) || '—')}</td>
            <td>${badge(ssm.label, ssm.tone)}</td>
            <td>${escapeHtml(formatNote(s.correction) || '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="sbi-asg-status">Aucun dépôt pour le moment.</p>'}
  `;
}

function teardownForm() { formCleanup?.(); formCleanup = null; }

function mountFormIfNeeded() {
  if (mode !== 'create' && mode !== 'edit') return;
  const detail = root()?.querySelector('[data-asg-detail]');
  if (!detail) return;
  const editing = mode === 'edit' ? assignmentById.get(selectedAssignmentId) : null;
  formCleanup = wireAssignmentForm({
    root: detail, db, isAdmin: caller.isAdmin, assignment: editing,
    onSaved: async () => { mode = 'view'; teardownForm(); await loadData(); },
    onCancel: () => { mode = 'view'; teardownForm(); render(); }
  });
}

async function handleDeleteSubmission(submissionId, button) {
  const sub = submissions.find((x) => x.id === submissionId);
  const who = sub?.studentName || 'cet élève';
  if (!window.confirm(`Supprimer le dépôt de ${who} ? Les fichiers seront effacés et l'élève pourra redéposer. Action définitive.`)) return;
  button.disabled = true;
  try {
    await assignmentCallable('deleteAssignmentSubmission')({ submissionId });
    selectedSubmissionId = '';
    await loadData();
  } catch (error) {
    console.error('[SBI Assignments prof] suppression dépôt impossible :', error);
    window.alert(getCallableMessage(error, 'Suppression du dépôt impossible.'));
    button.disabled = false;
  }
}

async function handleCorrect(submissionId, button) {
  const feedback = root()?.querySelector('#asg-feedback')?.value?.trim() || '';
  const noteInput = root()?.querySelector('#asg-note');
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
    setCorrStatus('Correction enregistrée.', 'success');
    await loadData();
  } catch (error) {
    console.error('[SBI Assignments prof] correction impossible :', error);
    setCorrStatus(getCallableMessage(error, 'Correction impossible.'), 'error');
    button.disabled = false;
  }
}

function bindEvents() {
  const r = root();
  if (!r) return;

  r.querySelector('[data-asg-chips]')?.addEventListener('click', (e) => {
    const chipTab = e.target.closest('[data-tab]');
    if (chipTab) { tab = chipTab.dataset.tab; mode = 'view'; teardownForm(); render(); return; }
    if (e.target.closest('[data-asg-create]')) { mode = 'create'; teardownForm(); render(); }
  });

  r.querySelector('[data-asg-list]')?.addEventListener('click', (e) => {
    const subItem = e.target.closest('[data-sub-id]');
    if (subItem) { selectedSubmissionId = subItem.dataset.subId; mode = 'view'; teardownForm(); render(); return; }
    const asgItem = e.target.closest('[data-asg-id]');
    if (asgItem) { selectedAssignmentId = asgItem.dataset.asgId; mode = 'view'; teardownForm(); render(); }
  });

  const detail = r.querySelector('[data-asg-detail]');
  detail?.addEventListener('click', (e) => {
    const correctBtn = e.target.closest('[data-asg-correct]');
    if (correctBtn) { handleCorrect(correctBtn.dataset.asgCorrect, correctBtn); return; }
    const delSubBtn = e.target.closest('[data-asg-delsub]');
    if (delSubBtn) { handleDeleteSubmission(delSubBtn.dataset.asgDelsub, delSubBtn); return; }
    if (e.target.closest('[data-asg-edit]')) { mode = 'edit'; render(); return; }
    const openSub = e.target.closest('[data-open-sub]');
    if (openSub) { tab = 'correct'; selectedSubmissionId = openSub.dataset.openSub; mode = 'view'; render(); }
  });

  mountFormIfNeeded();
}

export function mountTeacherAssignments() {
  const view = document.getElementById('view-teacher-assignments');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_TEACHER_ASSIGNMENTS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCaller(user);
      await loadData();
    } catch (error) {
      console.warn('[SBI Assignments prof] accès refusé :', error);
      setStatus(error?.message || 'Accès réservé aux professeurs.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null; teardownForm();
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_TEACHER_ASSIGNMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTeacherAssignments(), { once: true });
} else {
  mountTeacherAssignments();
}
