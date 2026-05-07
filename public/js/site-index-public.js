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
const QUALIOPI_CSS_HREF = '/css/sbi-qualiopi.css?v=8.0P.10b';
const QUALIOPI_SECTION_ID = 'qualiopi';
const LOCAL_BRAND_MEDIA = {
  logo: '/assets/Logo_SBI_Tome.webp',
  brand: '/assets/sbi_brand.webp'
};

let siteIndexMediaInitPromise = null;


async function loadSiteIndexSettingsFromFirestore() {
  const firebase = await import('/js/firebase-init.js');
  const firestore = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

  if (!firebase.db || !firestore.doc || !firestore.getDoc) {
    throw new Error('Firestore indisponible');
  }

  const snap = await firestore.getDoc(firestore.doc(firebase.db, 'settings', 'siteIndex'));
  return snap.exists() ? sanitizeSettings(snap.data()) : EMPTY_MEDIA;
}

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

function ensureQualiopiStyles() {
  const alreadyLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => {
      const href = link.getAttribute('href') || '';
      return href.includes('/css/sbi-qualiopi.css');
    });

  if (alreadyLoaded) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = QUALIOPI_CSS_HREF;
  link.dataset.sbiQualiopiStyles = 'true';
  document.head.appendChild(link);
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
  });

  return section;
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

function applyLocalBrandMedia() {
  document.querySelectorAll('.header-logo, .footer-logo-mark, .hero-large-logo').forEach((img) => {
    if (img instanceof HTMLImageElement && img.getAttribute('src') !== LOCAL_BRAND_MEDIA.logo) {
      img.src = LOCAL_BRAND_MEDIA.logo;
      img.dataset.loadedFromStorage = 'false';
      img.dataset.brandSource = 'assets';
    }
  });

  document.querySelectorAll('.header-brand, .footer-logo-wordmark').forEach((img) => {
    if (img instanceof HTMLImageElement && img.getAttribute('src') !== LOCAL_BRAND_MEDIA.brand) {
      img.src = LOCAL_BRAND_MEDIA.brand;
      img.dataset.loadedFromStorage = 'false';
      img.dataset.brandSource = 'assets';
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
  ensureQualiopiTrustBlock();
  applyHeroVideo(settings);
  applyLocalBrandMedia();
  applyImage('.founder-img', settings.founderImageUrl);
  document.body.classList.add('is-site-index-media-ready');
}

async function initSiteIndexMedia() {
  if (siteIndexMediaInitPromise) return siteIndexMediaInitPromise;

  siteIndexMediaInitPromise = (async () => {
    ensureFounderCleanStyles();
    ensureQualiopiTrustBlock();
    applyLocalBrandMedia();

    const cachedSettings = readCachedSettings();
    if (cachedSettings) {
      applySettings(cachedSettings);
    }

    try {
      const settings = await loadSiteIndexSettingsFromFirestore();
      writeCachedSettings(settings);

      if (!cachedSettings || settingsSignature(cachedSettings) !== settingsSignature(settings)) {
        applySettings(settings);
      } else {
        ensureQualiopiTrustBlock();
        document.body.classList.add('is-site-index-media-ready');
      }
    } catch (error) {
      ensureQualiopiTrustBlock();
      document.body.classList.add('is-site-index-media-ready');
      if (!cachedSettings) {
        console.warn('[SBI Index] Médias dynamiques indisponibles. Aucun fallback lourd local chargé.', error);
      }
    }
  })();

  return siteIndexMediaInitPromise;
}

window.SBI_INIT_SITE_INDEX_MEDIA = initSiteIndexMedia;
window.SBI_ENSURE_QUALIOPI_HOME_BLOCK = ensureQualiopiTrustBlock;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiteIndexMedia);
} else {
  initSiteIndexMedia();
}

export { initSiteIndexMedia, ensureQualiopiTrustBlock };
