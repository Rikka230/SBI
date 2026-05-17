import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  deleteObject,
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
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_COMPRESSION_QUALITY = 0.84;

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

function slugSegment(value = 'document', max = 90) {
  const clean = String(value || 'document')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return clean || 'document';
}

function sanitizeFileName(value = 'document') {
  const clean = String(value || 'document')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
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

function getTodayStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStudentFileSegment(data = {}, uid = '') {
  const lastFirst = normalizeText(`${data.nom || ''} ${data.prenom || ''}`, 140);
  if (lastFirst) return slugSegment(lastFirst, 80);

  const firstLast = normalizeText(`${data.firstName || ''} ${data.lastName || ''}`, 140);
  if (firstLast) return slugSegment(firstLast, 80);

  const displayName = normalizeText(data.displayName || data.name || data.fullName || '', 140);
  if (displayName) return slugSegment(displayName, 80);

  const emailLocal = String(data.email || '').split('@')[0] || '';
  if (emailLocal) return slugSegment(emailLocal, 80);

  return slugSegment(uid || 'eleve', 80);
}

function getExtensionFromFile(file) {
  const nameExt = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  const byType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt'
  }[file?.type || ''];

  return byType || nameExt || 'file';
}

function buildStudentDocumentFileName({ title, studentData, uid, file }) {
  const titlePart = slugSegment(title || file?.name || 'document', 80);
  const studentPart = getStudentFileSegment(studentData, uid);
  const datePart = getTodayStamp();
  const extension = getExtensionFromFile(file).replace(/[^a-z0-9]/g, '') || 'file';
  return sanitizeFileName(`${titlePart}__${studentPart}__${datePart}.${extension}`);
}

function isAllowedFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return ALLOWED_STUDENT_DOCUMENT_TYPES.has(file.type || '');
}

function isCompressibleImage(file) {
  const type = String(file?.type || '').toLowerCase();
  return ['image/jpeg', 'image/png', 'image/webp'].includes(type);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    image.src = url;
  });
}

async function getImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch (_) {
      // Fallback image classique ci-dessous.
    }
  }
  return loadImageElement(file);
}

