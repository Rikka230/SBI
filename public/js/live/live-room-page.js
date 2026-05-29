import { auth, app, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';
import { escapeHtml } from '/js/live/live-shared.js?v=8.0P.167.240';

const functionsInstance = getFunctions(app, 'europe-west1');
const storage = getStorage(app);
const joinLiveConference = httpsCallable(functionsInstance, 'joinLiveConference');
const endLiveConference = httpsCallable(functionsInstance, 'endLiveConference');
const setLiveRecordingState = httpsCallable(functionsInstance, 'setLiveRecordingState');

const state = {
  liveId: '',
  callFrame: null,
  room: null,
  user: null,
  joined: false,
  filesUnsubscribe: null,
  recording: false,
  recordingInstanceId: '',
  docsOpen: false
};

function $(id) {
  return document.getElementById(id);
}

function forceRevealLiveRoomPage() {
  document.documentElement?.classList?.remove('preload');
  document.body?.classList?.remove('preload');
  const shell = document.querySelector('.sbi-live-room-shell');
  const frame = document.getElementById('sbi-live-room-frame');
  if (shell) {
    shell.hidden = false;
    shell.style.visibility = 'visible';
    shell.style.opacity = '1';
  }
  if (frame) {
    frame.hidden = false;
    frame.style.visibility = 'visible';
    frame.style.opacity = '1';
  }
}

function setStatus(message = '', tone = 'muted') {
  const node = $('sbi-live-room-status');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function setFilesStatus(message = '') {
  const node = $('sbi-live-files-status');
  if (node) node.textContent = message;
}

function setDocsOpen(isOpen = false) {
  state.docsOpen = Boolean(isOpen);
  const docs = $('sbi-live-room-docs');
  const toggle = $('sbi-live-docs-toggle');
  docs?.classList.toggle('is-open', state.docsOpen);
  if (toggle) toggle.setAttribute('aria-expanded', state.docsOpen ? 'true' : 'false');
}

function setupDocsToggle() {
  const toggle = $('sbi-live-docs-toggle');
  if (!toggle || toggle.dataset.bound === 'true') return;
  toggle.dataset.bound = 'true';
  toggle.addEventListener('click', () => setDocsOpen(!state.docsOpen));
  setDocsOpen(false);
}

function setMeta(room = {}) {
  const title = $('sbi-live-room-title');
  const subtitle = $('sbi-live-room-subtitle');
  const badge = $('sbi-live-room-badge');
  const watermark = $('sbi-live-watermark');

  if (title) title.textContent = room.title || 'Salle de conférence SBI';
  if (subtitle) subtitle.textContent = room.promotionName || 'Connexion sécurisée';
  if (badge) badge.textContent = room.canModerate ? 'Hôte' : 'Participant';
  if (watermark) {
    watermark.textContent = `${room.displayName || 'Participant SBI'} · ${new Date().toLocaleDateString('fr-FR')}`;
  }
}

function getLiveIdFromUrl() {
  const candidates = [];
  try { candidates.push(new URL(window.location.href)); } catch (_) {}
  try {
    if (window.SBI_APP_SHELL_CURRENT_URL) candidates.push(new URL(window.SBI_APP_SHELL_CURRENT_URL, window.location.origin));
  } catch (_) {}

  for (const url of candidates) {
    const pathMatch = String(url.pathname || '').match(/\/live-room\/([^/?#]+)/);
    if (pathMatch?.[1]) {
      const decoded = decodeURIComponent(pathMatch[1]);
      sessionStorage.setItem('sbi:lastLiveRoomId', decoded);
      localStorage.setItem('sbi:lastLiveRoomId', decoded);
      return decoded;
    }
    const value = url.searchParams.get('liveId') || url.searchParams.get('id');
    if (value) {
      sessionStorage.setItem('sbi:lastLiveRoomId', value);
      localStorage.setItem('sbi:lastLiveRoomId', value);
      return value;
    }
    const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    const hashValue = hashParams.get('liveId') || hashParams.get('id');
    if (hashValue) {
      sessionStorage.setItem('sbi:lastLiveRoomId', hashValue);
      localStorage.setItem('sbi:lastLiveRoomId', hashValue);
      return hashValue;
    }
  }

  const dataLiveId = document.body?.dataset?.liveId || '';
  if (dataLiveId) return dataLiveId;
  return sessionStorage.getItem('sbi:lastLiveRoomId') || localStorage.getItem('sbi:lastLiveRoomId') || '';
}

function extractErrorCode(error) {
  return String(
    error?.errorMsg ||
    error?.msg ||
    error?.error ||
    error?.message ||
    error?.details?.error ||
    ''
  ).toLowerCase();
}

function describeLiveError(error) {
  const code = extractErrorCode(error);
  if (code.includes('account-missing-payment-method')) {
    return {
      message: "Le compte Daily n'a pas encore de moyen de paiement utilisable sur l'espace lie a cette cle API. Verifiez Billing dans Daily, puis rechargez la page.",
      detail: 'Daily renvoie encore « account-missing-payment-method ».',
      tone: 'error'
    };
  }
  if (code.includes('room-expired') || code.includes('meeting-closed')) {
    return {
      message: "Cette salle n'est plus disponible. Reouvrez le live depuis l'interface professeur ou admin.",
      detail: '',
      tone: 'error'
    };
  }
  if (code.includes('daily js indisponible') || code.includes('blocked_by_client') || code.includes('blocked_by_adblocker')) {
    return {
      message: 'Le SDK Daily est bloque par le navigateur ou un bloqueur de contenu. Autorisez daily.co puis rechargez la page.',
      detail: '',
      tone: 'error'
    };
  }
  return {
    message: error?.message || 'Connexion impossible.',
    detail: '',
    tone: 'error'
  };
}

function safeFileName(name = 'document') {
  const cleaned = String(name || 'document')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || `document-${Date.now()}`;
}

function formatFileSize(size = 0) {
  const value = Number(size) || 0;
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

async function waitForDailyIframe() {
  if (window.DailyIframe) return window.DailyIframe;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-daily-js]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@daily-co/daily-js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.dailyJs = 'true';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
  if (!window.DailyIframe) throw new Error('Daily JS indisponible.');
  return window.DailyIframe;
}

function destroyExistingFrame() {
  if (!state.callFrame) return;
  try {
    state.callFrame.destroy();
  } catch (_) {}
  state.callFrame = null;
  state.joined = false;
}

function renderRoomError(error) {
  const root = $('sbi-live-room-frame');
  const info = describeLiveError(error);
  setStatus(info.message, info.tone);
  if (!root) return;
  root.innerHTML = `
    <div class="sbi-live-room-error-wrap">
      <div class="sbi-live-room-error-title">${escapeHtml(info.message)}</div>
      ${info.detail ? `<div class="sbi-live-room-error-detail">${escapeHtml(info.detail)}</div>` : ''}
      <div class="sbi-live-room-error-actions">
        <button type="button" class="sbi-live-room-retry" id="sbi-live-room-retry">Réessayer</button>
      </div>
    </div>
  `;
  const retry = $('sbi-live-room-retry');
  retry?.addEventListener('click', () => {
    prepareAndJoin().catch((innerError) => {
      console.error('[SBI Live Room] Retry failed:', innerError);
      renderRoomError(innerError);
    });
  });
}

function renderFiles(files = []) {
  const list = $('sbi-live-files-list');
  if (!list) return;
  if (!files.length) {
    list.innerHTML = '<div class="sbi-live-room-file-empty">Aucun document partagé pour le moment.</div>';
    setFilesStatus('Aucun fichier partagé');
    return;
  }
  setFilesStatus(`${files.length} fichier(s)`);
  list.innerHTML = files.map((file) => `
    <a class="sbi-live-room-file" href="${escapeHtml(file.url || '#')}" target="_blank" rel="noopener">
      <strong>${escapeHtml(file.fileName || 'Document')}</strong>
      <span>${escapeHtml(file.uploadedByName || 'SBI')} · ${formatFileSize(file.size)}</span>
    </a>
  `).join('');
}

function startFilesListener() {
  if (!state.liveId || state.filesUnsubscribe) return;
  const filesRef = collection(db, 'liveSessions', state.liveId, 'files');
  state.filesUnsubscribe = onSnapshot(filesRef, (snap) => {
    const files = [];
    snap.forEach((docSnap) => files.push({ id: docSnap.id, ...docSnap.data() }));
    files.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
    renderFiles(files);
  }, (error) => {
    console.warn('[SBI Live Room] Lecture fichiers live impossible :', error);
    setFilesStatus('Documents indisponibles');
  });
}

function stopFilesListener() {
  state.filesUnsubscribe?.();
  state.filesUnsubscribe = null;
}

async function shareSelectedFiles() {
  if (!state.room?.canModerate) return;
  const input = $('sbi-live-file-input');
  const button = $('sbi-live-file-upload');
  const files = Array.from(input?.files || []);
  if (!files.length) {
    setFilesStatus('Choisissez un fichier');
    return;
  }
  button.disabled = true;
  try {
    for (const file of files) {
      const fileName = safeFileName(file.name);
      const storagePath = `liveSessions/${state.liveId}/chatFiles/${Date.now()}-${fileName}`;
      const ref = storageRef(storage, storagePath);
      await uploadBytes(ref, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          uploadedBy: state.user.uid,
          liveId: state.liveId
        }
      });
      const url = await getDownloadURL(ref);
      await addDoc(collection(db, 'liveSessions', state.liveId, 'files'), {
        fileName: file.name || fileName,
        storagePath,
        url,
        mimeType: file.type || '',
        size: file.size || 0,
        uploadedBy: state.user.uid,
        uploadedByName: state.room.displayName || state.user.email || 'SBI',
        createdAt: serverTimestamp()
      });
    }
    input.value = '';
    setFilesStatus('Document partagé');
  } catch (error) {
    console.error('[SBI Live Room] Partage fichier impossible :', error);
    setFilesStatus(error?.message || 'Partage impossible');
  } finally {
    button.disabled = false;
  }
}

function updateRecordingButtons() {
  const start = $('sbi-live-record-start');
  const stop = $('sbi-live-record-stop');
  if (!start || !stop) return;
  start.hidden = state.recording;
  stop.hidden = !state.recording;
}

async function markRecordingState(recordingStatus = '', extra = {}) {
  if (!state.liveId || !state.room?.canModerate) return;
  try {
    await setLiveRecordingState({
      liveId: state.liveId,
      recordingStatus,
      recordingInstanceId: state.recordingInstanceId,
      ...extra
    });
  } catch (error) {
    console.warn('[SBI Live Room] Statut recording non persiste :', error);
  }
}

async function startRecording() {
  if (!state.callFrame || !state.room?.canModerate) return;
  const button = $('sbi-live-record-start');
  button.disabled = true;
  try {
    state.recordingInstanceId = crypto.randomUUID?.() || `${Date.now()}`;
    await state.callFrame.startRecording({
      instanceId: state.recordingInstanceId,
      type: 'cloud',
      layout: { preset: 'default' }
    });
    state.recording = true;
    updateRecordingButtons();
    setStatus('Enregistrement du replay en cours.', 'success');
    await markRecordingState('recording');
  } catch (error) {
    console.error('[SBI Live Room] Recording start impossible :', error);
    setStatus(error?.message || 'Enregistrement impossible.', 'error');
    await markRecordingState('error', { recordingError: error?.message || 'recording_start_failed' });
  } finally {
    button.disabled = false;
  }
}

async function stopRecording() {
  if (!state.callFrame || !state.room?.canModerate) return;
  const button = $('sbi-live-record-stop');
  button.disabled = true;
  try {
    await state.callFrame.stopRecording({ instanceId: state.recordingInstanceId || undefined });
    state.recording = false;
    updateRecordingButtons();
    setStatus('Enregistrement arrêté. Replay en traitement Daily.', 'success');
    await markRecordingState('processing');
  } catch (error) {
    console.error('[SBI Live Room] Recording stop impossible :', error);
    setStatus(error?.message || 'Arrêt enregistrement impossible.', 'error');
    await markRecordingState('error', { recordingError: error?.message || 'recording_stop_failed' });
  } finally {
    button.disabled = false;
  }
}

async function endSession() {
  if (!state.room?.canModerate || !state.liveId) return;
  const button = $('sbi-live-end-session');
  const confirmed = window.confirm('Terminer cette session live pour tous les participants ?');
  if (!confirmed) return;
  button.disabled = true;
  try {
    if (state.recording && state.callFrame) {
      try { await stopRecording(); } catch (_) {}
    }
    await endLiveConference({ liveId: state.liveId });
    stopFilesListener();
    renderFiles([]);
    setDocsOpen(false);
    try { await state.callFrame?.leave(); } catch (_) {}
    destroyExistingFrame();
    setStatus('Session terminee.', 'success');
    const frameRoot = $('sbi-live-room-frame');
    if (frameRoot) {
      frameRoot.innerHTML = '<div class="sbi-live-room-loading">Session terminée. Vous pouvez fermer cette page.</div>';
    }
  } catch (error) {
    console.error('[SBI Live Room] Fin de session impossible :', error);
    setStatus(error?.message || 'Fin de session impossible.', 'error');
    button.disabled = false;
  }
}

function setupHostControls(room = {}) {
  const actions = $('sbi-live-room-actions');
  const uploadZone = $('sbi-live-file-upload-zone');
  if (actions) actions.hidden = !room.canModerate;
  if (uploadZone) uploadZone.hidden = !room.canModerate;

  $('sbi-live-record-start')?.addEventListener('click', startRecording);
  $('sbi-live-record-stop')?.addEventListener('click', stopRecording);
  $('sbi-live-end-session')?.addEventListener('click', endSession);
  $('sbi-live-file-upload')?.addEventListener('click', shareSelectedFiles);
  updateRecordingButtons();
}

async function mountDailyRoom(room = {}) {
  const frameRoot = $('sbi-live-room-frame');
  if (!frameRoot) throw new Error('Conteneur salle introuvable.');
  destroyExistingFrame();
  frameRoot.innerHTML = '';

  const DailyIframe = await waitForDailyIframe();
  const callFrame = DailyIframe.createFrame(frameRoot, {
    showLeaveButton: true,
    iframeStyle: {
      width: '100%',
      height: '100%',
      minHeight: '100%',
      border: '0',
      borderRadius: '0',
      background: '#050914'
    }
  });

  callFrame.on('joining-meeting', () => setStatus('Entrée dans la salle...', 'muted'));
  callFrame.on('joined-meeting', () => {
    state.joined = true;
    setStatus('Connecté à la salle.', 'success');
  });
  callFrame.on('left-meeting', () => {
    state.joined = false;
    setStatus('Vous avez quitté la salle.', 'muted');
  });
  callFrame.on('recording-started', async () => {
    state.recording = true;
    updateRecordingButtons();
    await markRecordingState('recording');
  });
  callFrame.on('recording-stopped', async () => {
    state.recording = false;
    updateRecordingButtons();
    await markRecordingState('processing');
  });
  callFrame.on('recording-error', async (event) => {
    await markRecordingState('error', { recordingError: JSON.stringify(event || {}).slice(0, 500) });
  });
  callFrame.on('error', (event) => {
    console.error('[SBI Live Room] Daily error:', event);
    renderRoomError(event);
  });

  state.callFrame = callFrame;
  try {
    await callFrame.join({
      url: room.roomUrl,
      token: room.token,
      userName: room.displayName || 'Participant SBI'
    });
  } catch (error) {
    renderRoomError(error);
    throw error;
  }
}

async function prepareAndJoin() {
  state.liveId = getLiveIdFromUrl();
  if (!state.liveId) {
    renderRoomError(new Error('Live manquant dans l’URL.'));
    return;
  }

  setStatus('Préparation de la salle sécurisée...', 'muted');
  stopFilesListener();
  startFilesListener();

  const params = new URLSearchParams(window.location.search);
  const result = await joinLiveConference({
    liveId: state.liveId,
    markStarted: params.get('start') === '1'
  });
  const room = result?.data || {};

  if (!room.roomUrl || !room.token) throw new Error('Salle Daily incomplète.');
  state.room = room;
  setMeta(room);
  setupDocsToggle();
  setupHostControls(room);
  await mountDailyRoom(room);
}

let mounted = false;
let unsubscribeAuth = null;

export function mountLiveRoomPage() {
  forceRevealLiveRoomPage();
  if (mounted) return null;
  mounted = true;
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    state.user = user;
    prepareAndJoin().catch((error) => {
      console.error('[SBI Live Room] Connexion impossible :', error);
      renderRoomError(error);
    });
  });

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    stopFilesListener();
    destroyExistingFrame();
  };
}

function bootLiveRoomPage() {
  forceRevealLiveRoomPage();
  if (!document.getElementById('sbi-live-room-frame')) return;
  mountLiveRoomPage();
}

window.addEventListener('pageshow', () => {
  forceRevealLiveRoomPage();
  const frame = document.getElementById('sbi-live-room-frame');
  if (!frame || state.joined || mounted) return;
  bootLiveRoomPage();
});

window.addEventListener('beforeunload', () => {
  stopFilesListener();
  destroyExistingFrame();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootLiveRoomPage, { once: true });
} else {
  bootLiveRoomPage();
}

window.addEventListener('error', (event) => {
  forceRevealLiveRoomPage();
  console.error('[SBI Live Room] Page error:', event?.error || event?.message);
});
window.addEventListener('unhandledrejection', (event) => {
  forceRevealLiveRoomPage();
  console.error('[SBI Live Room] Promise rejection:', event?.reason);
});
