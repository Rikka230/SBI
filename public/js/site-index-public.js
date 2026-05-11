const SITE_INDEX_MEDIA_VERSION = '8.0P.65';

window.__SBI_SITE_INDEX_MEDIA_LOADING__ = true;

const EMPTY_MEDIA = {
  heroVideoWebmUrl: '',
  heroVideoMp4Url: '',
  heroLogoUrl: '',
  headerLogoUrl: '',
  brandLogoUrl: '',
  founderImageUrl: '',
  aboutFounderHeroImageUrl: ''
};

const MEDIA_CACHE_KEY = 'sbi:siteIndexMedia:v2';
const MEDIA_CACHE_TTL_MS = 5 * 60 * 1000;
const QUALIOPI_CSS_HREF = `/css/sbi-qualiopi.css?v=${SITE_INDEX_MEDIA_VERSION}`;
const FOUNDER_CLEAN_CSS_HREF = `/css/sbi-founder-image-clean.css?v=${SITE_INDEX_MEDIA_VERSION}`;
const QUALIOPI_SECTION_ID = 'qualiopi';

const LOCAL_MEDIA = {
  logo: '/assets/Logo_SBI_Tome.webp',
  brand: '/assets/sbi_brand.webp',
  founder: '/assets/fondateur-photo.jpg'
};

let siteIndexMediaInitPromise = null;
let lastAppliedSignature = '';
let lastResolvedSettings = null;

function cleanUrl(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isLegacyLocalMediaUrl(value) {
  const url = cleanUrl(value);
  return (
    url === '/assets/sbi_master.webm' ||
    url === 'assets/sbi_master.webm' ||
    url === '/assets/sbi.mp4' ||
    url === 'assets/sbi.mp4' ||
    url.includes('images.unsplash.com/photo-1560250097')
  );
}

function sanitizeSettings(raw = {}) {
  const clean = { ...EMPTY_MEDIA };

  Object.keys(clean).forEach((key) => {
    const value = cleanUrl(raw?.[key]);
    clean[key] = isLegacyLocalMediaUrl(value) ? '' : value;
  });

  return clean;
}

function settingsSignature(settings) {
  return JSON.stringify(sanitizeSettings(settings));
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
  } catch {
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
  } catch {
    // cache opportuniste uniquement
  }
}

async function loadSiteIndexSettingsFromFirestore({ forceRefresh = false } = {}) {
  const firebase = await import(`/js/firebase-init.js?v=${SITE_INDEX_MEDIA_VERSION}`);
  const firestore = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

  if (!firebase.db || !firestore.doc || !firestore.getDoc) {
    throw new Error('Firestore indisponible');
  }

  if (forceRefresh) {
    try { sessionStorage.removeItem(MEDIA_CACHE_KEY); } catch {}
  }

  const snap = await firestore.getDoc(firestore.doc(firebase.db, 'settings', 'siteIndex'));
  return snap.exists() ? sanitizeSettings(snap.data()) : EMPTY_MEDIA;
}

function ensureStylesheet(href, datasetKey) {
  const cleanPath = href.split('?')[0];
  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find((link) => (link.getAttribute('href') || '').includes(cleanPath));

  if (existing) {
    if ((existing.getAttribute('href') || '') !== href) existing.href = href;
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
  ensureStylesheet(FOUNDER_CLEAN_CSS_HREF, 'sbiFounderCleanStyles');
}

function ensureQualiopiStyles() {
  ensureStylesheet(QUALIOPI_CSS_HREF, 'sbiQualiopiStyles');
}

function isHomePageReady() {
  const path = window.location.pathname.toLowerCase();
  return Boolean(
    document.querySelector('.section-stats, [data-sbi-public-section~="apropos"]') &&
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

  if (newsletter?.parentNode) newsletter.parentNode.insertBefore(section, newsletter);
  else if (stats?.parentNode) stats.insertAdjacentElement('afterend', section);
  else document.querySelector('main')?.appendChild(section);

  window.requestAnimationFrame(() => {
    section.classList.add('is-ready');
    if (typeof window.SBI_PUBLIC_SHELL?.refreshSections === 'function') {
      window.SBI_PUBLIC_SHELL.refreshSections();
    }
  });

  return section;
}

function isStorageUrl(url = '') {
  const clean = cleanUrl(url);
  return clean.includes('firebasestorage.googleapis.com') || clean.includes('firebasestorage.app');
}

function applyImage(selector, url, sourceName = 'firestore') {
  const clean = cleanUrl(url);
  if (!clean) return;

  document.querySelectorAll(selector).forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.getAttribute('src') !== clean) img.src = clean;
    img.dataset.loadedFromStorage = isStorageUrl(clean) ? 'true' : 'false';
    img.dataset.mediaSource = sourceName;
    if (isStorageUrl(clean)) img.referrerPolicy = 'no-referrer';
  });
}

