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
import { app, storage } from '/js/firebase-init.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { escapeHTML } from './profile-utils.js';

const DOCUMENT_CATEGORIES = {
  administrative: 'Administratif',
  identity: 'Identité',
  contract: 'Convention / contrat',
  proof: 'Justificatif',
  pedagogical: 'Pédagogique',
  other: 'Autre'
};


const DOCUMENT_REQUEST_TYPES = {
  identity: { label: 'Pièce d’identité', category: 'identity', accept: 'PDF, JPG ou PNG' },
  domicile: { label: 'Justificatif de domicile', category: 'proof', accept: 'PDF, JPG ou PNG' },
  photo: { label: 'Photo d’identité', category: 'identity', accept: 'JPG ou PNG' },
  civil_liability: { label: 'Attestation responsabilité civile', category: 'administrative', accept: 'PDF, JPG ou PNG' },
  cv: { label: 'CV', category: 'administrative', accept: 'PDF' },
  diploma: { label: 'Diplôme / relevé de notes', category: 'administrative', accept: 'PDF, JPG ou PNG' },
  school_certificate: { label: 'Certificat de scolarité', category: 'administrative', accept: 'PDF, JPG ou PNG' },
  parental_authorization: { label: 'Autorisation parentale si mineur', category: 'administrative', accept: 'PDF, JPG ou PNG' },
  rib: { label: 'RIB si nécessaire', category: 'administrative', accept: 'PDF, JPG ou PNG' },
  signed_contract: { label: 'Convention / contrat signé', category: 'contract', accept: 'PDF' },
  employer_certificate: { label: 'Attestation employeur / alternance', category: 'administrative', accept: 'PDF, JPG ou PNG' },
  other: { label: 'Autre document personnalisé', category: 'other', accept: 'PDF, JPG ou PNG' }
};

const DEFAULT_REQUEST_DOCUMENTS = [
  'identity',
  'domicile',
  'photo',
  'civil_liability',
  'cv',
  'diploma',
  'school_certificate',
  'parental_authorization',
  'rib',
  'signed_contract',
  'employer_certificate',
  'other'
];

const FUNCTIONS_REGION = 'europe-west1';

