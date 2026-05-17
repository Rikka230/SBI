import { app, auth, db, storage } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

const MAX_FILE_SIZE = 40 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_QUALITY = 0.84;
const FUNCTIONS_REGION = 'europe-west1';

const status = document.getElementById('student-doc-request-status');
const content = document.getElementById('student-doc-request-content');
const functions = getFunctions(app, 'europe-west1');
const studentGetDocumentRequestCallable = httpsCallable(functions, 'studentGetDocumentRequest');
const studentNotifyDocumentRequestSubmittedCallable = httpsCallable(functions, 'studentNotifyDocumentRequestSubmitted');

let activeRequest = null;
let activeUserData = null;

function setStatus(message, tone = 'muted') {
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function escapeHTML(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slug(value = 'document', max = 90) {
  return String(value || 'document')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'document';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extension(file) {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
  }[file?.type || '']) || String(file?.name || '').split('.').pop()?.toLowerCase() || 'file';
}

function isAllowed(file, item = {}) {
  if (!file) return false;
  const acceptLabel = String(item.acceptLabel || '').toLowerCase();
  if (acceptLabel === 'pdf') return file.type === 'application/pdf';
  return file.type?.startsWith('image/') || file.type === 'application/pdf';
}

async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { file, compressed: false, originalSize: file.size };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { file, compressed: false, originalSize: file.size };

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
  if (!blob || blob.size >= file.size * 0.96) {
    return { file, compressed: false, originalSize: file.size };
  }

  return {
    file: new File([blob], `${slug(file.name.replace(/\.[^.]+$/, ''))}.jpg`, { type: 'image/jpeg' }),
    compressed: true,
    originalSize: file.size
  };
}

function getRequestId() {
  return new URL(window.location.href).searchParams.get('request') || '';
}

function buildFileName(item, user, file) {
  const studentName = slug(`${user.nom || ''} ${user.prenom || ''}`.trim() || user.displayName || user.email || user.uid || 'eleve', 80);
  return `${slug(item.title || item.type || 'document')}__${studentName}__${today()}.${extension(file).replace(/[^a-z0-9]/g, '') || 'file'}`;
}

function getRequiredItems(items = []) {
  return items.filter((item) => item.required !== false);
}

function isRequestComplete(request = {}) {
  const items = Array.isArray(request.items) ? request.items : [];
  const required = getRequiredItems(items);
  return required.length > 0 && required.every((item) => item.status === 'submitted' || item.status === 'validated');
}

function isRequestCanceled(request = {}) {
  return ['canceled', 'cancelled', 'archived'].includes(String(request.status || '').toLowerCase());
}

function getFunctionsInstance() {
  if (!window.__SBI_STUDENT_DOC_REQUEST_FUNCTIONS__) {
    window.__SBI_STUDENT_DOC_REQUEST_FUNCTIONS__ = getFunctions(app, FUNCTIONS_REGION);
  }
  return window.__SBI_STUDENT_DOC_REQUEST_FUNCTIONS__;
}

function getStudentRequestCallable() {
  if (!window.__SBI_STUDENT_GET_DOCUMENT_REQUEST__) {
    window.__SBI_STUDENT_GET_DOCUMENT_REQUEST__ = httpsCallable(getFunctionsInstance(), 'studentGetDocumentRequest');
  }
  return window.__SBI_STUDENT_GET_DOCUMENT_REQUEST__;
}

function getCallableMessage(error, fallback = 'Action impossible pour le moment.') {
  return String(error?.message || error?.details?.message || fallback)
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\([^)]*\)\.?$/g, '')
    .trim() || fallback;
}

