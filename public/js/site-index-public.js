const SITE_INDEX_MEDIA_VERSION = '8.0P.13';

const EMPTY_MEDIA = {
  heroVideoWebmUrl: '',
  heroVideoMp4Url: '',
  heroLogoUrl: '',
  headerLogoUrl: '',
  brandLogoUrl: '',
  founderImageUrl: ''
};

const MEDIA_CACHE_KEY = 'sbi:siteIndexMedia:v2';
const MEDIA_CACHE_TTL_MS = 5 * 60 * 1000;
const QUALIOPI_CSS_HREF = `/css/sbi-qualiopi.css?v=${SITE_INDEX_MEDIA_VERSION}`;
const FOUNDER_CSS_PATH = '/css/sbi-founder-image-clean.css';
const FOUNDER_CSS_HREF = `${FOUNDER_CSS_PATH}?v=${SITE_INDEX_MEDIA_VERSION}`;
const QUALIOPI_SECTION_ID = 'qualiopi';
const LOCAL_BRAND_MEDIA = {
  logo: '/assets/Logo_SBI_Tome.webp',
  brand: '/assets/sbi_brand.webp'
};
const LOCAL_FOUNDER_IMAGE = '/assets/fondateur-photo.jpg';

const mediaState = window.__SBI_SITE_INDEX_MEDIA_STATE__ || {
  initPromise: null,
  lastSettings: null,
  lastError: null,
  lastFetchAt: 0,
  applyCount: 0
};
window.__SBI_SITE_INDEX_MEDIA_STATE__ = mediaState;
window.__SBI_SITE_INDEX_MEDIA_LOADING__ = true;

function normalizeUrlValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isFirebaseStorageUrl(value) {
  const url = normalizeUrlValue(value);
  return /firebasestorage\.googleapis\.com|firebasestorage\.app|storage\.googleapis\.com/i.test(url);
}

function isLegacyLocalMediaUrl(value) {
  const url = normalizeUrlValue(value);
  if (!url) return false;

  return (
    url === '/assets/sbi_master.webm' ||
    url === 'assets/sbi_master.webm' ||
    url === '/assets/sbi.mp4' ||
    url === 'assets/sbi.mp4' ||
    url === '/assets/fondateur-photo.jpg' ||
    url === 'assets/fondateur-photo.jpg' ||
    url.includes('images.unsplash.com/photo-1560250097')
  );
}

function sanitizeSettings(raw = {}) {
  const clean = { ...EMPTY_MEDIA, ...raw };

  Object.keys(clean).forEach((key) => {
    const value = normalizeUrlValue(clean[key]);
    clean[key] = isLegacyLocalMediaUrl(value) ? '' : value;
  });

  return clean;
}

