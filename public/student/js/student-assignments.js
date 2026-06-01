/**
 * SBI 8.0P.167.273 — Espace ÉLÈVE « Mes devoirs & évaluations ».
 *
 * Liste des devoirs publiés de ses formations/promotions, consigne, dépôt
 * UNIQUE (fichier + texte) verrouillé après envoi, puis visualisation de la
 * correction du professeur. Deux requêtes client (promo ciblée + formation-wide)
 * pour rester compatibles avec les règles Firestore.
 */

import { auth, db, storage } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, documentId, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';
import {
  escapeHtml, kindMeta, subStatusMeta, formatDate, dueState, formatNote,
  snapToArray, chunk, assignmentCallable, getCallableMessage,
  userFormationIds, userPromotionIds, STUDENT_ROLES, submissionId as buildSubmissionId
} from '/js/assignments/assignment-data.js?v=8.0P.167.273';

const MAX_FILE_SIZE = 40 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_QUALITY = 0.84;

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let caller = null; // { uid, data, name, email }
let formationIds = [];
let promotionIds = [];
let assignments = [];
let submissionByAssignment = new Map();
let filter = 'todo';
let selectedId = '';
let busy = false;

function root() { return document.getElementById('asg-root'); }
function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-asg-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}
function badge(label, tone) { return `<span class="sbi-asg-badge" data-tone="${tone}">${escapeHtml(label)}</span>`; }

function slug(value = 'fichier', max = 80) {
  return String(value || 'fichier')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max) || 'fichier';
}
function fileExtension(file) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file?.type || ''])
    || String(file?.name || '').split('.').pop()?.toLowerCase() || 'file';
}

async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
  if (!blob || blob.size >= file.size * 0.96) return file;
  return new File([blob], `${slug(file.name.replace(/\.[^.]+$/, ''))}.jpg`, { type: 'image/jpeg' });
}

async function loadCaller(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Compte introuvable.');
  const data = snap.data() || {};
  const isAdmin = data.isGod === true || data.role === 'admin';
  const isStudent = STUDENT_ROLES.includes(String(data.role || '').toLowerCase());
  if (!isStudent && !isAdmin) throw new Error('Accès réservé aux élèves.');
  caller = {
    uid: user.uid,
    data,
    name: `${data.prenom || ''} ${data.nom || ''}`.trim() || data.displayName || data.email || 'Élève',
    email: data.email || ''
  };
}

async function resolveScope() {
  formationIds = userFormationIds(caller.data);
  promotionIds = userPromotionIds(caller.data);
  // Compléter les formations à partir des promotions de l'élève.
  for (const part of chunk(promotionIds, 10)) {
    if (!part.length) continue;
    try {
      const snap = await getDocs(query(collection(db, 'promotions'), where(documentId(), 'in', part)));
      snapToArray(snap).forEach((p) => { if (p.formationId) formationIds.push(String(p.formationId)); });
    } catch (error) {
      console.warn('[SBI Assignments élève] résolution formation depuis promotion échouée :', error?.message || error);
    }
  }
  formationIds = Array.from(new Set(formationIds.filter(Boolean)));
}

async function loadData() {
  await resolveScope();
  const found = new Map();
  const addSnap = (snap) => snapToArray(snap).forEach((a) => found.set(a.id, a));

  for (const part of chunk(promotionIds, 10)) {
    if (!part.length) continue;
    try {
      addSnap(await getDocs(query(collection(db, 'assignments'), where('status', '==', 'published'), where('promotionId', 'in', part))));
    } catch (error) {
      console.warn('[SBI Assignments élève] requête promo échouée :', error?.message || error);
    }
  }
  for (const part of chunk(formationIds, 10)) {
    if (!part.length) continue;
    try {
      addSnap(await getDocs(query(collection(db, 'assignments'), where('status', '==', 'published'), where('promotionId', '==', ''), where('formationId', 'in', part))));
    } catch (error) {
      console.warn('[SBI Assignments élève] requête formation échouée :', error?.message || error);
    }
  }

  assignments = Array.from(found.values());

  submissionByAssignment = new Map();
  try {
    const subSnap = await getDocs(query(collection(db, 'assignmentSubmissions'), where('studentUid', '==', caller.uid)));
    snapToArray(subSnap).forEach((s) => submissionByAssignment.set(s.assignmentId, s));
  } catch (error) {
    console.warn('[SBI Assignments élève] requête dépôts échouée :', error?.message || error);
  }

  assignments.sort((a, b) => {
    const da = dueState(a.dueAt).daysLeft;
    const dbb = dueState(b.dueAt).daysLeft;
    return (da == null ? 9999 : da) - (dbb == null ? 9999 : dbb);
  });

  render();
}