function renderRequest(request, userData) {
  activeRequest = request;
  activeUserData = userData;

  const items = Array.isArray(request.items) ? request.items : [];
  const submittedCount = items.filter((item) => item.status === 'submitted' || item.status === 'validated').length;
  const completed = isRequestComplete(request);
  const canceled = isRequestCanceled(request);
  const hasPendingRequired = !canceled && getRequiredItems(items).some((item) => item.status !== 'submitted' && item.status !== 'validated');

  content.innerHTML = `
    <div class="sbi-doc-request-summary">
      <div><span>Élève</span><strong>${escapeHTML(userData.prenom || '')} ${escapeHTML(userData.nom || '')}</strong></div>
      <div><span>Documents demandés</span><strong>${items.length}</strong></div>
      <div><span>Envoyés</span><strong>${submittedCount}/${items.length}</strong></div>
    </div>

    ${canceled ? `
      <div class="sbi-doc-request-complete is-canceled">
        Cette demande a été annulée par l’équipe SBI. Aucun dépôt n’est attendu sur ce lien.
      </div>
    ` : completed ? `
      <div class="sbi-doc-request-complete">
        Documents envoyés. L’équipe SBI va vérifier ton dossier.
      </div>
    ` : ''}

    ${request.note ? `<p class="sbi-doc-request-note">${escapeHTML(request.note)}</p>` : ''}

    <div class="sbi-doc-request-list">
      ${items.map((item, index) => {
        const sent = item.status === 'submitted' || item.status === 'validated';
        return `
          <article class="sbi-doc-request-item ${sent ? 'is-submitted' : ''} ${canceled ? 'is-canceled' : ''}" data-index="${index}">
            <div class="sbi-doc-request-item__head">
              <div>
                <h3>${escapeHTML(item.title || 'Document demandé')}</h3>
                <span>${escapeHTML(item.acceptLabel || 'PDF, JPG ou PNG')}</span>
              </div>
              <em>${sent ? 'Envoyé' : 'À fournir'}</em>
            </div>
            <input type="file" accept=".pdf,image/*,application/pdf" ${sent || canceled ? 'disabled' : ''}>
          </article>
        `;
      }).join('')}
    </div>

    <div class="sbi-doc-request-actions">
      <span class="sbi-doc-request-note">
        ${canceled
          ? 'Cette demande n’est plus active.'
          : completed
            ? 'Ton lien reste consultable, mais le dossier a déjà été transmis.'
            : 'Tu peux revenir plus tard avec le même lien tant que les documents obligatoires ne sont pas tous envoyés.'}
      </span>
      <button id="student-doc-request-submit" type="button" ${!hasPendingRequired ? 'disabled' : ''}>
        ${canceled ? 'Demande annulée' : completed ? 'Dossier transmis' : 'Envoyer les documents'}
      </button>
    </div>
  `;

  content.querySelector('#student-doc-request-submit')?.addEventListener('click', () => {
    if (!isRequestComplete(activeRequest) && !isRequestCanceled(activeRequest)) submitDocuments(activeRequest, activeUserData);
  });
}

