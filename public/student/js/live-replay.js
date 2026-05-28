import { auth, app } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const functionsInstance = getFunctions(app, 'europe-west1');
const resolveLiveReplay = httpsCallable(functionsInstance, 'resolveLiveReplay');

let mounted = false;
let unsubscribeAuth = null;
let bootTimer = null;
let watermarkTimer = null;

function $(id) {
  return document.getElementById(id);
}

function forceRevealPage() {
  document.documentElement?.classList?.remove('preload');
  document.body?.classList?.remove('preload');
  const nodes = [
    $('app-container'),
    $('main-content'),
    document.querySelector('.sbi-live-standalone-shell'),
    document.querySelector('.sbi-live-standalone-content')
  ].filter(Boolean);
  nodes.forEach((node) => {
    node.hidden = false;
    node.style.display = node.tagName === 'MAIN' ? 'block' : (node.style.display || 'block');
    node.style.visibility = 'visible';
    node.style.opacity = '1';
  });
}

function rememberLiveId(value = '') {
  const clean = String(value || '').trim();
  if (clean) {
    sessionStorage.setItem('sbi:lastReplayLiveId', clean);
    localStorage.setItem('sbi:lastReplayLiveId', clean);
    if (document.body) document.body.dataset.liveId = clean;
  }
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
    const pathMatch = String(url.pathname || '').match(/\/student\/live-replay\/([^/?#]+)/);
    if (pathMatch?.[1]) return rememberLiveId(decodeURIComponent(pathMatch[1]));
    const value = url.searchParams.get('liveId') || url.searchParams.get('id');
    if (value) return rememberLiveId(value);
    const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    const hashValue = hashParams.get('liveId') || hashParams.get('id');
    if (hashValue) return rememberLiveId(hashValue);
  }

  return sessionStorage.getItem('sbi:lastReplayLiveId') || localStorage.getItem('sbi:lastReplayLiveId') || '';
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

function showFallback() {
  // Intentionally no public download link for replay protection.
}

function getPlayerWrap() {
  return document.querySelector('.sbi-live-replay-player-wrap');
}

function hidePlaceholder() {
  const placeholder = $('sbi-live-replay-placeholder');
  const wrap = getPlayerWrap();
  if (wrap) { wrap.classList.add('is-ready'); wrap.classList.add('has-stream'); }
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
  if (wrap) { wrap.classList.remove('is-ready'); wrap.classList.remove('has-stream'); }
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


function configureReplayVideo(video) {
  if (!video) return;
  try { video.controlsList?.add('nodownload'); } catch (_) {}
  try { video.controlsList?.add('nofullscreen'); } catch (_) {}
  try { video.controlsList?.add('noremoteplayback'); } catch (_) {}
  video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('disablePictureInPicture', '');
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.addEventListener('contextmenu', (event) => event.preventDefault());
}

function setWatermarkFullscreenMode(active = false) {
  const wrap = getPlayerWrap();
  if (!wrap) return;
  wrap.classList.toggle('is-fullscreen', Boolean(active));
}

async function requestSecureFullscreen() {
  const wrap = getPlayerWrap();
  if (!wrap) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await wrap.requestFullscreen({ navigationUI: 'hide' });
  } catch (error) {
    console.warn('[SBI Live Replay] Fullscreen unavailable:', error);
  }
}

function bindFullscreenButton() {
  const button = $('sbi-live-replay-fullscreen');
  if (!button) return;
  button.hidden = false;
  button.addEventListener('click', requestSecureFullscreen);
}

function startReplayWatermarkMotion() {
  const node = $('sbi-live-replay-watermark');
  if (!node) return;
  if (watermarkTimer) clearInterval(watermarkTimer);
  const positions = [
    { left: '4%', top: '7%', rotate: '-6deg' },
    { left: '58%', top: '13%', rotate: '5deg' },
    { left: '14%', top: '72%', rotate: '4deg' },
    { left: '52%', top: '64%', rotate: '-4deg' },
    { left: '28%', top: '38%', rotate: '-2deg' }
  ];
  let index = 0;
  const apply = () => {
    const pos = positions[index % positions.length];
    node.style.left = pos.left;
    node.style.top = pos.top;
    node.style.transform = `rotate(${pos.rotate})`;
    index += 1;
  };
  apply();
  watermarkTimer = setInterval(apply, 6500);
}

document.addEventListener('fullscreenchange', () => {
  const wrap = getPlayerWrap();
  setWatermarkFullscreenMode(document.fullscreenElement === wrap);
});

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
    setStatus('Lecture en ligne impossible dans ce navigateur. Réessayez plus tard ou contactez l’équipe pédagogique.');
    showFallback();
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
  showFallback();

  const video = $('sbi-live-replay-video');
  if (!video) {
    setStatus('Lecteur vidéo indisponible. Rechargez la page.');
    return;
  }

  configureReplayVideo(video);
  bindFullscreenButton();
  startReplayWatermarkMotion();
  video.hidden = false;
  video.style.display = 'block';
  hidePlaceholder();
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
    if (watermarkTimer) clearInterval(watermarkTimer);
    watermarkTimer = null;
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

window.addEventListener('error', (event) => {
  forceRevealPage();
  console.error('[SBI Live Replay] Page error:', event?.error || event?.message);
});
window.addEventListener('unhandledrejection', (event) => {
  forceRevealPage();
  console.error('[SBI Live Replay] Promise rejection:', event?.reason);
});