function applyBrandMedia(settings = {}) {
  const headerLogo = settings.headerLogoUrl || LOCAL_MEDIA.logo;
  const brandLogo = settings.brandLogoUrl || LOCAL_MEDIA.brand;
  const heroLogo = settings.heroLogoUrl || settings.headerLogoUrl || LOCAL_MEDIA.logo;

  applyImage('.header-logo, .footer-logo-mark', headerLogo, settings.headerLogoUrl ? 'firestore' : 'assets');
  applyImage('.header-brand, .footer-logo-wordmark', brandLogo, settings.brandLogoUrl ? 'firestore' : 'assets');
  applyImage('.hero-large-logo, [data-site-media="hero-logo"]', heroLogo, (settings.heroLogoUrl || settings.headerLogoUrl) ? 'firestore' : 'assets');
}

function applyFounderImage(settings = {}) {
  const founderUrl = settings.founderImageUrl || LOCAL_MEDIA.founder;

  document.querySelectorAll('.founder-img').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.getAttribute('src') !== founderUrl) img.src = founderUrl;

    const isStorage = isStorageUrl(founderUrl);
    const isLocalAsset = founderUrl.includes('/assets/fondateur-photo.jpg') || founderUrl.includes('assets/fondateur-photo.jpg');
    img.dataset.loadedFromStorage = isStorage ? 'true' : 'false';
    img.dataset.loadedFromLocal = isLocalAsset ? 'true' : 'false';
    img.dataset.mediaSource = settings.founderImageUrl ? 'firestore' : 'assets';
    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.decoding = 'async';
    if (isStorage) img.referrerPolicy = 'no-referrer';
  });
}


function applyAboutFounderHeroImage(settings = {}) {
  const founderUrl = cleanUrl(settings.aboutFounderHeroImageUrl);

  document.querySelectorAll('[data-site-media="about-founder-hero"], .about-founder-hero-img').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;

    if (!founderUrl) {
      img.dataset.loadedFromStorage = 'false';
      img.dataset.mediaSource = 'missing-about-founder-hero';
      img.dataset.loadedFromLocal = 'false';
      return;
    }

    if (img.getAttribute('src') !== founderUrl) img.src = founderUrl;

    const isStorage = isStorageUrl(founderUrl);
    img.dataset.loadedFromStorage = isStorage ? 'true' : 'false';
    img.dataset.loadedFromLocal = 'false';
    img.dataset.mediaSource = 'firestore-about-founder-hero';
    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.decoding = 'async';
    if (isStorage) img.referrerPolicy = 'no-referrer';
  });
}

function applyHeroVideo(settings = {}) {
  const videos = Array.from(document.querySelectorAll('[data-site-media="hero-video"], .hero-video-bg'))
    .filter((video, index, list) => video instanceof HTMLVideoElement && list.indexOf(video) === index);

  if (!videos.length) return;

  const webmUrl = cleanUrl(settings.heroVideoWebmUrl);
  const mp4Url = cleanUrl(settings.heroVideoMp4Url);

  videos.forEach((video) => {
    if (!webmUrl && !mp4Url) {
      video.dataset.mediaState = 'missing-url';
      return;
    }

    const currentSources = Array.from(video.querySelectorAll('source'))
      .map((source) => `${source.type}:${source.getAttribute('src') || ''}`)
      .join('|');
    const nextSources = `${webmUrl ? `video/webm:${webmUrl}` : ''}|${mp4Url ? `video/mp4:${mp4Url}` : ''}`;

    if (currentSources !== nextSources) {
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

      video.load();
    }

    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.dataset.mediaState = 'requested';

    video.play()
      .then(() => { video.dataset.mediaState = 'playing'; })
      .catch((error) => {
        video.dataset.mediaState = 'play-blocked';
        console.warn('[SBI Index] Lecture vidéo hero bloquée ou différée :', error);
      });
  });
}

function applySettings(settings = {}) {
  const clean = sanitizeSettings(settings);
  lastResolvedSettings = clean;
  ensureFounderCleanStyles();
  ensureQualiopiTrustBlock();
  applyHeroVideo(clean);
  applyBrandMedia(clean);
  applyFounderImage(clean);
  applyAboutFounderHeroImage(clean);
  lastAppliedSignature = settingsSignature(clean);
  document.body.classList.add('is-site-index-media-ready');
}

