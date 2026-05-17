import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  getDownloadURL,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';
import { storage } from '/js/firebase-init.js';
import { escapeHTML } from './profile-utils.js';

const DOCUMENT_CATEGORIES = {
  administrative: 'Administratif',
  identity: 'Identité',
  contract: 'Convention / contrat',
  proof: 'Justificatif',
  pedagogical: 'Pédagogique',
  other: 'Autre'
};

const MAX_STUDENT_DOCUMENT_SIZE = 40 * 1024 * 1024;

const ALLOWED_STUDENT_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

let activeMountToken = 0;

function isStudentRole(profile = {}) {
  const role = String(profile.role || '').toLowerCase();
  return ['student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(role);
}

function normalizeText(value = '', max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeFileName(value = 'document') {
  const clean = String(value || 'document')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return clean || 'document';
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
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

function formatDate(value, fallback = 'Date inconnue') {
  const ms = toMillis(value);
  if (!ms) return fallback;
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms));
  } catch (_) {
    return fallback;
  }
}

function isAllowedFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return ALLOWED_STUDENT_DOCUMENT_TYPES.has(file.type || '');
}

function getCallableUiMessage(error, fallback) {
  const raw = error?.message || error?.details?.message || fallback;
  return String(raw).replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/g, '').trim() || fallback;
}

function setStatus(panel, message = '', tone = 'muted') {
  const status = panel?.querySelector?.('#prof-student-documents-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setPanelDocuments(panel, documents = []) {
  if (!panel) return;
  panel.__sbiStudentDocuments = Array.isArray(documents) ? documents : [];
}

function getPanelDocuments(panel) {
  return Array.isArray(panel?.__sbiStudentDocuments) ? panel.__sbiStudentDocuments : [];
}

function rerenderStoredDocuments(panel, db) {
  renderDocumentsList(panel, getPanelDocuments(panel), db);
}

function renderEmptyDocuments() {
  return `
    <div class="sbi-student-documents-empty">
      Aucun document élève actif pour le moment.
    </div>
  `;
}

function renderDocumentCard(item = {}) {
  const category = DOCUMENT_CATEGORIES[item.category] || DOCUMENT_CATEGORIES.other;
  const isArchived = item.status === 'archived';
  return `
    <article class="sbi-student-document-card ${isArchived ? 'is-archived' : ''}">
      <div class="sbi-student-document-card__body">
        <div class="sbi-student-document-card__title-row">
          <strong>${escapeHTML(item.title || item.fileName || 'Document sans titre')}</strong>
          <span>${escapeHTML(category)}</span>
          ${isArchived ? '<em>Archivé</em>' : ''}
        </div>
        <p>${escapeHTML(item.fileName || 'Fichier')}</p>
        <small>
          ${escapeHTML(formatBytes(item.size))} · ${escapeHTML(formatDate(item.createdAt, 'Date inconnue'))}${item.createdByEmail ? ` · ${escapeHTML(item.createdByEmail)}` : ''}
        </small>
        ${item.note ? `<div class="sbi-student-document-card__note">${escapeHTML(item.note)}</div>` : ''}
      </div>
      <div class="sbi-student-document-card__actions">
        <button type="button" data-doc-open="${escapeHTML(item.id)}">Ouvrir</button>
        ${!isArchived ? `<button type="button" data-doc-archive="${escapeHTML(item.id)}">Archiver</button>` : ''}
      </div>
    </article>
  `;
}

async function loadStudentDocuments(db, studentUid) {
  const docsQuery = query(
    collection(db, 'studentDocuments'),
    where('studentUid', '==', studentUid)
  );
  const snap = await getDocs(docsQuery);
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  rows.sort((a, b) => toMillis(b.createdAt || b.updatedAt) - toMillis(a.createdAt || a.updatedAt));
  return rows;
}

function renderDocumentsList(panel, documents = [], db = null) {
  const list = panel.querySelector('#prof-student-documents-list');
  const showArchived = panel.querySelector('#prof-student-documents-show-archived')?.checked === true;
  const toolbarTitle = panel.querySelector('#prof-student-documents-toolbar-title');
  if (!list) return;

  setPanelDocuments(panel, documents);
  if (toolbarTitle) {
    toolbarTitle.textContent = showArchived ? 'Documents actifs + archivés' : 'Documents actifs';
  }

  const visible = getPanelDocuments(panel).filter((item) => showArchived || item.status !== 'archived');
  list.innerHTML = visible.length ? visible.map(renderDocumentCard).join('') : renderEmptyDocuments();

  list.querySelectorAll('[data-doc-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docOpen || '';
      const item = documents.find((entry) => entry.id === documentId);
      if (!item?.filePath) return;

      button.disabled = true;
      const previous = button.textContent;
      button.textContent = 'Ouverture...';

      try {
        const url = await getDownloadURL(ref(storage, item.filePath));
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.warn('[SBI Documents] Ouverture impossible :', error);
        setStatus(panel, getCallableUiMessage(error, 'Ouverture impossible.'), 'error');
      } finally {
        button.disabled = false;
        button.textContent = previous;
      }
    });
  });

  list.querySelectorAll('[data-doc-archive]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docArchive || '';
      const confirmed = window.confirm('Archiver ce document élève ? Le fichier restera conservé mais masqué de la liste active.');
      if (!confirmed) return;

      button.disabled = true;
      try {
        await updateDoc(doc(collection(db, 'studentDocuments'), documentId), {
          status: 'archived',
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setStatus(panel, 'Document archivé.', 'success');
        const nextDocuments = await loadStudentDocuments(db, panel.dataset.studentUid || '');
        setPanelDocuments(panel, nextDocuments);
        renderDocumentsList(panel, nextDocuments, db);
      } catch (error) {
        console.warn('[SBI Documents] Archivage impossible :', error);
        setStatus(panel, getCallableUiMessage(error, 'Archivage impossible.'), 'error');
        button.disabled = false;
      }
    });
  });
}

