const SITE_INDEX_MEDIA_VERSION = '8.0P.126';

window.__SBI_SITE_INDEX_MEDIA_LOADING__ = true;

const EMPTY_MEDIA = {
  heroVideoWebmUrl: '',
  heroVideoMp4Url: '',
  heroLogoUrl: '',
  headerLogoUrl: '',
  brandLogoUrl: '',
  founderImageUrl: '',
  aboutFounderHeroImageUrl: '',
  heroYoutubeUrl: '',
  heroYoutubeVideoId: ''
};

const MEDIA_CACHE_KEY = 'sbi:siteIndexMedia:v3';
const MEDIA_CACHE_TTL_MS = 5 * 60 * 1000;
const QUALIOPI_CSS_HREF = `/css/sbi-qualiopi.css?v=${SITE_INDEX_MEDIA_VERSION}`;
const FOUNDER_CLEAN_CSS_HREF = `/css/sbi-founder-image-clean.css?v=${SITE_INDEX_MEDIA_VERSION}`;
const QUALIOPI_SECTION_ID = 'qualiopi';

const LOCAL_MEDIA = {
  logo: '/assets/Logo_SBI_Tome.webp',
  brand: '/assets/sbi_brand.webp',
  founder: '/assets/fondateur-photo.jpg'
};

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractYoutubeVideoId(value) {
  const raw = cleanUrl(value);
  if (!raw) return '';
  if (YOUTUBE_VIDEO_ID_RE.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_VIDEO_ID_RE.test(id) ? id : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      const fromWatch = url.searchParams.get('v');
      if (fromWatch && YOUTUBE_VIDEO_ID_RE.test(fromWatch)) return fromWatch;

      const parts = url.pathname.split('/').filter(Boolean);
      const knownPrefixes = new Set(['embed', 'shorts', 'live', 'v']);
      if (parts.length >= 2 && knownPrefixes.has(parts[0]) && YOUTUBE_VIDEO_ID_RE.test(parts[1])) return parts[1];
    }
  } catch {
    return '';
  }

  return '';
}

function getHeroYoutubeVideoId(settings = {}) {
  return extractYoutubeVideoId(settings.heroYoutubeVideoId) || extractYoutubeVideoId(settings.heroYoutubeUrl);
}

function youtubeEmbedUrl(videoId) {
  if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) return '';
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    controls: '1',
    fs: '1',
    iv_load_policy: '3',
    enablejsapi: '1',
    origin: window.location.origin
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

function youtubeWatchUrl(videoId) {
  return YOUTUBE_VIDEO_ID_RE.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : '';
}

function ensureYoutubePreconnect() {
  [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://i.ytimg.com',
    'https://www.google.com',
    'https://rr1---sn-25glene6.googlevideo.com'
  ].forEach((href) => {
    if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}


let siteIndexMediaInitPromise = null;
let lastAppliedSignature = '';
let lastResolvedSettings = null;
let heroYoutubeOverlayVideoId = '';
let heroYoutubeEventsBound = false;
let heroYoutubeLastTrigger = null;
let heroYoutubePausedHeroVideos = [];

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

  clean.heroYoutubeVideoId = getHeroYoutubeVideoId(clean);
  clean.heroYoutubeUrl = clean.heroYoutubeVideoId ? clean.heroYoutubeUrl : '';

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


function revealAboutFounderHeroImage(img) {
  if (!(img instanceof HTMLImageElement)) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      img.classList.add('is-loaded');
      img.dataset.ready = 'true';
    });
  });
}

