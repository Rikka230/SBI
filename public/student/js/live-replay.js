import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const resolveLiveReplay = httpsCallable(functionsInstance, 'resolveLiveReplay');

function $(id) {
  return document.getElementById(id);
}

function getLiveId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('liveId') || params.get('id') || '';
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

async function loadReplay() {
  const liveId = getLiveId();
  if (!liveId) {
    setStatus('Replay introuvable : live manquant dans l’URL.');
    return;
  }

  setStatus('Recherche du replay Daily...');
  const result = await resolveLiveReplay({ liveId, mode: 'playback' });
  const data = result?.data || {};
  const url = data.playbackUrl || data.replayUrl || data.downloadLink || '';
  if (!url) throw new Error('Lien replay indisponible.');

  setTitle(data.title || 'Replay live');
  showFallback(url);

  const video = $('sbi-live-replay-video');
  const placeholder = $('sbi-live-replay-placeholder');
  if (!video) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  video.src = url;
  video.hidden = false;
  if (placeholder) placeholder.hidden = true;
  video.load();
  setStatus('Replay prêt. Lancez la lecture depuis le lecteur.');

  video.addEventListener('error', () => {
    setStatus('Lecture en ligne impossible avec ce lien Daily. Utilisez le bouton Ouvrir / télécharger.');
    showFallback(url);
  }, { once: true });
}

let mounted = false;
let unsubscribeAuth = null;

function mountReplayPage() {
  if (mounted) return;
  mounted = true;
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    loadReplay().catch((error) => {
      console.error('[SBI Live Replay] Chargement impossible :', error);
      setStatus(error?.message || 'Replay encore en préparation. Réessayez dans quelques minutes.');
    });
  });
}

window.addEventListener('beforeunload', () => {
  unsubscribeAuth?.();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountReplayPage, { once: true });
} else {
  mountReplayPage();
}