async function initSiteIndexMedia(options = {}) {
  const forceRefresh = Boolean(options?.forceRefresh);

  /**
   * En navigation PJAX publique, le module reste déjà chargé mais le DOM de
   * l'index est remplacé. L'ancienne promesse est alors résolue et les nouveaux
   * nœuds .hero-video-bg / .founder-img reviennent avec leurs fallbacks locaux.
   * On réapplique donc immédiatement les derniers médias connus avant de rendre
   * la main, puis une seconde fois quand la promesse existante se termine si elle
   * était encore en cours.
   */
  if (siteIndexMediaInitPromise && !forceRefresh) {
    const knownSettings = lastResolvedSettings || readCachedSettings();
    if (knownSettings) applySettings(knownSettings);

    return siteIndexMediaInitPromise.then(() => {
      const settledSettings = lastResolvedSettings || readCachedSettings();
      if (settledSettings) applySettings(settledSettings);
    });
  }

  if (forceRefresh) siteIndexMediaInitPromise = null;

  siteIndexMediaInitPromise = (async () => {
    window.__SBI_SITE_INDEX_MEDIA_LOADING__ = true;
    ensureFounderCleanStyles();
    ensureQualiopiTrustBlock();

    const cachedSettings = forceRefresh ? null : readCachedSettings();
    if (cachedSettings) applySettings(cachedSettings);

    try {
      const settings = await loadSiteIndexSettingsFromFirestore({ forceRefresh });
      writeCachedSettings(settings);
      const nextSignature = settingsSignature(settings);
      if (forceRefresh || !cachedSettings || nextSignature !== lastAppliedSignature) {
        applySettings(settings);
      }
    } catch (error) {
      document.body.classList.add('is-site-index-media-ready');
      if (!cachedSettings) {
        applySettings(EMPTY_MEDIA);
        console.warn('[SBI Index] Médias dynamiques indisponibles. Fallback local appliqué.', error);
      }
    } finally {
      window.__SBI_SITE_INDEX_MEDIA_LOADING__ = false;
    }
  })();

  return siteIndexMediaInitPromise;
}

function getSiteIndexMediaStatus() {
  const video = document.querySelector('[data-site-media="hero-video"], .hero-video-bg');
  const founder = document.querySelector('.founder-img');
  const headerLogo = document.querySelector('.header-logo');
  const brandLogo = document.querySelector('.header-brand');

  return {
    version: SITE_INDEX_MEDIA_VERSION,
    ready: document.body.classList.contains('is-site-index-media-ready'),
    heroVideoState: video?.dataset?.mediaState || 'missing-node',
    heroVideoSources: video instanceof HTMLVideoElement
      ? Array.from(video.querySelectorAll('source')).map((source) => source.src)
      : [],
    founderLoadedFromStorage: founder?.dataset?.loadedFromStorage || 'missing-node',
    founderImageSource: founder?.dataset?.mediaSource || '',
    founderSrc: founder?.getAttribute?.('src') || '',
    aboutFounderHeroLoadedFromStorage: document.querySelector('[data-site-media="about-founder-hero"]')?.dataset?.loadedFromStorage || 'missing-node',
    aboutFounderHeroSource: document.querySelector('[data-site-media="about-founder-hero"]')?.dataset?.mediaSource || '',
    aboutFounderHeroSrc: document.querySelector('[data-site-media="about-founder-hero"]')?.getAttribute?.('src') || '',
    headerLogoLoadedFromStorage: headerLogo?.dataset?.loadedFromStorage || 'missing-node',
    headerLogoSource: headerLogo?.dataset?.mediaSource || '',
    headerLogoSrc: headerLogo?.getAttribute?.('src') || '',
    brandLogoLoadedFromStorage: brandLogo?.dataset?.loadedFromStorage || 'missing-node',
    brandLogoSource: brandLogo?.dataset?.mediaSource || '',
    brandLogoSrc: brandLogo?.getAttribute?.('src') || ''
  };
}

window.SBI_INIT_SITE_INDEX_MEDIA = initSiteIndexMedia;
window.SBI_ENSURE_QUALIOPI_HOME_BLOCK = ensureQualiopiTrustBlock;
window.SBI_SITE_INDEX_MEDIA_STATUS = getSiteIndexMediaStatus;
window.SBI_REFRESH_SITE_INDEX_MEDIA = () => initSiteIndexMedia({ forceRefresh: true });

window.addEventListener('sbi:public-shell:navigated', () => {
  const page = document.body?.dataset?.sbiPublicPage || '';
  if (page === 'home' || page === 'apropos') {
    initSiteIndexMedia({ forceRefresh: false });
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSiteIndexMedia(), { once: true });
} else {
  initSiteIndexMedia();
}

export { initSiteIndexMedia, ensureQualiopiTrustBlock, getSiteIndexMediaStatus };
