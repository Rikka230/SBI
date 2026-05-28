import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';
import { escapeHtml } from '/js/live/live-shared.js?v=8.0P.167.206';

const functionsInstance = getFunctions(app, 'europe-west1');
const joinLiveConference = httpsCallable(functionsInstance, 'joinLiveConference');

const state = {
  liveId: '',
  callFrame: null,
  room: null,
  user: null,
  joined: false
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(message = '', tone = 'muted') {
  const node = $('sbi-live-room-status');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
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
  const params = new URLSearchParams(window.location.search);
  return params.get('liveId') || params.get('id') || '';
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
      border: '0',
      borderRadius: '18px',
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
  callFrame.on('error', (event) => {
    console.error('[SBI Live Room] Daily error:', event);
    setStatus('Erreur salle vidéo. Rechargez ou réessayez.', 'error');
  });

  state.callFrame = callFrame;
  await callFrame.join({
    url: room.roomUrl,
    token: room.token,
    userName: room.displayName || 'Participant SBI'
  });
}

async function prepareAndJoin() {
  state.liveId = getLiveIdFromUrl();
  if (!state.liveId) {
    setStatus('Live manquant dans l’URL.', 'error');
    return;
  }

  setStatus('Préparation de la salle sécurisée...', 'muted');

  const params = new URLSearchParams(window.location.search);
  const result = await joinLiveConference({
    liveId: state.liveId,
    markStarted: params.get('start') === '1'
  });
  const room = result?.data || {};

  if (!room.roomUrl || !room.token) throw new Error('Salle Daily incomplète.');
  state.room = room;
  setMeta(room);
  await mountDailyRoom(room);
}

let unsubscribeAuth = null;

export function mountLiveRoomPage() {
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    state.user = user;
    prepareAndJoin().catch((error) => {
      console.error('[SBI Live Room] Connexion impossible :', error);
      setStatus(error?.message || 'Connexion impossible.', 'error');
      const root = $('sbi-live-room-frame');
      if (root) {
        root.innerHTML = `<div class="sbi-live-room-error">${escapeHtml(error?.message || 'Connexion impossible.')}</div>`;
      }
    });
  });

  return () => {
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    destroyExistingFrame();
  };
}

window.addEventListener('beforeunload', destroyExistingFrame);

if (document.getElementById('sbi-live-room-frame') && !window.SBI_APP_SHELL_CURRENT_URL) {
  mountLiveRoomPage();
}