function getFormPayload(panel) {
  const fileInput = panel.querySelector('#prof-student-document-file');
  const file = fileInput?.files?.[0] || null;
  const category = panel.querySelector('#prof-student-document-category')?.value || 'administrative';
  const title = normalizeText(panel.querySelector('#prof-student-document-title')?.value || file?.name || '', 160);
  const note = String(panel.querySelector('#prof-student-document-note')?.value || '').trim().slice(0, 2000);

  if (!file) throw new Error('Ajoute un fichier avant de téléverser.');
  if (file.size > MAX_STUDENT_DOCUMENT_SIZE) throw new Error('Fichier trop lourd. Limite : 40 Mo.');
  if (!isAllowedFile(file)) throw new Error('Format refusé. Formats acceptés : PDF, image, DOC/DOCX ou TXT.');
  if (!title) throw new Error('Le titre du document est obligatoire.');

  return {
    file,
    category: DOCUMENT_CATEGORIES[category] ? category : 'other',
    title,
    note
  };
}

async function uploadStudentDocument({ db, uid, context, panel }) {
  const payload = getFormPayload(panel);
  const submit = panel.querySelector('#prof-student-document-upload-btn');
  const fileInput = panel.querySelector('#prof-student-document-file');
  const titleInput = panel.querySelector('#prof-student-document-title');
  const noteInput = panel.querySelector('#prof-student-document-note');
  const categoryInput = panel.querySelector('#prof-student-document-category');

  const documentRef = await addDoc(collection(db, 'studentDocuments'), {
    studentUid: uid,
    title: payload.title,
    category: payload.category,
    fileName: sanitizeFileName(payload.file.name),
    contentType: payload.file.type || 'application/octet-stream',
    size: payload.file.size,
    status: 'uploading',
    visibility: 'admin_only',
    createdAt: serverTimestamp(),
    createdBy: context.loggedInUserId || '',
    createdByEmail: context.loggedInUserData?.email || '',
    updatedAt: serverTimestamp()
  });

  const safeFileName = sanitizeFileName(payload.file.name);
  const filePath = `student-documents/${uid}/${documentRef.id}/${safeFileName}`;

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Téléversement...';
  }
  setStatus(panel, 'Téléversement du document...', 'muted');

  try {
    await uploadBytes(ref(storage, filePath), payload.file, {
      contentType: payload.file.type || 'application/octet-stream',
      customMetadata: {
        uploadedBy: context.loggedInUserId || '',
        studentUid: uid,
        documentId: documentRef.id
      }
    });

    await updateDoc(documentRef, {
      filePath,
      fileName: safeFileName,
      status: 'active',
      uploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (fileInput) fileInput.value = '';
    if (titleInput) titleInput.value = '';
    if (noteInput) noteInput.value = '';
    if (categoryInput) categoryInput.value = 'administrative';

    setStatus(panel, 'Document ajouté au coffre élève.', 'success');
    const documents = await loadStudentDocuments(db, uid);
    setPanelDocuments(panel, documents);
    renderDocumentsList(panel, documents, db);
  } catch (error) {
    await updateDoc(documentRef, {
      status: 'upload_failed',
      uploadError: String(error?.message || error || 'Erreur inconnue').slice(0, 260),
      updatedAt: serverTimestamp()
    }).catch(() => {});
    console.warn('[SBI Documents] Upload impossible :', error);
    setStatus(panel, getCallableUiMessage(error, 'Téléversement impossible.'), 'error');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Ajouter au coffre';
    }
  }
}

