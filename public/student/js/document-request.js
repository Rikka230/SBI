import { auth, db, storage } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

const MAX_FILE_SIZE = 40 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_QUALITY = 0.84;
const status = document.getElementById('student-doc-request-status');
const content = document.getElementById('student-doc-request-content');

function setStatus(message, tone = 'muted') { if (status) { status.textContent = message; status.dataset.tone = tone; } }
function escapeHTML(value = '') { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function slug(value = 'document', max = 90) { return String(value || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,max) || 'document'; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function extension(file) { return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file?.type || '']) || String(file?.name || '').split('.').pop()?.toLowerCase() || 'file'; }
function isAllowed(file) { return Boolean(file && (file.type?.startsWith('image/') || file.type === 'application/pdf')); }
async function compressImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return { file, compressed:false, originalSize:file.size };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { file, compressed:false, originalSize:file.size };
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { alpha:false }); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
  if (!blob || blob.size >= file.size * .96) return { file, compressed:false, originalSize:file.size };
  return { file:new File([blob], `${slug(file.name.replace(/\.[^.]+$/,''))}.jpg`, {type:'image/jpeg'}), compressed:true, originalSize:file.size };
}
function getRequestId() { return new URL(window.location.href).searchParams.get('request') || ''; }
function buildFileName(item, user, file) { const studentName = slug(`${user.nom || ''} ${user.prenom || ''}`.trim() || user.email || user.uid || 'eleve', 80); return `${slug(item.title || item.type || 'document')}__${studentName}__${today()}.${extension(file).replace(/[^a-z0-9]/g,'') || 'file'}`; }

function renderRequest(request, userData) {
  const items = Array.isArray(request.items) ? request.items : [];
  const submittedCount = items.filter(item => item.status === 'submitted').length;
  content.innerHTML = `
    <div class="sbi-doc-request-summary">
      <div><span>Élève</span><strong>${escapeHTML(userData.prenom || '')} ${escapeHTML(userData.nom || '')}</strong></div>
      <div><span>Documents demandés</span><strong>${items.length}</strong></div>
      <div><span>Envoyés</span><strong>${submittedCount}/${items.length}</strong></div>
    </div>
    ${request.note ? `<p class="sbi-doc-request-note">${escapeHTML(request.note)}</p>` : ''}
    <div class="sbi-doc-request-list">
      ${items.map((item, index) => `
        <article class="sbi-doc-request-item ${item.status === 'submitted' ? 'is-submitted' : ''}" data-index="${index}">
          <div class="sbi-doc-request-item__head"><div><h3>${escapeHTML(item.title || 'Document demandé')}</h3><span>${escapeHTML(item.acceptLabel || 'PDF, JPG ou PNG')}</span></div><em>${item.status === 'submitted' ? 'Envoyé' : 'À fournir'}</em></div>
          <input type="file" accept=".pdf,image/*,application/pdf" ${item.status === 'submitted' ? 'disabled' : ''}>
        </article>`).join('')}
    </div>
    <div class="sbi-doc-request-actions"><span class="sbi-doc-request-note">Tous les documents obligatoires doivent être remplis avant l’envoi.</span><button id="student-doc-request-submit" type="button">Envoyer les documents</button></div>`;
  content.querySelector('#student-doc-request-submit')?.addEventListener('click', () => submitDocuments(request, userData));
}