async function submitDocuments(request, userData) {
  const requestId = getRequestId();
  if (isRequestCanceled(request)) {
    setStatus('Cette demande a été annulée par SBI.', 'error');
    return;
  }
  const items = Array.isArray(request.items) ? request.items : [];
  const cards = Array.from(content.querySelectorAll('.sbi-doc-request-item'));
  const nextItems = items.map((item) => ({ ...item }));
  const pendingUploads = [];

  cards.forEach((card) => {
    const index = Number(card.dataset.index);
    const item = nextItems[index];
    if (!item || item.status === 'submitted' || item.status === 'validated') return;
    const file = card.querySelector('input[type="file"]')?.files?.[0] || null;
    if (file) pendingUploads.push({ index, item, file });
  });

  const missingBeforeUpload = nextItems.some((item, index) => {
    return item.required !== false
      && item.status !== 'submitted'
      && item.status !== 'validated'
      && !pendingUploads.some((upload) => upload.index === index);
  });

  if (!pendingUploads.length) {
    setStatus(
      missingBeforeUpload
        ? 'Ajoute au moins un document avant d’enregistrer. Tu pourras revenir plus tard avec le même lien pour le reste.'
        : 'Tous les documents obligatoires sont déjà transmis.',
      missingBeforeUpload ? 'error' : 'success'
    );
    return;
  }

  for (const upload of pendingUploads) {
    if (upload.file.size > MAX_FILE_SIZE) {
      setStatus('Un fichier dépasse 40 Mo.', 'error');
      return;
    }
    if (!isAllowed(upload.file, upload.item)) {
      setStatus(`Format refusé pour “${upload.item.title || 'document'}”. Formats acceptés : ${upload.item.acceptLabel || 'PDF, JPG ou PNG'}.`, 'error');
      return;
    }
  }

  const button = content.querySelector('#student-doc-request-submit');
  if (button) button.disabled = true;
  setStatus('Envoi des documents...', 'muted');

  try {
    for (const upload of pendingUploads) {
      const prepared = await compressImage(upload.file);
      const safeName = buildFileName(upload.item, userData, prepared.file);

      const documentRef = await addDoc(collection(db, 'studentDocuments'), {
        studentUid: request.studentUid,
        requestId,
        requestItemType: upload.item.type || '',
        title: upload.item.title || 'Document demandé',
        category: upload.item.category || 'administrative',
        fileName: safeName,
        originalFileName: upload.file.name || '',
        contentType: prepared.file.type || 'application/octet-stream',
        size: prepared.file.size,
        originalSize: prepared.originalSize || upload.file.size,
        compressed: prepared.compressed === true,
        status: 'uploading',
        visibility: 'admin_only',
        createdAt: serverTimestamp(),
        createdBy: request.studentUid,
        createdByEmail: userData.email || '',
        source: 'student_request',
        updatedAt: serverTimestamp()
      });

      const filePath = `student-documents/${request.studentUid}/${documentRef.id}/${safeName}`;

      await uploadBytes(ref(storage, filePath), prepared.file, {
        contentType: prepared.file.type || 'application/octet-stream',
        customMetadata: {
          uploadedBy: request.studentUid,
          studentUid: request.studentUid,
          documentId: documentRef.id,
          requestId
        }
      });

      await updateDoc(documentRef, {
        filePath,
        fileName: safeName,
        status: 'submitted',
        submittedAt: serverTimestamp(),
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      nextItems[upload.index] = {
        ...nextItems[upload.index],
        status: 'submitted',
        documentId: documentRef.id,
        fileName: safeName,
        submittedAt: new Date().toISOString()
      };
    }

    const completed = nextItems.every((item) => item.required === false || item.status === 'submitted' || item.status === 'validated');

    await updateDoc(doc(db, 'studentDocumentRequests', requestId), {
      items: nextItems,
      status: completed ? 'submitted' : 'partial',
      ...(completed ? { submittedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp()
    });

    if (completed) {
      await studentNotifyDocumentRequestSubmittedCallable({ requestId }).catch((error) => {
        console.warn('[SBI Student Documents] Notification admin non bloquante :', error);
      });
    }

    const nextRequest = {
      ...request,
      items: nextItems,
      status: completed ? 'submitted' : 'partial'
    };

    const submittedCount = nextItems.filter((item) => item.status === 'submitted' || item.status === 'validated').length;
    setStatus(
      completed
        ? 'Documents envoyés. L’équipe SBI va les vérifier.'
        : `${submittedCount}/${nextItems.length} document(s) enregistré(s). Tu peux compléter le reste plus tard avec le même lien.`,
      'success'
    );
    renderRequest(nextRequest, userData);
  } catch (error) {
    console.error('[SBI Student Documents] Envoi impossible :', error);
    setStatus(getCallableMessage(error, 'Envoi impossible pour le moment. Réessaie ou contacte SBI.'), 'error');
    if (button) button.disabled = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  const requestId = getRequestId();

  if (!requestId) {
    setStatus('Lien de demande invalide.', 'error');
    return;
  }

  if (!user) {
    const next = encodeURIComponent(`/student/document-request.html?request=${requestId}`);
    setStatus('Connecte-toi pour envoyer tes documents. Redirection...', 'muted');
    window.setTimeout(() => {
      window.location.href = `/login.html?next=${next}`;
    }, 700);
    return;
  }

  try {
    const callable = getStudentRequestCallable();
    const response = await callable({ requestId });
    const request = response?.data?.request || null;
    const student = response?.data?.student || null;

    if (!request?.studentUid) {
      setStatus('Demande introuvable ou expirée.', 'error');
      return;
    }

    const userData = {
      uid: user.uid,
      ...(student || {})
    };

    if (isRequestCanceled(request)) {
      setStatus('Cette demande de documents a été annulée par SBI.', 'error');
    } else if (isRequestComplete(request)) {
      setStatus('Documents déjà transmis. Tu peux consulter le récapitulatif ci-dessous.', 'success');
    } else {
      setStatus('Dépose les documents demandés ci-dessous. Le lien reste utilisable tant que le dossier n’est pas transmis.', 'muted');
    }

    renderRequest(request, userData);
  } catch (error) {
    console.error('[SBI Student Documents] Chargement impossible :', error);
    const message = getCallableMessage(error, 'Chargement impossible pour le moment.');
    if (/correspond pas au compte/i.test(message)) {
      setStatus('Cette demande est liée à un autre compte SBI. Déconnecte-toi puis reconnecte-toi avec le compte élève concerné.', 'error');
    } else {
      setStatus(message, 'error');
    }
  }
});
