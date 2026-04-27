import { db } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const EMPTY_MEDIA = {
  heroVideoWebmUrl: '',
  heroVideoMp4Url: '',
  heroLogoUrl: '',
  headerLogoUrl: '',
  brandLogoUrl: '',
  founderImageUrl: ''
};

function ensureFounderCleanStyles() {
  const href = '/css/sbi-founder-image-clean.css';
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function applyImage(selector, url) {
  if (!url) return;
  document.querySelectorAll(selector).forEach((img) => {
    if (img instanceof HTMLImageElement && img.src !== url) {
      img.src = url;
      img.dataset.loadedFromStorage = url.includes('firebasestorage.googleapis.com') ? 'true' : 'false';
    }
  });
}

function applyHeroVideo(settings) {
  const video = document.querySelector('.hero-video-bg');
  if (!(video instanceof HTMLVideoElement)) return;

  const webmUrl = settings.heroVideoWebmUrl || '';
  const mp4Url = settings.heroVideoMp4Url || '';

  if (!webmUrl && !mp4Url) return;

  const currentSources = Array.from(video.querySelectorAll('source')).map((source) => source.getAttribute('src')).join('|');
  const nextSources = `${webmUrl}|${mp4Url}`;

  if (currentSources === nextSources) return;

  video.pause();
  video.innerHTML = '';

  if (webmUrl) {
    const webm = document.createElement('source');
    webm.src = webmUrl;
    webm.type = 'video/webm';
    video.appendChild(webm);
  }

  if (mp4Url) {
    const mp4 = document.createElement('source');
    mp4.src = mp4Url;
    mp4.type = 'video/mp4';
    video.appendChild(mp4);
  }

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.load();
  video.play().catch(() => {});
}

function applySettings(settings) {
  ensureFounderCleanStyles();
  applyHeroVideo(settings);
  applyImage('.hero-large-logo', settings.heroLogoUrl);
  applyImage('.header-logo, .footer-logo-mark', settings.headerLogoUrl);
  applyImage('.header-brand, .footer-logo-wordmark', settings.brandLogoUrl);
  applyImage('.founder-img', settings.founderImageUrl);
  document.body.classList.add('is-site-index-media-ready');
}

async function initSiteIndexMedia() {
  ensureFounderCleanStyles();

  try {
    const snap = await getDoc(doc(db, 'settings', 'siteIndex'));
    const settings = snap.exists() ? { ...EMPTY_MEDIA, ...snap.data() } : EMPTY_MEDIA;
    applySettings(settings);
  } catch (error) {
    document.body.classList.add('is-site-index-media-ready');
    console.warn('[SBI Index] Médias dynamiques indisponibles. Aucun fallback lourd local chargé.', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiteIndexMedia);
} else {
  initSiteIndexMedia();
}