function effectiveStatus(a) {
  const sub = submissionByAssignment.get(a.id);
  return sub ? sub.status : 'in_progress';
}

const FILTERS = [
  { key: 'todo', label: 'À rendre', match: (a) => effectiveStatus(a) === 'in_progress' },
  { key: 'pending', label: 'En attente', match: (a) => effectiveStatus(a) === 'pending' },
  { key: 'corrected', label: 'Corrigés', match: (a) => effectiveStatus(a) === 'corrected' },
  { key: 'all', label: 'Tous', match: () => true }
];

function render() {
  const r = root();
  if (!r) return;
  const counts = {};
  FILTERS.forEach((f) => { counts[f.key] = assignments.filter((a) => f.match(a)).length; });

  r.innerHTML = `
    <div class="sbi-asg-head">
      <h1>Mes devoirs & évaluations</h1>
      <p>Consulte tes devoirs, dépose ton travail (un seul dépôt par devoir) et retrouve la correction de tes professeurs.</p>
    </div>
    <div class="sbi-asg-chips" data-asg-chips>
      ${FILTERS.map((f) => `<button type="button" class="sbi-asg-chip ${filter === f.key ? 'is-active' : ''}" data-filter="${f.key}">${escapeHtml(f.label)} <span class="sbi-asg-count">${counts[f.key]}</span></button>`).join('')}
    </div>
    <div class="sbi-asg-shell">
      <div class="sbi-asg-list" data-asg-list>${renderList()}</div>
      <div class="sbi-asg-detail" data-asg-detail>${renderDetail()}</div>
    </div>
  `;
  bindEvents();
}

function renderList() {
  const def = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const list = assignments.filter((a) => def.match(a));
  if (!list.length) return '<div class="sbi-asg-status">Aucun devoir ici.</div>';
  return list.map((a) => {
    const km = kindMeta(a.kind);
    const status = effectiveStatus(a);
    const ssm = subStatusMeta(status);
    const ds = dueState(a.dueAt);
    const sub = submissionByAssignment.get(a.id);
    return `
      <button type="button" class="sbi-asg-item ${selectedId === a.id ? 'is-selected' : ''}" data-asg-id="${escapeHtml(a.id)}">
        <div class="sbi-asg-item__title">${km.icon} ${escapeHtml(a.title || 'Devoir')}</div>
        <div class="sbi-asg-item__meta"><span>${escapeHtml(a.formationName || '')}</span></div>
        <div class="sbi-asg-item__badges">
          ${badge(ssm.label, ssm.tone)}
          ${status === 'in_progress' ? badge(ds.label, ds.tone) : ''}
          ${status === 'corrected' && sub?.correction ? badge(formatNote(sub.correction) || 'Corrigé', 'success') : ''}
        </div>
      </button>`;
  }).join('');
}

