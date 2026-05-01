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

const MEDIA_CACHE_KEY = 'sbi:siteIndexMedia:v1';
const MEDIA_CACHE_TTL_MS = 5 * 60 * 1000;

function isLegacyLocalMediaUrl(value) {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  return (
    url === '/assets/sbi_master.webm' ||
    url === '/assets/sbi.mp4' ||
    url === '/assets/fondateur-photo.jpg' ||
    url.includes('images.unsplash.com/photo-1560250097')
  );
}

function sanitizeSettings(raw = {}) {
  const clean = { ...EMPTY_MEDIA, ...raw };
  Object.keys(clean).forEach((key) => {
    if (isLegacyLocalMediaUrl(clean[key])) clean[key] = '';
  });
  return clean;
}

function settingsSignature(settings) {
  return JSON.stringify({
    heroVideoWebmUrl: settings.heroVideoWebmUrl || '',
    heroVideoMp4Url: settings.heroVideoMp4Url || '',
    heroLogoUrl: settings.heroLogoUrl || '',
    headerLogoUrl: settings.headerLogoUrl || '',
    brandLogoUrl: settings.brandLogoUrl || '',
    founderImageUrl: settings.founderImageUrl || ''
  });
}

function readCachedSettings() {
  try {
    const raw = sessionStorage.getItem(MEDIA_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached?.savedAt || Date.now() - cached.savedAt > MEDIA_CACHE_TTL_MS) {
      sessionStorage.removeItem(MEDIA_CACHE_KEY);
      return null;
    }

    return sanitizeSettings(cached.settings || {});
  } catch (error) {
    sessionStorage.removeItem(MEDIA_CACHE_KEY);
    return null;
  }
}

function writeCachedSettings(settings) {
  try {
    sessionStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      settings: sanitizeSettings(settings)
    }));
  } catch (error) {
    // Cache opportuniste uniquement. Ne bloque jamais l'index public.
  }
}

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

  const cachedSettings = readCachedSettings();
  if (cachedSettings) {
    applySettings(cachedSettings);
  }

  try {
    const snap = await getDoc(doc(db, 'settings', 'siteIndex'));
    const settings = snap.exists() ? sanitizeSettings(snap.data()) : EMPTY_MEDIA;
    writeCachedSettings(settings);

    if (!cachedSettings || settingsSignature(cachedSettings) !== settingsSignature(settings)) {
      applySettings(settings);
    } else {
      document.body.classList.add('is-site-index-media-ready');
    }
  } catch (error) {
    document.body.classList.add('is-site-index-media-ready');
    if (!cachedSettings) {
      console.warn('[SBI Index] Médias dynamiques indisponibles. Aucun fallback lourd local chargé.', error);
    }
  }
}

window.SBI_INIT_SITE_INDEX_MEDIA = initSiteIndexMedia;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiteIndexMedia);
} else {
  initSiteIndexMedia();
}

export { initSiteIndexMedia };