function applyAboutFounderHeroImage(settings = {}) {
  const founderUrl = cleanUrl(settings.aboutFounderHeroImageUrl);

  document.querySelectorAll('[data-site-media="about-founder-hero"], .about-founder-hero-img').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;

    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.decoding = 'async';

    if (!founderUrl) {
      img.classList.remove('is-loaded');
      img.dataset.ready = 'false';
      img.dataset.loadedFromStorage = 'false';
      img.dataset.mediaSource = 'missing-about-founder-hero';
      img.dataset.loadedFromLocal = 'false';
      return;
    }

    const srcChanged = img.getAttribute('src') !== founderUrl;
    if (srcChanged) {
      img.classList.remove('is-loaded');
      img.dataset.ready = 'false';
      img.src = founderUrl;
    }

    const isStorage = isStorageUrl(founderUrl);
    img.dataset.loadedFromStorage = isStorage ? 'true' : 'false';
    img.dataset.loadedFromLocal = 'false';
    img.dataset.mediaSource = 'firestore-about-founder-hero';
    if (isStorage) img.referrerPolicy = 'no-referrer';

    const onReady = () => revealAboutFounderHeroImage(img);
    img.removeEventListener('load', onReady);
    img.addEventListener('load', onReady, { once: true });

    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === 'function') {
        img.decode().then(onReady).catch(onReady);
      } else {
        onReady();
      }
    }
  });
}

function buildHeroYoutubeOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'sbi-hero-video-overlay';
  overlay.dataset.sbiHeroVideoOverlay = 'true';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Vidéo Sport Business Institute');
  overlay.innerHTML = `
    <button type="button" class="sbi-hero-video-close" data-sbi-hero-video-close aria-label="Fermer la vidéo">
      <span aria-hidden="true">×</span>
    </button>
    <div class="sbi-hero-video-modal" role="document">
      <div class="sbi-hero-video-frame" data-sbi-hero-video-frame>
        <div class="sbi-hero-video-loader" aria-live="polite">Chargement de la vidéo…</div>
      </div>
      <a class="sbi-hero-video-fallback" data-sbi-hero-video-fallback href="#" target="_blank" rel="noopener noreferrer">
        Ouvrir sur YouTube
      </a>
    </div>
  `;
  return overlay;
}

function getHeroYoutubeOverlay({ create = true } = {}) {
  let overlay = document.querySelector('[data-sbi-hero-video-overlay]');

  if (!overlay && create) {
    overlay = buildHeroYoutubeOverlay();
  }

  if (overlay && overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  } else if (overlay && !overlay.isConnected) {
    document.body.appendChild(overlay);
  }

  return overlay;
}

function getHeroYoutubeFrame({ create = true } = {}) {
  const overlay = getHeroYoutubeOverlay({ create });
  return overlay?.querySelector('[data-sbi-hero-video-frame]') || null;
}

function setHeroYoutubeButtonState(videoId) {
  document.querySelectorAll('[data-sbi-hero-video-open]').forEach((trigger) => {
    const enabled = Boolean(videoId);
    trigger.classList.toggle('is-disabled', !enabled);
    trigger.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    trigger.setAttribute('title', enabled ? 'Lire la vidéo SBI' : 'Aucune vidéo YouTube configurée');
  });
}

function pauseHeroBackgroundVideosForOverlay() {
  heroYoutubePausedHeroVideos = Array.from(document.querySelectorAll('[data-site-media="hero-video"], .hero-video-bg'))
    .filter((video) => video instanceof HTMLVideoElement && !video.paused);

  heroYoutubePausedHeroVideos.forEach((video) => {
    try { video.pause(); } catch {}
  });
}

function resumeHeroBackgroundVideosAfterOverlay() {
  const videos = heroYoutubePausedHeroVideos.filter((video) => document.contains(video));
  heroYoutubePausedHeroVideos = [];

  videos.forEach((video) => {
    try {
      video.play().catch(() => {});
    } catch {}
  });
}