function settingsSignature(settings = {}) {
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

async function loadSiteIndexSettingsFromFirestore() {
  const firebase = await import('/js/firebase-init.js');
  const firestore = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

  if (!firebase.db || !firestore.doc || !firestore.getDoc) {
    throw new Error('Firestore indisponible');
  }

  const snap = await firestore.getDoc(firestore.doc(firebase.db, 'settings', 'siteIndex'));
  return snap.exists() ? sanitizeSettings(snap.data()) : EMPTY_MEDIA;
}

function stylesheetHrefMatches(link, cssPath) {
  const href = link.getAttribute('href') || '';
  const noLeadingSlash = cssPath.replace(/^\//, '');
  return href.includes(cssPath) || href.includes(noLeadingSlash);
}

function ensureStylesheet(cssPath, href, datasetKey) {
  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find((link) => stylesheetHrefMatches(link, cssPath));

  if (existing) {
    if ((existing.getAttribute('href') || '') !== href) existing.href = href;
    if (datasetKey) existing.dataset[datasetKey] = 'true';
    return existing;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  if (datasetKey) link.dataset[datasetKey] = 'true';
  document.head.appendChild(link);
  return link;
}

function ensureFounderCleanStyles() {
  return ensureStylesheet(FOUNDER_CSS_PATH, FOUNDER_CSS_HREF, 'sbiFounderCleanStyles');
}

function ensureQualiopiStyles() {
  return ensureStylesheet('/css/sbi-qualiopi.css', QUALIOPI_CSS_HREF, 'sbiQualiopiStyles');
}

function isHomePageReady() {
  const path = window.location.pathname.toLowerCase();
  return Boolean(
    document.querySelector('[data-sbi-public-section~="apropos"], .section-stats') &&
    (document.body?.dataset?.sbiPublicPage === 'home' || path === '/' || path.endsWith('/index.html'))
  );
}

function ensureQualiopiTrustBlock() {
  if (!isHomePageReady()) return null;

  ensureQualiopiStyles();

  const existing = document.getElementById(QUALIOPI_SECTION_ID);
  if (existing) return existing;

  const section = document.createElement('section');
  section.id = QUALIOPI_SECTION_ID;
  section.className = 'section-qualiopi sbi-qualiopi-section padding-global';
  section.dataset.sbiPublicSection = 'qualiopi certification';
  section.setAttribute('aria-labelledby', 'qualiopi-title');

  section.innerHTML = `
    <div class="qualiopi-shell">
      <div class="qualiopi-copy">
        <span class="section-surtitle text-blue uppercase text-italic">Certification qualité</span>
        <h2 id="qualiopi-title" class="qualiopi-title text-italic">SBI est certifié Qualiopi.</h2>
        <p class="qualiopi-lead text-italic">
          La certification qualité a été délivrée au titre de la catégorie d’action suivante :
          <strong>Actions de formation par apprentissage</strong>.
        </p>
        <p class="qualiopi-note text-italic">
          Cette certification atteste du processus qualité mis en œuvre dans le cadre des actions de formation par apprentissage.
        </p>
      </div>

      <figure class="qualiopi-card" aria-label="Certification Qualiopi SBI">
        <div class="qualiopi-logo-frame">
          <img src="/assets/logo-qualiopi-cfa.png" alt="Qualiopi processus certifié République Française" loading="lazy" decoding="async" width="1280" height="502">
        </div>
        <figcaption class="qualiopi-caption text-italic">
          La certification qualité a été délivrée au titre de la catégorie d’action suivante : <strong>Actions de formation par apprentissage</strong>.
        </figcaption>
      </figure>
    </div>
  `;

  const newsletter = document.querySelector('#ressources.section-newsletter, .section-newsletter');
  const stats = document.querySelector('#apropos.section-stats, .section-stats');

  if (newsletter?.parentNode) {
    newsletter.parentNode.insertBefore(section, newsletter);
  } else if (stats?.parentNode) {
    stats.insertAdjacentElement('afterend', section);
  } else {
    document.querySelector('main')?.appendChild(section);
  }

  window.requestAnimationFrame(() => {
    section.classList.add('is-ready');
    if (typeof window.SBI_PUBLIC_SHELL?.refreshSections === 'function') {
      window.SBI_PUBLIC_SHELL.refreshSections();
    }
    if (typeof window.SBI_RENDER_DIAGONALS === 'function') {
      window.SBI_RENDER_DIAGONALS();
    }
  });

  return section;
}

function markImageSource(img, url, sourceKind = '') {
  const isStorage = isFirebaseStorageUrl(url);
  const isLocalAsset = url.includes('/assets/fondateur-photo.jpg') || url.includes('assets/fondateur-photo.jpg');

  img.dataset.loadedFromStorage = isStorage ? 'true' : 'false';
  img.dataset.loadedFromLocal = isLocalAsset ? 'true' : 'false';
  if (sourceKind) img.dataset.mediaSource = sourceKind;
  if (isStorage) img.referrerPolicy = 'no-referrer';
}

function applyImage(selector, url, sourceKind = 'dynamic') {
  const cleanUrl = normalizeUrlValue(url);
  if (!cleanUrl) return;

  document.querySelectorAll(selector).forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;

    if (img.getAttribute('src') !== cleanUrl) img.src = cleanUrl;
    markImageSource(img, cleanUrl, sourceKind);
  });
}

function applyLocalBrandMedia() {
  document.querySelectorAll('.header-logo, .footer-logo-mark, .hero-large-logo').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.getAttribute('src') !== LOCAL_BRAND_MEDIA.logo) img.src = LOCAL_BRAND_MEDIA.logo;
    img.dataset.loadedFromStorage = 'false';
    img.dataset.brandSource = 'assets';
  });

  document.querySelectorAll('.header-brand, .footer-logo-wordmark').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.getAttribute('src') !== LOCAL_BRAND_MEDIA.brand) img.src = LOCAL_BRAND_MEDIA.brand;
    img.dataset.loadedFromStorage = 'false';
    img.dataset.brandSource = 'assets';
  });
}

function applyFounderImage(settings = {}) {
  const founderUrl = normalizeUrlValue(settings.founderImageUrl) || LOCAL_FOUNDER_IMAGE;
  const sourceKind = settings.founderImageUrl ? 'firestore' : 'local-fallback';

  document.querySelectorAll('.founder-img, [data-site-media="founder-image"]').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;

    if (img.getAttribute('src') !== founderUrl) img.src = founderUrl;

    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.decoding = 'async';
    img.sizes = '(max-width: 720px) 86vw, (max-width: 1180px) 420px, 430px';
    markImageSource(img, founderUrl, sourceKind);
  });
}

function setVideoState(video, state) {
  video.dataset.mediaState = state;
  document.body.dataset.sbiHeroVideo = state;
}