function renderDeposit(a) {
  const mode = a.submissionMode || { file: true, text: false };
  return `
    <div class="sbi-asg-section-title">Déposer mon travail</div>
    <p class="sbi-asg-status">⚠️ Dépôt unique : une fois envoyé, il ne pourra plus être modifié.</p>
    <div class="sbi-asg-drop">
      ${mode.file !== false ? `
        <div class="sbi-asg-field">
          <label for="asg-files">Fichier(s) — PDF, image, doc (40 Mo max)</label>
          <input id="asg-files" type="file" multiple accept=".pdf,image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip">
        </div>` : ''}
      ${mode.text === true ? `
        <div class="sbi-asg-field">
          <label for="asg-text">Ma réponse</label>
          <textarea id="asg-text" class="sbi-asg-textarea" rows="6" placeholder="Rédige ta réponse…"></textarea>
        </div>` : ''}
    </div>
    <p class="sbi-asg-status" data-asg-deposit-status hidden></p>
    <div class="sbi-asg-actions">
      <button type="button" class="sbi-asg-btn primary" data-asg-deposit="${escapeHtml(a.id)}">Déposer définitivement</button>
    </div>
  `;
}

function renderFileLinks(files) {
  if (!Array.isArray(files) || !files.length) return '';
  return `<ul class="sbi-asg-filelist">${files.map((f) => `
    <li>📎 ${f.downloadURL ? `<a href="${escapeHtml(f.downloadURL)}" target="_blank" rel="noopener">${escapeHtml(f.fileName || 'fichier')}</a>` : escapeHtml(f.fileName || 'fichier')}</li>
  `).join('')}</ul>`;
}

function renderDetail() {
  const a = assignments.find((x) => x.id === selectedId);
  if (!a) return '<div class="sbi-asg-detail__empty">Sélectionne un devoir à gauche.</div>';
  const km = kindMeta(a.kind);
  const sub = submissionByAssignment.get(a.id);
  const status = effectiveStatus(a);
  const ds = dueState(a.dueAt);

  let body = '';
  if (status === 'in_progress') {
    body = renderDeposit(a);
  } else {
    body = `
      <div class="sbi-asg-section-title">Mon dépôt</div>
      ${renderFileLinks(sub?.files)}
      ${sub?.text ? `<div class="sbi-asg-consigne" style="margin-top:.5rem;">${escapeHtml(sub.text)}</div>` : ''}
      ${status === 'pending' ? '<p class="sbi-asg-status">✅ Déposé. En attente de la correction de ton professeur.</p>' : ''}
      ${status === 'corrected' && sub?.correction ? `
        <div class="sbi-asg-section-title">Correction du professeur</div>
        <div class="sbi-asg-correction">
          ${Number.isFinite(Number(sub.correction.note)) ? `<div class="sbi-asg-note">${escapeHtml(formatNote(sub.correction))}</div>` : ''}
          ${sub.correction.feedback ? `<div class="sbi-asg-feedback">${escapeHtml(sub.correction.feedback)}</div>` : '<div class="sbi-asg-feedback">Pas de commentaire écrit.</div>'}
          ${sub.correction.correctedByName ? `<p class="sbi-asg-status">Corrigé par ${escapeHtml(sub.correction.correctedByName)}.</p>` : ''}
        </div>` : ''}
    `;
  }

  return `
    <h2>${km.icon} ${escapeHtml(a.title || 'Devoir')}</h2>
    <div class="sbi-asg-detail__sub">
      ${badge(km.label, a.kind === 'evaluation' ? 'info' : 'muted')}
      <span>${escapeHtml(a.formationName || '')}</span>
      ${a.kind === 'evaluation' && a.gradeMax ? `<span>Noté sur ${escapeHtml(String(a.gradeMax))}</span>` : ''}
      ${status === 'in_progress' ? badge(ds.label, ds.tone) : `<span>Échéance : ${escapeHtml(formatDate(a.dueAt))}</span>`}
    </div>
    ${a.consigne ? `<div class="sbi-asg-consigne">${escapeHtml(a.consigne)}</div>` : '<p class="sbi-asg-status">Pas de consigne détaillée.</p>'}
    ${body}
  `;
}