function closeHeroYoutubeOverlay({ restoreFocus = false } = {}) {
  const overlay = getHeroYoutubeOverlay({ create: false });
  const frame = getHeroYoutubeFrame({ create: false });

  if (overlay) {
    overlay.classList.remove('is-open', 'is-loading', 'is-ready');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (frame) {
    frame.innerHTML = '<div class="sbi-hero-video-loader" aria-live="polite">Chargement de la vidéo…</div>';
  }

  document.body.classList.remove('sbi-hero-video-overlay-lock');
  resumeHeroBackgroundVideosAfterOverlay();

  if (restoreFocus && heroYoutubeLastTrigger && document.contains(heroYoutubeLastTrigger)) {
    heroYoutubeLastTrigger.focus({ preventScroll: true });
  }
}

function openHeroYoutubeOverlay(trigger = null) {
  const videoId = heroYoutubeOverlayVideoId;
  if (!videoId) return;

  ensureYoutubePreconnect();

  const overlay = getHeroYoutubeOverlay({ create: true });
  const frame = getHeroYoutubeFrame({ create: true });
  if (!overlay || !frame) return;

  heroYoutubeLastTrigger = trigger;
  const src = youtubeEmbedUrl(videoId);
  const watchUrl = youtubeWatchUrl(videoId);
  if (!src) return;

  pauseHeroBackgroundVideosForOverlay();

  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.remove('is-ready');
  overlay.classList.add('is-loading');
  document.body.classList.add('sbi-hero-video-overlay-lock');

  const fallback = overlay.querySelector('[data-sbi-hero-video-fallback]');
  if (fallback) {
    fallback.href = watchUrl || '#';
    fallback.hidden = !watchUrl;
  }

  frame.innerHTML = '<div class="sbi-hero-video-loader" aria-live="polite">Chargement de la vidéo…</div>';

  const iframe = document.createElement('iframe');
  iframe.title = 'Vidéo Sport Business Institute';
  iframe.loading = 'eager';
  iframe.referrerPolicy = 'origin-when-cross-origin';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; web-share';
  iframe.allowFullscreen = true;
  iframe.src = src;
  iframe.addEventListener('load', () => {
    overlay.classList.remove('is-loading');
    overlay.classList.add('is-ready');
  }, { once: true });

  frame.appendChild(iframe);

  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    overlay.querySelector('[data-sbi-hero-video-close]')?.focus({ preventScroll: true });
  });
}

function bindHeroYoutubeOverlayEvents() {
  if (heroYoutubeEventsBound) return;
  heroYoutubeEventsBound = true;

  document.addEventListener('click', (event) => {
    const openTrigger = event.target.closest('[data-sbi-hero-video-open]');
    if (openTrigger) {
      event.preventDefault();
      openHeroYoutubeOverlay(openTrigger);
      return;
    }

    const closeTrigger = event.target.closest('[data-sbi-hero-video-close]');
    if (closeTrigger) {
      event.preventDefault();
      closeHeroYoutubeOverlay({ restoreFocus: true });
      return;
    }

    const overlay = getHeroYoutubeOverlay({ create: false });
    if (overlay && overlay.classList.contains('is-open') && event.target === overlay) {
      closeHeroYoutubeOverlay({ restoreFocus: true });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && getHeroYoutubeOverlay({ create: false })?.classList.contains('is-open')) {
      closeHeroYoutubeOverlay({ restoreFocus: true });
    }
  });
}

function applyHeroYoutubeOverlay(settings = {}) {
  const videoId = getHeroYoutubeVideoId(settings);
  heroYoutubeOverlayVideoId = videoId;
  bindHeroYoutubeOverlayEvents();
  setHeroYoutubeButtonState(videoId);

  if (videoId) ensureYoutubePreconnect();
  if (!videoId) closeHeroYoutubeOverlay();
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
  applyHeroYoutubeOverlay(clean);
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
  closeHeroYoutubeOverlay();
  const page = document.body?.dataset?.sbiPublicPage || '';
  if (['home', 'apropos', 'formations', 'ressources'].includes(page)) {
    initSiteIndexMedia({ forceRefresh: false });
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSiteIndexMedia(), { once: true });
} else {
  initSiteIndexMedia();
}

export { initSiteIndexMedia, ensureQualiopiTrustBlock, getSiteIndexMediaStatus };
