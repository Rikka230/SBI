import { db } from '/js/firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const DEFAULTS = {
  heroVideoWebmUrl: '/assets/sbi_master.webm',
  heroVideoMp4Url: '/assets/sbi.mp4',
  heroLogoUrl: '/assets/Logo_SBI_Tome.png',
  headerLogoUrl: '/assets/Logo_SBI_Tome.png',
  brandLogoUrl: '/assets/sbi_brand.png',
  founderImageUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80'
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
    }
  });
}

function applyHeroVideo(settings) {
  const video = document.querySelector('.hero-video-bg');
  if (!(video instanceof HTMLVideoElement)) return;

  const webmUrl = settings.heroVideoWebmUrl || DEFAULTS.heroVideoWebmUrl;
  const mp4Url = settings.heroVideoMp4Url || DEFAULTS.heroVideoMp4Url;

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
  applyImage('.hero-large-logo', settings.heroLogoUrl || DEFAULTS.heroLogoUrl);
  applyImage('.header-logo, .footer-logo-mark', settings.headerLogoUrl || DEFAULTS.headerLogoUrl);
  applyImage('.header-brand, .footer-logo-wordmark', settings.brandLogoUrl || DEFAULTS.brandLogoUrl);
  applyImage('.founder-img', settings.founderImageUrl || DEFAULTS.founderImageUrl);
}

async function initSiteIndexMedia() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'siteIndex'));
    const settings = snap.exists() ? { ...DEFAULTS, ...snap.data() } : DEFAULTS;
    applySettings(settings);
  } catch (error) {
    ensureFounderCleanStyles();
    console.warn('[SBI Index] Médias dynamiques indisponibles, fallback local conservé.', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiteIndexMedia);
} else {
  initSiteIndexMedia();
}
