import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const resolveLiveReplay = httpsCallable(functionsInstance, 'resolveLiveReplay');

let mounted = false;
let unsubscribeAuth = null;

function $(id) {
  return document.getElementById(id);
}

function getLiveId() {
  const candidates = [];
  try { candidates.push(new URL(window.location.href)); } catch (_) {}
  try {
    if (window.SBI_APP_SHELL_CURRENT_URL) candidates.push(new URL(window.SBI_APP_SHELL_CURRENT_URL, window.location.origin));
  } catch (_) {}

  for (const url of candidates) {
    const value = url.searchParams.get('liveId') || url.searchParams.get('id');
    if (value) {
      sessionStorage.setItem('sbi:lastReplayLiveId', value);
      return value;
    }
    const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    const hashValue = hashParams.get('liveId') || hashParams.get('id');
    if (hashValue) {
      sessionStorage.setItem('sbi:lastReplayLiveId', hashValue);
      return hashValue;
    }
  }

  const stored = sessionStorage.getItem('sbi:lastReplayLiveId') || '';
  return stored;
}

function setStatus(message = '') {
  const node = $('sbi-live-replay-status');
  if (node) node.textContent = message;
}

function setTitle(title = '') {
  const node = $('sbi-replay-title');
  if (node && title) node.textContent = title;
}

function showFallback(url = '') {
  const link = $('sbi-live-replay-download');
  if (!link || !url) return;
  link.href = url;
  link.hidden = false;
}

function renderBlockingMessage(message = '') {
  const placeholder = $('sbi-live-replay-placeholder');
  const video = $('sbi-live-replay-video');
  if (video) video.hidden = true;
  if (placeholder) {
    placeholder.hidden = false;
    placeholder.textContent = message || 'Replay encore en préparation.';
  }
  setStatus(message || 'Replay encore en préparation. Réessayez dans quelques minutes.');
}

async function loadReplay() {
  const liveId = getLiveId();
  if (!liveId) {
    renderBlockingMessage('Replay introuvable : live manquant dans l’URL.');
    return;
  }

  setStatus('Préparation du lecteur replay...');
  const result = await resolveLiveReplay({ liveId, mode: 'stream' });
  const data = result?.data || {};
  const streamUrl = data.streamUrl || data.playbackUrl || data.replayUrl || '';
  const fallbackUrl = data.downloadLink || data.replayUrl || streamUrl || '';
  if (!streamUrl) throw new Error('Lien replay indisponible.');

  setTitle(data.title || 'Replay live');
  showFallback(fallbackUrl || streamUrl);

  const video = $('sbi-live-replay-video');
  const placeholder = $('sbi-live-replay-placeholder');
  if (!video) {
    window.open(streamUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  video.src = streamUrl;
  video.hidden = false;
  if (placeholder) placeholder.hidden = true;
  video.load();
  setStatus('Replay prêt. Lancez la lecture depuis le lecteur.');

  video.addEventListener('error', () => {
    setStatus('Lecture en ligne impossible. Utilisez le bouton Ouvrir / télécharger.');
    showFallback(fallbackUrl || streamUrl);
  }, { once: true });
}

export function mountStudentLiveReplayPage() {
  if (mounted) return null;
  mounted = true;
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    loadReplay().catch((error) => {
      console.error('[SBI Live Replay] Chargement impossible :', error);
      renderBlockingMessage(error?.message || 'Replay encore en préparation. Réessayez dans quelques minutes.');
    });
  });

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

function bootReplayPage() {
  if (document.getElementById('sbi-live-replay-video') && !window.__SBI_APP_SHELL_MOUNTING_LIVE_REPLAY) {
    mountStudentLiveReplayPage();
  }
}

window.addEventListener('beforeunload', () => {
  unsubscribeAuth?.();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootReplayPage, { once: true });
} else {
  bootReplayPage();
}