async function handleDeposit(assignmentId, button) {
  if (busy) return;
  const a = assignments.find((x) => x.id === assignmentId);
  if (!a) return;
  const mode = a.submissionMode || { file: true, text: false };
  const fileInput = root()?.querySelector('#asg-files');
  const textInput = root()?.querySelector('#asg-text');
  const files = fileInput ? Array.from(fileInput.files || []) : [];
  const text = textInput ? textInput.value.trim() : '';
  const statusEl = root()?.querySelector('[data-asg-deposit-status]');
  const setDepositStatus = (m, tone = 'muted') => { if (statusEl) { statusEl.hidden = !m; statusEl.textContent = m; statusEl.dataset.tone = tone; } };

  if (mode.file !== false && !files.length && !(mode.text === true && text)) {
    setDepositStatus('Ajoute au moins un fichier.', 'error'); return;
  }
  if (mode.file === false && mode.text === true && !text) {
    setDepositStatus('Saisis ta réponse.', 'error'); return;
  }
  if (!files.length && !text) { setDepositStatus('Rien à déposer.', 'error'); return; }

  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) { setDepositStatus(`« ${f.name} » dépasse 40 Mo.`, 'error'); return; }
  }
  if (!window.confirm('Confirmer le dépôt ? Il sera définitif et envoyé à tes professeurs.')) return;

  busy = true;
  button.disabled = true;
  setDepositStatus('Envoi en cours…');

  try {
    const uploaded = [];
    for (let i = 0; i < files.length; i += 1) {
      const prepared = await compressImage(files[i]);
      const safeName = `${String(i + 1).padStart(2, '0')}-${slug(prepared.name.replace(/\.[^.]+$/, ''))}.${fileExtension(prepared)}`;
      const filePath = `assignment-submissions/${assignmentId}/${caller.uid}/${safeName}`;
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, prepared, {
        contentType: prepared.type || 'application/octet-stream',
        customMetadata: { uploadedBy: caller.uid }
      });
      const downloadURL = await getDownloadURL(storageRef).catch(() => '');
      uploaded.push({ filePath, fileName: safeName, contentType: prepared.type || '', size: prepared.size, downloadURL });
    }

    const subId = buildSubmissionId(assignmentId, caller.uid);
    await setDoc(doc(db, 'assignmentSubmissions', subId), {
      assignmentId,
      assignmentTitle: a.title || '',
      assignmentKind: a.kind || 'devoir',
      gradeMax: a.kind === 'evaluation' ? (Number(a.gradeMax) || 20) : null,
      studentUid: caller.uid,
      studentName: caller.name,
      studentEmail: caller.email,
      formationId: a.formationId || '',
      promotionId: a.promotionId || '',
      status: 'pending',
      files: uploaded,
      text,
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    try {
      await assignmentCallable('notifyAssignmentToProfs')({ assignmentId });
    } catch (notifyError) {
      console.warn('[SBI Assignments élève] notification profs non bloquante :', notifyError?.message || notifyError);
    }

    setDepositStatus('Dépôt enregistré ✅', 'success');
    await loadData();
  } catch (error) {
    console.error('[SBI Assignments élève] dépôt impossible :', error);
    setDepositStatus(getCallableMessage(error, "Dépôt impossible. Réessaie."), 'error');
    button.disabled = false;
  } finally {
    busy = false;
  }
}

function bindEvents() {
  const r = root();
  if (!r) return;
  r.querySelector('[data-asg-chips]')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (chip) { filter = chip.dataset.filter; render(); }
  });
  r.querySelector('[data-asg-list]')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-asg-id]');
    if (item) { selectedId = item.dataset.asgId; render(); }
  });
  r.querySelector('[data-asg-detail]')?.addEventListener('click', (e) => {
    const depositBtn = e.target.closest('[data-asg-deposit]');
    if (depositBtn) handleDeposit(depositBtn.dataset.asgDeposit, depositBtn);
  });
}

export function mountStudentAssignments() {
  const view = document.getElementById('view-student-assignments');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_STUDENT_ASSIGNMENTS_UNMOUNT || (() => {});
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
      console.warn('[SBI Assignments élève] accès refusé :', error);
      setStatus(error?.message || 'Accès réservé aux élèves.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_STUDENT_ASSIGNMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountStudentAssignments(), { once: true });
} else {
  mountStudentAssignments();
}