function renderPanelShell(panel) {
  panel.innerHTML = `
    <div class="sbi-student-documents">
      <div class="sbi-student-documents__header">
        <div>
          <p>Coffre élève</p>
          <h4>Documents élève</h4>
        </div>
        <span>Admin uniquement</span>
      </div>

      <form id="prof-student-document-form" class="sbi-student-documents__form">
        <label>
          <span>Titre du document</span>
          <input id="prof-student-document-title" type="text" maxlength="160" placeholder="Ex : Pièce d’identité, convention, justificatif...">
        </label>
        <label>
          <span>Catégorie</span>
          <select id="prof-student-document-category">
            ${Object.entries(DOCUMENT_CATEGORIES).map(([value, label]) => `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`).join('')}
          </select>
        </label>
        <label class="sbi-student-documents__file">
          <span>Fichier</span>
          <input id="prof-student-document-file" type="file" accept=".pdf,.doc,.docx,.txt,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
        </label>
        <label class="sbi-student-documents__note">
          <span>Note interne optionnelle</span>
          <textarea id="prof-student-document-note" rows="3" maxlength="2000" placeholder="Contexte, vérification à faire, information utile...\nVisible admin uniquement dans cette première version."></textarea>
        </label>
        <div class="sbi-student-documents__actions">
          <span id="prof-student-documents-status" aria-live="polite"></span>
          <button id="prof-student-document-upload-btn" type="submit">Ajouter au coffre</button>
        </div>
      </form>

      <div class="sbi-student-documents__toolbar">
        <strong id="prof-student-documents-toolbar-title">Documents actifs</strong>
        <label>
          <input id="prof-student-documents-show-archived" type="checkbox">
          Afficher archivés
        </label>
      </div>
      <div id="prof-student-documents-list" class="sbi-student-documents__list">
        <div class="sbi-student-documents-empty">Chargement des documents...</div>
      </div>
    </div>
  `;
}

export async function renderStudentDocumentsPanel({ db, uid, data = {}, context = {} }) {
  const token = ++activeMountToken;
  const panel = document.getElementById('prof-student-documents-panel');
  if (!panel) return;

  const visible = Boolean(context?.isAdmin && isStudentRole(data));
  panel.style.display = visible ? '' : 'none';
  if (!visible) return;

  panel.dataset.studentUid = uid;
  renderPanelShell(panel);

  const form = panel.querySelector('#prof-student-document-form');
  const showArchived = panel.querySelector('#prof-student-documents-show-archived');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await uploadStudentDocument({ db, uid, context, panel });
  });

  try {
    const documents = await loadStudentDocuments(db, uid);
    if (token !== activeMountToken) return;
    setPanelDocuments(panel, documents);
    renderDocumentsList(panel, documents, db);
    showArchived?.addEventListener('change', () => rerenderStoredDocuments(panel, db));
  } catch (error) {
    console.warn('[SBI Documents] Lecture documents élève impossible :', error);
    const list = panel.querySelector('#prof-student-documents-list');
    if (list) {
      list.innerHTML = '<div class="sbi-student-documents-empty is-error">Documents indisponibles pour le moment.</div>';
    }
    setStatus(panel, getCallableUiMessage(error, 'Lecture documents impossible.'), 'error');
  }
}