async function submitDocuments(request, userData) {
  const requestId = getRequestId();
  const items = Array.isArray(request.items) ? request.items : [];
  const cards = Array.from(content.querySelectorAll('.sbi-doc-request-item'));
  const nextItems = items.map(item => ({...item}));
  const pendingUploads = [];
  cards.forEach((card) => { const index = Number(card.dataset.index); const item = nextItems[index]; if (!item || item.status === 'submitted') return; const file = card.querySelector('input[type="file"]')?.files?.[0] || null; if (file) pendingUploads.push({ index, item, file }); });
  const missing = nextItems.some((item, index) => item.required !== false && item.status !== 'submitted' && !pendingUploads.some(upload => upload.index === index));
  if (missing) { setStatus('Ajoute tous les documents obligatoires avant l’envoi.', 'error'); return; }
  for (const upload of pendingUploads) { if (upload.file.size > MAX_FILE_SIZE) { setStatus('Un fichier dépasse 40 Mo.', 'error'); return; } if (!isAllowed(upload.file)) { setStatus('Formats acceptés : PDF, JPG ou PNG.', 'error'); return; } }
  const button = content.querySelector('#student-doc-request-submit'); button.disabled = true; setStatus('Envoi des documents...', 'muted');
  try {
    for (const upload of pendingUploads) {
      const prepared = await compressImage(upload.file);
      const safeName = buildFileName(upload.item, userData, prepared.file);
      const documentRef = await addDoc(collection(db, 'studentDocuments'), { studentUid: request.studentUid, requestId, requestItemType: upload.item.type || '', title: upload.item.title || 'Document demandé', category: upload.item.category || 'administrative', fileName: safeName, originalFileName: upload.file.name || '', contentType: prepared.file.type || 'application/octet-stream', size: prepared.file.size, originalSize: prepared.originalSize || upload.file.size, compressed: prepared.compressed === true, status: 'uploading', visibility: 'admin_only', createdAt: serverTimestamp(), createdBy: request.studentUid, createdByEmail: userData.email || '', source: 'student_request', updatedAt: serverTimestamp() });
      const filePath = `student-documents/${request.studentUid}/${documentRef.id}/${safeName}`;
      await uploadBytes(ref(storage, filePath), prepared.file, { contentType: prepared.file.type || 'application/octet-stream', customMetadata: { uploadedBy: request.studentUid, studentUid: request.studentUid, documentId: documentRef.id, requestId } });
      await updateDoc(documentRef, { filePath, fileName: safeName, status: 'submitted', submittedAt: serverTimestamp(), uploadedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      nextItems[upload.index] = { ...nextItems[upload.index], status: 'submitted', documentId: documentRef.id, fileName: safeName, submittedAt: new Date().toISOString() };
    }
    const completed = nextItems.every(item => item.required === false || item.status === 'submitted');
    await updateDoc(doc(db, 'studentDocumentRequests', requestId), { items: nextItems, status: completed ? 'submitted' : 'partial', submittedAt: completed ? serverTimestamp() : request.submittedAt || null, updatedAt: serverTimestamp() });
    setStatus(completed ? 'Documents envoyés. L’équipe SBI va les vérifier.' : 'Documents enregistrés.', 'success');
    renderRequest({...request, items: nextItems, status: completed ? 'submitted' : 'partial'}, userData);
  } catch (error) { console.error('[SBI Student Documents] Envoi impossible :', error); setStatus('Envoi impossible pour le moment. Réessaie ou contacte SBI.', 'error'); }
  finally { button.disabled = false; }
}

onAuthStateChanged(auth, async (user) => {
  const requestId = getRequestId();
  if (!requestId) { setStatus('Lien de demande invalide.', 'error'); return; }
  if (!user) { const next = encodeURIComponent(`/student/document-request.html?request=${requestId}`); setStatus('Connecte-toi pour envoyer tes documents. Redirection...', 'muted'); window.setTimeout(() => { window.location.href = `/login.html?next=${next}`; }, 700); return; }
  try {
    const [requestSnap, userSnap] = await Promise.all([getDoc(doc(db, 'studentDocumentRequests', requestId)), getDoc(doc(db, 'users', user.uid))]);
    if (!requestSnap.exists()) { setStatus('Demande introuvable ou expirée.', 'error'); return; }
    const request = { id: requestSnap.id, ...(requestSnap.data() || {}) };
    if (request.studentUid !== user.uid) { setStatus('Cette demande ne correspond pas à ton compte.', 'error'); return; }
    const userData = { uid: user.uid, ...(userSnap.data() || {}) };
    setStatus('Dépose les documents demandés ci-dessous.', 'muted');
    renderRequest(request, userData);
  } catch (error) { console.error('[SBI Student Documents] Chargement impossible :', error); setStatus('Chargement impossible pour le moment.', 'error'); }
});