async function compressImageForUpload(file) {
  if (!isCompressibleImage(file)) {
    return {
      file,
      compressed: false,
      originalSize: file?.size || 0,
      originalContentType: file?.type || ''
    };
  }

  try {
    const source = await getImageSource(file);
    const width = source.width || source.naturalWidth || 0;
    const height = source.height || source.naturalHeight || 0;

    if (!width || !height) {
      return { file, compressed: false, originalSize: file.size, originalContentType: file.type || '' };
    }

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      source.close?.();
      return { file, compressed: false, originalSize: file.size, originalContentType: file.type || '' };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    source.close?.();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_COMPRESSION_QUALITY);
    });

    if (!blob || blob.size <= 0 || blob.size >= file.size * 0.96) {
      return { file, compressed: false, originalSize: file.size, originalContentType: file.type || '' };
    }

    const compressedFile = new File([blob], `${slugSegment(file.name.replace(/\.[^.]+$/, ''), 80)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });

    return {
      file: compressedFile,
      compressed: true,
      originalSize: file.size,
      originalContentType: file.type || '',
      originalName: file.name || ''
    };
  } catch (error) {
    console.warn('[SBI Documents] Compression image ignorée :', error);
    return { file, compressed: false, originalSize: file.size, originalContentType: file.type || '' };
  }
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

function renderEmptyDocuments(showArchived = false) {
  return `
    <div class="sbi-student-documents-empty">
      ${showArchived ? 'Aucun document élève, actif ou archivé, pour le moment.' : 'Aucun document élève actif pour le moment.'}
    </div>
  `;
}

function renderDocumentCard(item = {}) {
  const category = DOCUMENT_CATEGORIES[item.category] || DOCUMENT_CATEGORIES.other;
  const isArchived = item.status === 'archived';
  const safeId = escapeHTML(item.id || '');

  return `
    <article class="sbi-student-document-card ${isArchived ? 'is-archived' : ''}">
      <div class="sbi-student-document-card__body">
        <div class="sbi-student-document-card__title-row">
          <strong>${escapeHTML(item.title || item.fileName || 'Document sans titre')}</strong>
          <span>${escapeHTML(category)}</span>
          ${isArchived ? '<em>Archivé</em>' : ''}
          ${item.compressed === true ? '<em class="is-compressed">Compressé</em>' : ''}
        </div>
        <p>${escapeHTML(item.fileName || 'Fichier')}</p>
        <small>
          ${escapeHTML(formatBytes(item.size))}${item.originalSize && item.originalSize > item.size ? ` · original ${escapeHTML(formatBytes(item.originalSize))}` : ''} · ${escapeHTML(formatDate(item.createdAt, 'Date inconnue'))}${item.createdByEmail ? ` · ${escapeHTML(item.createdByEmail)}` : ''}
        </small>
        ${item.note ? `<div class="sbi-student-document-card__note">${escapeHTML(item.note)}</div>` : ''}
      </div>
      <div class="sbi-student-document-card__actions">
        <button type="button" data-doc-open="${safeId}">Ouvrir</button>
        <button type="button" data-doc-download="${safeId}">Télécharger</button>
        ${!isArchived ? `<button type="button" data-doc-archive="${safeId}">Archiver</button>` : ''}
        <button type="button" data-doc-delete="${safeId}">Supprimer</button>
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

async function getStudentDocumentDownloadUrl(item) {
  if (!item?.filePath) throw new Error('Chemin fichier manquant.');
  return getDownloadURL(ref(storage, item.filePath));
}

async function openStudentDocument(panel, item, button) {
  if (!item?.filePath) return;
  const previous = button?.textContent || 'Ouvrir';
  if (button) {
    button.disabled = true;
    button.textContent = 'Ouverture...';
  }

  try {
    const url = await getStudentDocumentDownloadUrl(item);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.warn('[SBI Documents] Ouverture impossible :', error);
    setStatus(panel, getCallableUiMessage(error, 'Ouverture impossible.'), 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

async function downloadStudentDocument(panel, item, button) {
  if (!item?.filePath) return;
  const previous = button?.textContent || 'Télécharger';
  if (button) {
    button.disabled = true;
    button.textContent = 'Téléchargement...';
  }

  try {
    const url = await getStudentDocumentDownloadUrl(item);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Téléchargement refusé.');

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = sanitizeFileName(item.fileName || item.title || 'document-eleve');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    setStatus(panel, 'Téléchargement lancé.', 'success');
  } catch (error) {
    console.warn('[SBI Documents] Téléchargement direct impossible, ouverture de secours :', error);
    setStatus(panel, 'Téléchargement direct indisponible, ouverture du fichier en secours.', 'error');
    try {
      const fallbackUrl = await getStudentDocumentDownloadUrl(item);
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    } catch (_) {}
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

async function archiveStudentDocument(panel, db, documentId, button) {
  const confirmed = window.confirm('Archiver ce document élève ? Le fichier restera conservé mais masqué de la liste active.');
  if (!confirmed) return;

  if (button) button.disabled = true;

  try {
    await updateDoc(doc(db, 'studentDocuments', documentId), {
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
    if (button) button.disabled = false;
  }
}

async function deleteStudentDocument(panel, db, item, button) {
  const confirmed = window.confirm('Supprimer définitivement ce document élève ? Le fichier et sa fiche seront retirés du coffre.');
  if (!confirmed) return;

  const previous = button?.textContent || 'Supprimer';
  if (button) {
    button.disabled = true;
    button.textContent = 'Suppression...';
  }

  try {
    if (item?.filePath) {
      await deleteObject(ref(storage, item.filePath)).catch((error) => {
        if (error?.code === 'storage/object-not-found') return;
        throw error;
      });
    }

    await deleteDoc(doc(db, 'studentDocuments', item.id));
    setStatus(panel, 'Document supprimé.', 'success');
    const nextDocuments = await loadStudentDocuments(db, panel.dataset.studentUid || '');
    setPanelDocuments(panel, nextDocuments);
    renderDocumentsList(panel, nextDocuments, db);
  } catch (error) {
    console.warn('[SBI Documents] Suppression impossible :', error);
    setStatus(panel, getCallableUiMessage(error, 'Suppression impossible.'), 'error');
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
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
  list.innerHTML = visible.length ? visible.map(renderDocumentCard).join('') : renderEmptyDocuments(showArchived);

  list.querySelectorAll('[data-doc-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docOpen || '';
      const item = getPanelDocuments(panel).find((entry) => entry.id === documentId);
      await openStudentDocument(panel, item, button);
    });
  });

  list.querySelectorAll('[data-doc-download]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docDownload || '';
      const item = getPanelDocuments(panel).find((entry) => entry.id === documentId);
      await downloadStudentDocument(panel, item, button);
    });
  });

  list.querySelectorAll('[data-doc-archive]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docArchive || '';
      await archiveStudentDocument(panel, db, documentId, button);
    });
  });

  list.querySelectorAll('[data-doc-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docDelete || '';
      const item = getPanelDocuments(panel).find((entry) => entry.id === documentId);
      if (!item) return;
      await deleteStudentDocument(panel, db, item, button);
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

async function uploadStudentDocument({ db, uid, data = {}, context, panel }) {
  const payload = getFormPayload(panel);
  const submit = panel.querySelector('#prof-student-document-upload-btn');
  const fileInput = panel.querySelector('#prof-student-document-file');
  const titleInput = panel.querySelector('#prof-student-document-title');
  const noteInput = panel.querySelector('#prof-student-document-note');
  const categoryInput = panel.querySelector('#prof-student-document-category');

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Préparation...';
  }

  setStatus(panel, payload.file.type?.startsWith('image/') ? 'Compression de l’image...' : 'Préparation du document...', 'muted');

  const prepared = await compressImageForUpload(payload.file);
  const uploadFile = prepared.file;
  const safeFileName = buildStudentDocumentFileName({
    title: payload.title,
    studentData: data,
    uid,
    file: uploadFile
  });

  if (uploadFile.size > MAX_STUDENT_DOCUMENT_SIZE) {
    throw new Error('Fichier trop lourd après préparation. Limite : 40 Mo.');
  }

  const documentRef = await addDoc(collection(db, 'studentDocuments'), {
    studentUid: uid,
    title: payload.title,
    category: payload.category,
    fileName: safeFileName,
    originalFileName: sanitizeFileName(payload.file.name || 'document'),
    contentType: uploadFile.type || 'application/octet-stream',
    originalContentType: prepared.originalContentType || payload.file.type || '',
    size: uploadFile.size,
    originalSize: prepared.originalSize || payload.file.size,
    compressed: prepared.compressed === true,
    status: 'uploading',
    visibility: 'admin_only',
    createdAt: serverTimestamp(),
    createdBy: context.loggedInUserId || '',
    createdByEmail: context.loggedInUserData?.email || '',
    updatedAt: serverTimestamp()
  });

  const filePath = `student-documents/${uid}/${documentRef.id}/${safeFileName}`;

  if (submit) {
    submit.textContent = 'Téléversement...';
  }
  setStatus(panel, 'Téléversement du document...', 'muted');

  try {
    await uploadBytes(ref(storage, filePath), uploadFile, {
      contentType: uploadFile.type || 'application/octet-stream',
      customMetadata: {
        uploadedBy: context.loggedInUserId || '',
        studentUid: uid,
        documentId: documentRef.id,
        originalFileName: payload.file.name || '',
        compressed: prepared.compressed === true ? 'true' : 'false'
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

    setStatus(panel, prepared.compressed ? 'Document ajouté au coffre élève. Image compressée.' : 'Document ajouté au coffre élève.', 'success');
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
          <small>Les images JPG/PNG/WEBP sont compressées automatiquement avant envoi. Les PDF/DOC sont conservés tels quels.</small>
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
    await uploadStudentDocument({ db, uid, data, context, panel });
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