function applyHeroVideo(settings = {}) {
  const video = document.querySelector('[data-site-media="hero-video"], .hero-video-bg');
  if (!(video instanceof HTMLVideoElement)) return;

  const webmUrl = normalizeUrlValue(settings.heroVideoWebmUrl);
  const mp4Url = normalizeUrlValue(settings.heroVideoMp4Url);

  if (!webmUrl && !mp4Url) {
    setVideoState(video, 'missing-url');
    return;
  }

  const currentSources = Array.from(video.querySelectorAll('source'))
    .map((source) => `${source.getAttribute('src') || ''}:${source.getAttribute('type') || ''}`)
    .join('|');
  const nextSources = `${webmUrl}:video/webm|${mp4Url}:video/mp4`;

  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  if (currentSources !== nextSources) {
    video.pause();
    video.textContent = '';

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

    video.load();
  }

  setVideoState(video, 'loading');
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise
      .then(() => setVideoState(video, 'playing'))
      .catch((error) => {
        setVideoState(video, 'blocked');
        console.warn('[SBI Index] Lecture vidéo hero bloquée par le navigateur :', error);
      });
  } else {
    setVideoState(video, 'requested');
  }
}

function hasIndexMediaTargets() {
  return Boolean(document.querySelector('[data-site-media="hero-video"], .hero-video-bg, .founder-img, [data-site-media="founder-image"]'));
}

function applySettings(settings = EMPTY_MEDIA) {
  const safeSettings = sanitizeSettings(settings);

  ensureFounderCleanStyles();
  ensureQualiopiTrustBlock();
  applyLocalBrandMedia();
  applyHeroVideo(safeSettings);
  applyFounderImage(safeSettings);

  mediaState.lastSettings = safeSettings;
  mediaState.applyCount += 1;

  document.body.classList.add('is-site-index-media-ready');
  document.body.dataset.sbiSiteIndexMediaVersion = SITE_INDEX_MEDIA_VERSION;
  document.body.dataset.sbiFounderImageSource = safeSettings.founderImageUrl ? 'firestore' : 'local-fallback';

  if (typeof window.SBI_RENDER_DIAGONALS === 'function') {
    window.requestAnimationFrame(() => window.SBI_RENDER_DIAGONALS());
  }
}

async function refreshSettingsFromFirestore() {
  const settings = await loadSiteIndexSettingsFromFirestore();
  mediaState.lastSettings = settings;
  mediaState.lastError = null;
  mediaState.lastFetchAt = Date.now();
  writeCachedSettings(settings);
  return settings;
}

function applyBestKnownSettings() {
  if (mediaState.lastSettings) {
    applySettings(mediaState.lastSettings);
    return mediaState.lastSettings;
  }

  const cachedSettings = readCachedSettings();
  if (cachedSettings) {
    mediaState.lastSettings = cachedSettings;
    applySettings(cachedSettings);
    return cachedSettings;
  }

  ensureFounderCleanStyles();
  ensureQualiopiTrustBlock();
  applyLocalBrandMedia();
  applyFounderImage(EMPTY_MEDIA);
  document.body.classList.add('is-site-index-media-ready');
  document.body.dataset.sbiFounderImageSource = 'local-fallback';
  return null;
}

async function initSiteIndexMedia(options = {}) {
  const { forceRefresh = false } = options || {};

  if (!hasIndexMediaTargets()) {
    ensureQualiopiTrustBlock();
    return mediaState.lastSettings || null;
  }

  const before = applyBestKnownSettings();

  if (!mediaState.initPromise || forceRefresh) {
    mediaState.initPromise = refreshSettingsFromFirestore().catch((error) => {
      mediaState.lastError = error;
      if (!before) {
        console.warn('[SBI Index] Médias dynamiques indisponibles. Fallback local conservé.', error);
      }
      return mediaState.lastSettings || before || EMPTY_MEDIA;
    });
  }

  const settings = await mediaState.initPromise;
  // Toujours réappliquer après le fetch : en PJAX, le DOM a pu être remplacé même si les URLs sont identiques.
  applySettings(settings || EMPTY_MEDIA);
  window.__SBI_SITE_INDEX_MEDIA_LOADING__ = false;
  return settings;
}

function getSiteIndexMediaStatus() {
  return {
    version: SITE_INDEX_MEDIA_VERSION,
    hasTargets: hasIndexMediaTargets(),
    applyCount: mediaState.applyCount,
    lastFetchAt: mediaState.lastFetchAt ? new Date(mediaState.lastFetchAt).toISOString() : null,
    lastError: mediaState.lastError ? String(mediaState.lastError?.message || mediaState.lastError) : null,
    settings: mediaState.lastSettings ? { ...mediaState.lastSettings } : null,
    heroVideoState: document.querySelector('[data-site-media="hero-video"], .hero-video-bg')?.dataset?.mediaState || null,
    founderImageSource: document.querySelector('.founder-img, [data-site-media="founder-image"]')?.dataset?.mediaSource || null,
    founderLoadedFromStorage: document.querySelector('.founder-img, [data-site-media="founder-image"]')?.dataset?.loadedFromStorage || null
  };
}

window.SBI_INIT_SITE_INDEX_MEDIA = initSiteIndexMedia;
window.SBI_ENSURE_QUALIOPI_HOME_BLOCK = ensureQualiopiTrustBlock;
window.SBI_SITE_INDEX_MEDIA_STATUS = getSiteIndexMediaStatus;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSiteIndexMedia(), { once: true });
} else {
  initSiteIndexMedia();
}

export { initSiteIndexMedia, ensureQualiopiTrustBlock, getSiteIndexMediaStatus };
