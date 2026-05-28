import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const resolveLiveReplay = httpsCallable(functionsInstance, 'resolveLiveReplay');

let mounted = false;
let unsubscribeAuth = null;
let bootTimer = null;

function $(id) {
  return document.getElementById(id);
}

function forceRevealPage() {
  document.documentElement?.classList?.remove('preload');
  document.body?.classList?.remove('preload');
  const app = $('app-container');
  const main = $('main-content');
  if (app) {
    app.hidden = false;
    app.style.visibility = 'visible';
    app.style.opacity = '1';
  }
  if (main) {
    main.hidden = false;
    main.style.display = 'block';
    main.style.visibility = 'visible';
    main.style.opacity = '1';
  }
}

function rememberLiveId(value = '') {
  const clean = String(value || '').trim();
  if (clean) sessionStorage.setItem('sbi:lastReplayLiveId', clean);
  return clean;
}

function getLiveId() {
  const candidates = [];
  try { candidates.push(new URL(window.location.href)); } catch (_) {}
  try {
    if (window.SBI_APP_SHELL_CURRENT_URL) candidates.push(new URL(window.SBI_APP_SHELL_CURRENT_URL, window.location.origin));
  } catch (_) {}
  try {
    const dataLiveId = document.body?.dataset?.liveId || $('sbi-live-replay-video')?.dataset?.liveId || '';
    if (dataLiveId) return rememberLiveId(dataLiveId);
  } catch (_) {}

  for (const url of candidates) {
    const value = url.searchParams.get('liveId') || url.searchParams.get('id');
    if (value) return rememberLiveId(value);
    const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    const hashValue = hashParams.get('liveId') || hashParams.get('id');
    if (hashValue) return rememberLiveId(hashValue);
  }

  return sessionStorage.getItem('sbi:lastReplayLiveId') || '';
}

function setStatus(message = '') {
  const node = $('sbi-live-replay-status');
  if (node) node.textContent = message;
}

function setTitle(title = '') {
  const node = $('sbi-replay-title');
  if (node && title) node.textContent = title;
}

function normalizeDisplayName(user) {
  const raw = user?.displayName || user?.email || 'Élève SBI';
  return String(raw).replace(/@.+$/, '').trim() || 'Élève SBI';
}

function setReplayWatermark(user) {
  const node = $('sbi-live-replay-watermark');
  if (!node) return;
  const name = normalizeDisplayName(user);
  const date = new Date().toLocaleDateString('fr-FR');
  node.textContent = `${name} · ${date}`;
}

function showFallback(url = '') {
  const link = $('sbi-live-replay-download');
  if (!link || !url) return;
  link.href = url;
  link.hidden = false;
}

function getPlayerWrap() {
  return document.querySelector('.sbi-live-replay-player-wrap');
}

function hidePlaceholder() {
  const placeholder = $('sbi-live-replay-placeholder');
  const wrap = getPlayerWrap();
  if (wrap) wrap.classList.add('is-ready');
  if (placeholder) {
    placeholder.hidden = true;
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.display = 'none';
    placeholder.style.opacity = '0';
    placeholder.style.pointerEvents = 'none';
  }
}

function showPlaceholder(message = '') {
  const placeholder = $('sbi-live-replay-placeholder');
  const wrap = getPlayerWrap();
  if (wrap) wrap.classList.remove('is-ready');
  if (placeholder) {
    placeholder.hidden = false;
    placeholder.removeAttribute('aria-hidden');
    placeholder.style.display = '';
    placeholder.style.opacity = '';
    placeholder.style.pointerEvents = '';
    placeholder.textContent = message || 'Préparation du replay...';
  }
}

function renderBlockingMessage(message = '') {
  const video = $('sbi-live-replay-video');
  if (video) {
    video.hidden = true;
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
  }
  showPlaceholder(message || 'Replay encore en préparation.');
  setStatus(message || 'Replay encore en préparation. Réessayez dans quelques minutes.');
}

function bindVideoEvents(video, fallbackUrl = '') {
  const ready = () => {
    hidePlaceholder();
    setStatus('Replay prêt. Lancez la lecture depuis le lecteur.');
  };
  ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'timeupdate'].forEach((eventName) => {
    video.addEventListener(eventName, ready, { once: eventName !== 'timeupdate' });
  });
  video.addEventListener('waiting', () => {
    hidePlaceholder();
    setStatus('Chargement vidéo en cours...');
  });
  video.addEventListener('error', () => {
    hidePlaceholder();
    setStatus('Lecture en ligne impossible. Utilisez le bouton Ouvrir / télécharger.');
    showFallback(fallbackUrl || video.currentSrc || video.src || '');
  }, { once: true });
}

async function loadReplay() {
  forceRevealPage();
  const liveId = getLiveId();
  if (!liveId) {
    renderBlockingMessage('Replay introuvable : live manquant dans l’URL.');
    return;
  }

  setStatus('Préparation du lecteur replay...');
  showPlaceholder('Préparation du replay...');
  const result = await resolveLiveReplay({ liveId, mode: 'stream' });
  const data = result?.data || {};
  const streamUrl = data.streamUrl || data.playbackUrl || data.replayUrl || '';
  const fallbackUrl = data.downloadLink || data.replayUrl || streamUrl || '';
  if (!streamUrl) throw new Error('Lien replay indisponible.');

  setTitle(data.title || 'Replay live');
  showFallback(fallbackUrl || streamUrl);

  const video = $('sbi-live-replay-video');
  if (!video) {
    window.open(streamUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  video.hidden = false;
  video.style.display = 'block';
  bindVideoEvents(video, fallbackUrl || streamUrl);
  video.src = streamUrl;
  try { video.load(); } catch (_) {}

  setTimeout(() => {
    if (!video.hidden && (video.readyState > 0 || video.duration || video.currentSrc)) hidePlaceholder();
  }, 300);
  setTimeout(() => {
    if (!video.hidden && (video.readyState > 0 || video.duration || video.currentSrc)) hidePlaceholder();
  }, 1200);
}

export function mountStudentLiveReplayPage() {
  forceRevealPage();
  if (mounted) return null;
  mounted = true;
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    forceRevealPage();
    if (!user) {
      window.location.replace('/login.html');
      return;
    }
    setReplayWatermark(user);
    loadReplay().catch((error) => {
      console.error('[SBI Live Replay] Chargement impossible :', error);
      renderBlockingMessage(error?.message || 'Replay encore en préparation. Réessayez dans quelques minutes.');
    });
  });

  return () => {
    mounted = false;
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = null;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
}

function bootReplayPage() {
  forceRevealPage();
  if (document.getElementById('sbi-live-replay-video') && !window.__SBI_APP_SHELL_MOUNTING_LIVE_REPLAY) {
    mountStudentLiveReplayPage();
  }
  bootTimer = setTimeout(forceRevealPage, 700);
}

window.addEventListener('beforeunload', () => {
  unsubscribeAuth?.();
});

window.addEventListener('pageshow', () => {
  forceRevealPage();
  if (!mounted && document.getElementById('sbi-live-replay-video')) bootReplayPage();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootReplayPage, { once: true });
} else {
  bootReplayPage();
}