const DOCUMENT_REQUEST_STATUS_LABELS = {
  requested: 'En attente de réception',
  partial: 'Réception partielle',
  submitted: 'Transmis, à vérifier',
  completed: 'Validée',
  validated: 'Validée',
  canceled: 'Annulée',
  cancelled: 'Annulée',
  expired: 'Expirée',
  archived: 'Archivé'
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

function ensureSbiDocumentConfirmModal() {
  let modal = document.getElementById('sbi-student-doc-confirm-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'sbi-student-doc-confirm-modal';
  modal.className = 'sbi-student-doc-confirm-modal';
  modal.innerHTML = `
    <div class="sbi-student-doc-confirm-modal__backdrop" data-sbi-doc-confirm-cancel></div>
    <section class="sbi-student-doc-confirm-modal__panel" role="dialog" aria-modal="true" aria-labelledby="sbi-student-doc-confirm-title">
      <header>
        <p>Confirmation SBI</p>
        <h3 id="sbi-student-doc-confirm-title">Confirmer l’action</h3>
      </header>
      <div class="sbi-student-doc-confirm-modal__body" data-sbi-doc-confirm-message></div>
      <footer>
        <button type="button" class="sbi-student-doc-confirm-modal__ghost" data-sbi-doc-confirm-cancel>Annuler</button>
        <button type="button" class="sbi-student-doc-confirm-modal__primary" data-sbi-doc-confirm-ok>Confirmer</button>
      </footer>
    </section>
  `;
  document.body.appendChild(modal);
  return modal;
}

function askSbiDocumentConfirmation({ title = 'Confirmer l’action', message = '', confirmText = 'Confirmer', danger = false } = {}) {
  const modal = ensureSbiDocumentConfirmModal();
  const titleNode = modal.querySelector('#sbi-student-doc-confirm-title');
  const messageNode = modal.querySelector('[data-sbi-doc-confirm-message]');
  const okButton = modal.querySelector('[data-sbi-doc-confirm-ok]');
  const cancelButtons = modal.querySelectorAll('[data-sbi-doc-confirm-cancel]');

  if (titleNode) titleNode.textContent = title;
  if (messageNode) messageNode.innerHTML = message;
  if (okButton) {
    okButton.textContent = confirmText;
    okButton.classList.toggle('is-danger', danger === true);
  }

  modal.classList.add('is-open');
  document.body.classList.add('sbi-student-doc-confirm-open');

  return new Promise((resolve) => {
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      modal.classList.remove('is-open');
      document.body.classList.remove('sbi-student-doc-confirm-open');
      okButton?.removeEventListener('click', onOk);
      cancelButtons.forEach((button) => button.removeEventListener('click', onCancel));
      document.removeEventListener('keydown', onKeydown, true);
      resolve(value);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onKeydown = (event) => {
      if (event.key === 'Escape') close(false);
    };

    okButton?.addEventListener('click', onOk);
    cancelButtons.forEach((button) => button.addEventListener('click', onCancel));
    document.addEventListener('keydown', onKeydown, true);
  });
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
          ${item.validationStatus === 'validated' ? '<em class="is-validated">Validé</em>' : ''}
          ${item.validationStatus === 'rejected' || item.status === 'rejected' ? '<em class="is-rejected">À refaire</em>' : ''}
          ${item.compressed === true ? '<em class="is-compressed">Compressé</em>' : ''}
          ${item.visibility === 'student_visible' ? '<em class="is-student-visible">Visible élève</em>' : '<em class="is-admin-only">Admin uniquement</em>'}
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
        ${!isArchived ? `<button type="button" data-doc-visibility="${safeId}">${item.visibility === 'student_visible' ? 'Masquer élève' : 'Rendre visible élève'}</button>` : ''}
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


async function loadStudentDocumentRequests(db, studentUid) {
  const requestsQuery = query(
    collection(db, 'studentDocumentRequests'),
    where('studentUid', '==', studentUid)
  );
  const snap = await getDocs(requestsQuery);
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  rows.sort((a, b) => toMillis(b.createdAt || b.updatedAt) - toMillis(a.createdAt || a.updatedAt));
  return rows;
}

function getRequestProgress(request = {}) {
  const items = Array.isArray(request.items) ? request.items : [];
  const submitted = items.filter((item) => ['submitted', 'validated'].includes(String(item.status || '').toLowerCase())).length;
  const total = items.length;
  return { submitted, total, items };
}

function renderStudentDocumentRequestCard(request = {}) {
  const { submitted, total, items } = getRequestProgress(request);
  const status = String(request.status || 'requested').toLowerCase();
  const label = DOCUMENT_REQUEST_STATUS_LABELS[status] || DOCUMENT_REQUEST_STATUS_LABELS.requested;
  const waiting = status === 'requested' || status === 'partial';
  const canceled = status === 'canceled' || status === 'cancelled';
  const received = status === 'submitted' || status === 'completed';
  const safeRequestId = escapeHTML(request.id || '');

  return `
    <article class="sbi-student-doc-request-admin-card ${waiting ? 'is-waiting' : ''} ${received ? 'is-received' : ''} ${canceled ? 'is-canceled' : ''}">
      <div class="sbi-student-doc-request-admin-card__head">
        <div>
          <strong>${canceled ? 'Demande annulée' : waiting ? 'Documents en attente de réception' : 'Documents transmis par l’élève'}</strong>
          <span>${escapeHTML(formatDate(request.createdAt, 'Date inconnue'))}</span>
        </div>
        <em>${escapeHTML(label)} · ${submitted}/${total}</em>
      </div>
      ${request.note ? `<p>${escapeHTML(request.note)}</p>` : ''}
      <ul>
        ${items.map((item) => {
          const itemStatus = String(item.status || 'pending').toLowerCase();
          const done = ['submitted', 'validated'].includes(itemStatus);
          return `<li class="${done ? 'is-done' : 'is-pending'}"><span>${escapeHTML(item.title || 'Document demandé')}</span><em>${done ? 'Reçu' : canceled ? 'Annulé' : 'En attente'}</em></li>`;
        }).join('')}
      </ul>
      <div class="sbi-student-doc-request-admin-card__actions">
        ${(waiting || received) ? `<button type="button" data-request-cancel="${safeRequestId}">Annuler la demande</button>` : ''}
        ${received ? `<button type="button" data-request-review="${safeRequestId}">Vérifier les documents</button>` : ''}
      </div>
    </article>
  `;
}

async function cancelStudentDocumentRequest(panel, db, uid, requestId, button) {
  if (!requestId) return;
  const confirmed = await askSbiDocumentConfirmation({
    title: 'Annuler la demande de documents',
    message: '<p>Le lien élève ne permettra plus de déposer les pièces restantes.</p><p>Les documents déjà présents dans le coffre ne sont pas supprimés.</p>',
    confirmText: 'Annuler la demande',
    danger: true
  });
  if (!confirmed) return;

  const previous = button?.textContent || 'Annuler la demande';
  if (button) {
    button.disabled = true;
    button.textContent = 'Annulation...';
  }

  try {
    const callable = getAdminCancelStudentDocumentRequestCallable();
    await callable({ requestId });
    setStatus(panel, 'Demande de documents annulée.', 'success');
    await refreshStudentDocumentRequests(panel, db, uid);
  } catch (error) {
    console.warn('[SBI Documents] Annulation demande impossible :', error);
    setStatus(panel, getCallableUiMessage(error, 'Annulation impossible.'), 'error');
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}


function getRequestDocumentItems(request = {}, documents = []) {
  const items = Array.isArray(request.items) ? request.items : [];
  return items.map((item) => {
    const documentId = String(item.documentId || '');
    const document = documents.find((entry) => entry.id === documentId) || null;
    return { item, document };
  });
}

function getOrCreateReviewModal() {
  let modal = document.getElementById('sbi-student-doc-review-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'sbi-student-doc-review-modal';
  modal.className = 'sbi-doc-request-modal sbi-doc-review-modal';
  modal.innerHTML = `
    <div class="sbi-doc-request-modal__backdrop" data-doc-review-close></div>
    <section class="sbi-doc-request-modal__panel" role="dialog" aria-modal="true" aria-labelledby="sbi-doc-review-title">
      <header class="sbi-doc-request-modal__header">
        <div>
          <p>Vérification admin</p>
          <h3 id="sbi-doc-review-title">Documents transmis par l’élève</h3>
        </div>
        <button type="button" class="sbi-doc-request-modal__close" data-doc-review-close aria-label="Fermer">×</button>
      </header>
      <div class="sbi-doc-request-modal__content" id="sbi-doc-review-content"></div>
      <footer class="sbi-doc-request-modal__footer">
        <span id="sbi-doc-review-status" aria-live="polite"></span>
        <div>
          <button type="button" class="sbi-doc-request-modal__ghost" data-doc-review-close>Fermer</button>
          <button type="button" id="sbi-doc-review-validate-btn" class="sbi-doc-request-modal__primary">Enregistrer la vérification</button>
        </div>
      </footer>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-doc-review-close]').forEach((button) => {
    button.addEventListener('click', closeStudentDocumentReviewModal);
  });
  return modal;
}

function closeStudentDocumentReviewModal() {
  const modal = document.getElementById('sbi-student-doc-review-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  document.body.classList.remove('sbi-doc-request-modal-open');
}

function setReviewModalStatus(modal, message = '', tone = 'muted') {
  const status = modal?.querySelector?.('#sbi-doc-review-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function getReviewItemStatus(item = {}, document = null) {
  const status = String(item.status || '').toLowerCase();
  if (status === 'validated') return 'validated';
  if (status === 'rejected') return 'rejected';
  if (document || status === 'submitted') return 'submitted';
  return 'missing';
}

async function openStudentDocumentReviewModal({ panel, db, uid, request }) {
  const modal = getOrCreateReviewModal();
  const documents = getPanelDocuments(panel);
  const rows = getRequestDocumentItems(request, documents);
  const content = modal.querySelector('#sbi-doc-review-content');
  const validateButton = modal.querySelector('#sbi-doc-review-validate-btn');

  if (content) {
    content.innerHTML = `
      <div class="sbi-doc-review-summary">
        <strong>Vérification des documents</strong>
        <span>${escapeHTML(formatDate(request.updatedAt || request.createdAt, 'Date inconnue'))}</span>
      </div>
      <p class="sbi-doc-review-help">Sélectionne les pièces conformes. Les documents refusés ou manquants resteront à fournir par l’élève via le même lien.</p>
      <div class="sbi-doc-review-list">
        ${rows.map(({ item, document }, index) => {
          const state = getReviewItemStatus(item, document);
          const ready = Boolean(document) || state === 'validated';
          const rejected = state === 'rejected';
          const validated = state === 'validated';
          const locked = validated && !document;
          const currentNote = item.reviewNote || item.rejectionNote || '';
          return `
            <article class="sbi-doc-review-item ${ready ? 'is-ready' : 'is-missing'} ${validated ? 'is-validated' : ''} ${rejected ? 'is-rejected' : ''} ${locked ? 'is-locked' : ''}" data-doc-review-index="${index}">
              <div>
                <strong>${escapeHTML(item.title || 'Document demandé')}</strong>
                <span>${document ? escapeHTML(document.fileName || item.fileName || 'Fichier reçu') : validated ? 'Document déjà validé lors du précédent contrôle' : 'Document non transmis / à refaire'}</span>
                ${currentNote ? `<small>${escapeHTML(currentNote)}</small>` : ''}
              </div>
              <em>${validated ? 'Déjà validé' : document ? 'Reçu à vérifier' : rejected ? 'À refaire' : 'Manquant'}</em>
              ${document ? `
                <div class="sbi-doc-review-item__actions">
                  <button type="button" data-review-open="${escapeHTML(document.id)}">Ouvrir</button>
                  <button type="button" data-review-download="${escapeHTML(document.id)}">Télécharger</button>
                </div>
              ` : ''}
              <div class="sbi-doc-review-decision">
                <label>
                  <span>Décision</span>
                  <select data-review-decision="${index}" ${locked ? 'disabled' : ''}>
                    <option value="validated" ${(document || validated) && !rejected ? 'selected' : ''} ${!document && !validated ? 'disabled' : ''}>Valider</option>
                    <option value="rejected" ${(!document && !validated) || rejected ? 'selected' : ''} ${locked ? 'disabled' : ''}>À refaire / refuser</option>
                  </select>
                </label>
                <label>
                  <span>${locked ? 'Statut' : 'Note pour l’élève si refus'}</span>
                  <input type="text" data-review-note="${index}" maxlength="260" value="${escapeHTML(locked ? 'Document déjà validé.' : currentNote)}" placeholder="Ex : photo floue, document incomplet, justificatif trop ancien..." ${locked ? 'readonly' : ''}>
                </label>
              </div>
            </article>
          `;
        }).join('')}
      </div>
      <label class="sbi-doc-review-global-note">
        <span>Message optionnel à l’élève</span>
        <textarea id="sbi-doc-review-global-note" rows="3" maxlength="1200" placeholder="Message global ajouté au mail si une pièce est à refaire."></textarea>
      </label>
    `;
  }

  modal.querySelectorAll('[data-review-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = documents.find((entry) => entry.id === button.dataset.reviewOpen);
      await openStudentDocument(panel, item, button);
    });
  });

  modal.querySelectorAll('[data-review-download]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = documents.find((entry) => entry.id === button.dataset.reviewDownload);
      await downloadStudentDocument(panel, item, button);
    });
  });

  if (validateButton) {
    validateButton.disabled = false;
    validateButton.textContent = 'Enregistrer la vérification';
    validateButton.onclick = async () => {
      const decisions = rows.map(({ item, document }, index) => {
        const select = modal.querySelector(`[data-review-decision="${index}"]`);
        const lockedValidated = String(item.status || '').toLowerCase() === 'validated' && !document;
        const note = lockedValidated ? '' : normalizeText(modal.querySelector(`[data-review-note="${index}"]`)?.value || '', 260);
        const status = lockedValidated || (select?.value === 'validated' && (document || item.status === 'validated')) ? 'validated' : 'rejected';
        return {
          itemIndex: index,
          type: item.type || '',
          title: item.title || 'Document demandé',
          documentId: document?.id || item.documentId || '',
          status,
          note
        };
      });
      const rejectedCount = decisions.filter((item) => item.status === 'rejected').length;
      const confirmed = await askSbiDocumentConfirmation({
        title: rejectedCount > 0 ? 'Redemander des documents à l’élève' : 'Valider tous les documents',
        message: rejectedCount > 0
          ? `<p>${rejectedCount} document(s) seront redemandés à l’élève.</p><p>Un email SBI sera envoyé avec le même lien de dépôt.</p>`
          : '<p>Tous les documents seront validés.</p><p>Un email de confirmation sera envoyé à l’élève.</p>',
        confirmText: rejectedCount > 0 ? 'Envoyer la demande de correction' : 'Valider le dossier',
        danger: rejectedCount > 0
      });
      if (!confirmed) return;

      validateButton.disabled = true;
      validateButton.textContent = 'Enregistrement...';
      setReviewModalStatus(modal, 'Enregistrement de la vérification...', 'muted');

      try {
        const callable = getAdminReviewStudentDocumentRequestCallable();
        const response = await callable({
          requestId: request.id,
          decisions,
          note: normalizeText(modal.querySelector('#sbi-doc-review-global-note')?.value || '', 1200)
        });
        const nextStatus = response?.data?.status || '';
        setReviewModalStatus(
          modal,
          nextStatus === 'completed'
            ? 'Demande validée. Email de confirmation envoyé à l’élève.'
            : 'Vérification enregistrée. Les pièces à refaire ont été redemandées à l’élève.',
          'success'
        );
        setStatus(
          panel,
          nextStatus === 'completed'
            ? 'Demande validée. Les documents restent disponibles dans le coffre actif.'
            : 'Demande partiellement validée. Les documents refusés sont à refaire par l’élève.',
          'success'
        );
        const [nextDocuments] = await Promise.all([
          loadStudentDocuments(db, uid),
          refreshStudentDocumentRequests(panel, db, uid)
        ]);
        setPanelDocuments(panel, nextDocuments);
        renderDocumentsList(panel, nextDocuments, db);
        window.setTimeout(closeStudentDocumentReviewModal, 1100);
      } catch (error) {
        console.warn('[SBI Documents] Vérification demande impossible :', error);
        setReviewModalStatus(modal, getCallableUiMessage(error, 'Vérification impossible.'), 'error');
        validateButton.disabled = false;
        validateButton.textContent = 'Enregistrer la vérification';
      }
    };
  }

  setReviewModalStatus(modal, 'Ouvre les pièces, choisis Valider ou À refaire, puis enregistre la vérification.', 'muted');
  modal.classList.add('is-open');
  document.body.classList.add('sbi-doc-request-modal-open');
}

function renderStudentDocumentRequests(panel, requests = [], db = null, uid = '') {
  const container = panel.querySelector('#prof-student-document-requests');
  if (!container) return;

  const hiddenStatuses = new Set(['archived', 'canceled', 'cancelled', 'completed', 'validated', 'expired']);
  const activeRequests = requests.filter((request) => !hiddenStatuses.has(String(request.status || '').toLowerCase()));
  if (!activeRequests.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="sbi-student-doc-request-admin">
      <div class="sbi-student-doc-request-admin__title">
        <strong>Demandes envoyées à l’élève</strong>
        <span>${activeRequests.length} demande(s)</span>
      </div>
      ${activeRequests.map(renderStudentDocumentRequestCard).join('')}
    </div>
  `;

  container.querySelectorAll('[data-request-cancel]').forEach((button) => {
    button.addEventListener('click', async () => {
      await cancelStudentDocumentRequest(panel, db, uid, button.dataset.requestCancel || '', button);
    });
  });

  container.querySelectorAll('[data-request-review]').forEach((button) => {
    button.addEventListener('click', async () => {
      const request = activeRequests.find((entry) => entry.id === button.dataset.requestReview);
      if (!request) return;
      await openStudentDocumentReviewModal({ panel, db, uid, request });
    });
  });
}

async function refreshStudentDocumentRequests(panel, db, uid) {
  try {
    const requests = await loadStudentDocumentRequests(db, uid);
    renderStudentDocumentRequests(panel, requests, db, uid);
  } catch (error) {
    console.warn('[SBI Documents] Lecture demandes documents impossible :', error);
  }
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
  const confirmed = await askSbiDocumentConfirmation({
    title: 'Archiver ce document',
    message: '<p>Le fichier restera conservé, mais il sera masqué de la liste active.</p>',
    confirmText: 'Archiver',
    danger: false
  });
  if (!confirmed) return;

  const previous = button?.textContent || 'Archiver';
  if (button) {
    button.disabled = true;
    button.textContent = 'Archivage...';
  }

  try {
    const callable = getAdminArchiveStudentDocumentCallable();
    await callable({ documentId });
    setStatus(panel, 'Document archivé.', 'success');
    const nextDocuments = await loadStudentDocuments(db, panel.dataset.studentUid || '');
    setPanelDocuments(panel, nextDocuments);
    renderDocumentsList(panel, nextDocuments, db);
  } catch (error) {
    console.warn('[SBI Documents] Archivage impossible :', error);
    setStatus(panel, getCallableUiMessage(error, 'Archivage impossible.'), 'error');
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

async function deleteStudentDocument(panel, db, item, button) {
  const confirmed = await askSbiDocumentConfirmation({
    title: 'Supprimer définitivement ce document',
    message: '<p>Le fichier et sa fiche seront retirés du coffre élève.</p><p>Cette action est enregistrée dans le journal admin.</p>',
    confirmText: 'Supprimer définitivement',
    danger: true
  });
  if (!confirmed) return;

  const previous = button?.textContent || 'Supprimer';
  if (button) {
    button.disabled = true;
    button.textContent = 'Suppression...';
  }

  try {
    const callable = getAdminDeleteStudentDocumentCallable();
    await callable({ documentId: item.id });
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


async function setStudentDocumentVisibility(panel, db, item, button) {
  if (!item?.id) return;
  const makeVisible = item.visibility !== 'student_visible';

  const confirmed = await askSbiDocumentConfirmation({
    title: makeVisible ? 'Rendre ce document accessible à l’élève' : 'Masquer ce document à l’élève',
    message: makeVisible
      ? '<p>Ce document pourra être vu, ouvert et téléchargé par l’élève depuis son espace.</p><p>Vérifie qu’il ne contient pas d’information réservée à l’administration.</p>'
      : '<p>Ce document restera dans le coffre admin, mais ne sera plus accessible à l’élève.</p>',
    confirmText: makeVisible ? 'Rendre visible élève' : 'Masquer élève',
    danger: false
  });
  if (!confirmed) return;

  const previous = button?.textContent || (makeVisible ? 'Rendre visible élève' : 'Masquer élève');
  if (button) {
    button.disabled = true;
    button.textContent = makeVisible ? 'Activation...' : 'Masquage...';
  }

  try {
    const callable = getAdminSetStudentDocumentVisibilityCallable();
    const response = await callable({ documentId: item.id, visible: makeVisible });
    const warning = response?.data?.warning || '';
    setStatus(
      panel,
      warning || (makeVisible ? 'Document rendu accessible à l’élève. Notification + email envoyés.' : 'Document masqué à l’élève.'),
      warning ? 'error' : 'success'
    );
    const nextDocuments = await loadStudentDocuments(db, panel.dataset.studentUid || '');
    setPanelDocuments(panel, nextDocuments);
    renderDocumentsList(panel, nextDocuments, db);
  } catch (error) {
    console.warn('[SBI Documents] Modification visibilité impossible :', error);
    setStatus(panel, getCallableUiMessage(error, 'Modification visibilité impossible.'), 'error');
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

  list.querySelectorAll('[data-doc-visibility]').forEach((button) => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.docVisibility || '';
      const item = getPanelDocuments(panel).find((entry) => entry.id === documentId);
      if (!item) return;
      await setStudentDocumentVisibility(panel, db, item, button);
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

    try {
      const logCallable = getAdminLogStudentDocumentManualUploadCallable();
      await logCallable({ documentId: documentRef.id });
    } catch (logError) {
      console.warn('[SBI Documents] Journal admin upload manuel non bloquant :', logError);
    }

    if (fileInput) fileInput.value = '';
    const displayedFileName = panel.querySelector('#prof-student-document-file-name');
    if (displayedFileName) displayedFileName.textContent = 'Aucun fichier sélectionné';
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


function getFunctionsInstance() {
  if (!window.__SBI_STUDENT_DOCUMENTS_FUNCTIONS__) {
    window.__SBI_STUDENT_DOCUMENTS_FUNCTIONS__ = getFunctions(app, FUNCTIONS_REGION);
  }
  return window.__SBI_STUDENT_DOCUMENTS_FUNCTIONS__;
}

function getAdminCreateStudentDocumentRequestCallable() {
  if (!window.__SBI_ADMIN_CREATE_STUDENT_DOCUMENT_REQUEST__) {
    window.__SBI_ADMIN_CREATE_STUDENT_DOCUMENT_REQUEST__ = httpsCallable(
      getFunctionsInstance(),
      'adminCreateStudentDocumentRequest'
    );
  }
  return window.__SBI_ADMIN_CREATE_STUDENT_DOCUMENT_REQUEST__;
}

function getAdminReviewStudentDocumentRequestCallable() {
  if (!window.__SBI_ADMIN_REVIEW_STUDENT_DOCUMENT_REQUEST__) {
    window.__SBI_ADMIN_REVIEW_STUDENT_DOCUMENT_REQUEST__ = httpsCallable(
      getFunctionsInstance(),
      'adminReviewStudentDocumentRequest'
    );
  }
  return window.__SBI_ADMIN_REVIEW_STUDENT_DOCUMENT_REQUEST__;
}

function getAdminCancelStudentDocumentRequestCallable() {
  if (!window.__SBI_ADMIN_CANCEL_STUDENT_DOCUMENT_REQUEST__) {
    window.__SBI_ADMIN_CANCEL_STUDENT_DOCUMENT_REQUEST__ = httpsCallable(
      getFunctionsInstance(),
      'adminCancelStudentDocumentRequest'
    );
  }
  return window.__SBI_ADMIN_CANCEL_STUDENT_DOCUMENT_REQUEST__;
}

function getAdminLogStudentDocumentManualUploadCallable() {
  if (!window.__SBI_ADMIN_LOG_STUDENT_DOCUMENT_MANUAL_UPLOAD__) {
    window.__SBI_ADMIN_LOG_STUDENT_DOCUMENT_MANUAL_UPLOAD__ = httpsCallable(
      getFunctionsInstance(),
      'adminLogStudentDocumentManualUpload'
    );
  }
  return window.__SBI_ADMIN_LOG_STUDENT_DOCUMENT_MANUAL_UPLOAD__;
}

function getAdminArchiveStudentDocumentCallable() {
  if (!window.__SBI_ADMIN_ARCHIVE_STUDENT_DOCUMENT__) {
    window.__SBI_ADMIN_ARCHIVE_STUDENT_DOCUMENT__ = httpsCallable(
      getFunctionsInstance(),
      'adminArchiveStudentDocument'
    );
  }
  return window.__SBI_ADMIN_ARCHIVE_STUDENT_DOCUMENT__;
}

function getAdminDeleteStudentDocumentCallable() {
  if (!window.__SBI_ADMIN_DELETE_STUDENT_DOCUMENT__) {
    window.__SBI_ADMIN_DELETE_STUDENT_DOCUMENT__ = httpsCallable(
      getFunctionsInstance(),
      'adminDeleteStudentDocument'
    );
  }
  return window.__SBI_ADMIN_DELETE_STUDENT_DOCUMENT__;
}


function getAdminSetStudentDocumentVisibilityCallable() {
  if (!window.__SBI_ADMIN_SET_STUDENT_DOCUMENT_VISIBILITY__) {
    window.__SBI_ADMIN_SET_STUDENT_DOCUMENT_VISIBILITY__ = httpsCallable(
      getFunctionsInstance(),
      'adminSetStudentDocumentVisibility'
    );
  }
  return window.__SBI_ADMIN_SET_STUDENT_DOCUMENT_VISIBILITY__;
}

function getStudentDisplayName(data = {}, uid = '') {
  const full = normalizeText(`${data.prenom || ''} ${data.nom || ''}`, 140)
    || normalizeText(data.displayName || data.name || data.fullName || '', 140)
    || normalizeText(data.email || '', 140)
    || uid;
  return full || 'Élève';
}

function buildStudentDocumentRequestLink(requestId = '') {
  const url = new URL('/student/document-request.html', window.location.origin);
  url.searchParams.set('request', requestId);
  return url.toString();
}

function renderRequestTypeCheckbox(typeKey) {
  const def = DOCUMENT_REQUEST_TYPES[typeKey] || DOCUMENT_REQUEST_TYPES.other;
  return `
    <label class="sbi-doc-request-choice">
      <input type="checkbox" value="${escapeHTML(typeKey)}" ${['identity','domicile','photo'].includes(typeKey) ? 'checked' : ''}>
      <span>
        <strong>${escapeHTML(def.label)}</strong>
        <em>${escapeHTML(def.accept)}</em>
      </span>
    </label>
  `;
}

function getOrCreateRequestModal() {
  let modal = document.getElementById('sbi-student-doc-request-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'sbi-student-doc-request-modal';
  modal.className = 'sbi-doc-request-modal';
  modal.innerHTML = `
    <div class="sbi-doc-request-modal__backdrop" data-doc-request-close></div>
    <section class="sbi-doc-request-modal__panel" role="dialog" aria-modal="true" aria-labelledby="sbi-doc-request-title">
      <header class="sbi-doc-request-modal__header">
        <div>
          <p>Demande élève</p>
          <h3 id="sbi-doc-request-title">Demander des documents</h3>
        </div>
        <button type="button" class="sbi-doc-request-modal__close" data-doc-request-close aria-label="Fermer">×</button>
      </header>
      <div class="sbi-doc-request-modal__content">
        <div class="sbi-doc-request-modal__intro">
          <strong id="sbi-doc-request-student-name">Élève</strong>
          <span>Choisis les pièces à demander. L’élève recevra un email SBI avec un lien vers une page dédiée.</span>
        </div>
        <div class="sbi-doc-request-grid">
          ${DEFAULT_REQUEST_DOCUMENTS.map(renderRequestTypeCheckbox).join('')}
        </div>
        <label class="sbi-doc-request-custom">
          <span>Nom du document personnalisé</span>
          <input id="sbi-doc-request-custom-title" type="text" maxlength="120" placeholder="Ex : Attestation spécifique, document complémentaire...">
        </label>
        <label class="sbi-doc-request-custom">
          <span>Message optionnel à l’élève</span>
          <textarea id="sbi-doc-request-note" rows="4" maxlength="1200" placeholder="Ex : Merci de déposer les documents lisibles au format PDF, JPG ou PNG."></textarea>
        </label>
      </div>
      <footer class="sbi-doc-request-modal__footer">
        <span id="sbi-doc-request-status" aria-live="polite"></span>
        <div>
          <button type="button" class="sbi-doc-request-modal__ghost" data-doc-request-close>Annuler</button>
          <button type="button" id="sbi-doc-request-send-btn" class="sbi-doc-request-modal__primary">Envoyer la demande</button>
        </div>
      </footer>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-doc-request-close]').forEach((button) => {
    button.addEventListener('click', closeStudentDocumentRequestModal);
  });
  return modal;
}

function closeStudentDocumentRequestModal() {
  const modal = document.getElementById('sbi-student-doc-request-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  document.body.classList.remove('sbi-doc-request-modal-open');
}

function setRequestModalStatus(modal, message = '', tone = 'muted') {
  const status = modal?.querySelector?.('#sbi-doc-request-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function collectRequestedDocuments(modal) {
  const selected = Array.from(modal.querySelectorAll('.sbi-doc-request-choice input:checked'))
    .map((input) => input.value)
    .filter(Boolean);
  const customTitle = normalizeText(modal.querySelector('#sbi-doc-request-custom-title')?.value || '', 120);
  const documents = selected.map((type) => {
    const def = DOCUMENT_REQUEST_TYPES[type] || DOCUMENT_REQUEST_TYPES.other;
    return {
      type,
      title: type === 'other' && customTitle ? customTitle : def.label,
      category: def.category,
      acceptLabel: def.accept,
      required: true
    };
  });
  return documents.filter((item, index, list) => list.findIndex((other) => other.type === item.type) === index);
}

async function openStudentDocumentRequestModal({ panel, db, uid, data = {}, context = {} }) {
  const modal = getOrCreateRequestModal();
  const studentName = getStudentDisplayName(data, uid);
  modal.dataset.studentUid = uid;
  modal.__sbiRequestContext = { panel, db, uid, data, context };
  const title = modal.querySelector('#sbi-doc-request-student-name');
  if (title) title.textContent = studentName;
  modal.querySelectorAll('.sbi-doc-request-choice input').forEach((input) => {
    input.checked = ['identity','domicile','photo'].includes(input.value);
  });
  const customTitle = modal.querySelector('#sbi-doc-request-custom-title');
  const note = modal.querySelector('#sbi-doc-request-note');
  if (customTitle) customTitle.value = '';
  if (note) note.value = '';
  setRequestModalStatus(modal, '', 'muted');

  const sendButton = modal.querySelector('#sbi-doc-request-send-btn');
  if (sendButton && sendButton.dataset.bound !== 'true') {
    sendButton.dataset.bound = 'true';
    sendButton.addEventListener('click', async () => {
      const ctx = modal.__sbiRequestContext || {};
      const documents = collectRequestedDocuments(modal);
      const requestNote = String(modal.querySelector('#sbi-doc-request-note')?.value || '').trim().slice(0, 1200);
      if (!documents.length) {
        setRequestModalStatus(modal, 'Sélectionne au moins un document à demander.', 'error');
        return;
      }
      sendButton.disabled = true;
      sendButton.textContent = 'Envoi...';
      setRequestModalStatus(modal, 'Création de la demande et envoi email...', 'muted');
      try {
        const callable = getAdminCreateStudentDocumentRequestCallable();
        const response = await callable({
          studentUid: ctx.uid,
          documents,
          note: requestNote
        });
        const requestId = response?.data?.requestId || '';
        const requestLink = response?.data?.requestLink || buildStudentDocumentRequestLink(requestId);
        setRequestModalStatus(modal, `Demande envoyée. Lien : ${requestLink}`, response?.data?.warning ? 'error' : 'success');
        setStatus(ctx.panel, response?.data?.warning || 'Demande de documents envoyée à l’élève.', response?.data?.warning ? 'error' : 'success');
        await refreshStudentDocumentRequests(ctx.panel, ctx.db, ctx.uid);
        await navigator.clipboard?.writeText?.(requestLink).catch(() => {});
        window.setTimeout(closeStudentDocumentRequestModal, 1200);
      } catch (error) {
        console.warn('[SBI Documents] Demande documents impossible :', error);
        setRequestModalStatus(modal, getCallableUiMessage(error, 'Demande impossible.'), 'error');
      } finally {
        sendButton.disabled = false;
        sendButton.textContent = 'Envoyer la demande';
      }
    });
  }

  modal.classList.add('is-open');
  document.body.classList.add('sbi-doc-request-modal-open');
}

function renderPanelShell(panel, { uid = '', data = {}, context = {} } = {}) {
  panel.innerHTML = `
    <div class="sbi-student-documents">
      <div class="sbi-student-documents__header">
        <div>
          <p>Coffre élève</p>
          <h4>Documents élève</h4>
        </div>
        <div class="sbi-student-documents__header-actions">
          <span>Admin uniquement</span>
          <button type="button" id="prof-request-student-documents-btn">Demander documents</button>
        </div>
      </div>

      <div id="prof-student-document-requests" class="sbi-student-documents__requests" hidden></div>

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
        <label class="sbi-student-documents__file sbi-file-picker-field">
          <span>Fichier</span>
          <div class="sbi-file-picker">
            <input id="prof-student-document-file" class="sbi-file-picker__input" type="file" accept=".pdf,.doc,.docx,.txt,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
            <button type="button" class="sbi-file-picker__button" data-file-trigger>Choisir un fichier</button>
            <strong id="prof-student-document-file-name" class="sbi-file-picker__name">Aucun fichier sélectionné</strong>
          </div>
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
  renderPanelShell(panel, { uid, data, context });

  const form = panel.querySelector('#prof-student-document-form');
  const showArchived = panel.querySelector('#prof-student-documents-show-archived');
  const requestButton = panel.querySelector('#prof-request-student-documents-btn');
  const fileInput = panel.querySelector('#prof-student-document-file');
  const fileName = panel.querySelector('#prof-student-document-file-name');
  const fileTrigger = panel.querySelector('[data-file-trigger]');

  fileTrigger?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    if (fileName) fileName.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : 'Aucun fichier sélectionné';
  });

  requestButton?.addEventListener('click', () => openStudentDocumentRequestModal({ panel, db, uid, data, context }));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await uploadStudentDocument({ db, uid, data, context, panel });
  });

  try {
    const [documents, requests] = await Promise.all([
      loadStudentDocuments(db, uid),
      loadStudentDocumentRequests(db, uid)
    ]);
    if (token !== activeMountToken) return;
    setPanelDocuments(panel, documents);
    renderStudentDocumentRequests(panel, requests, db, uid);
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
