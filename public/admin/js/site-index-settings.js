import { auth, db, storage } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

const SETTINGS_REF = doc(db, 'settings', 'siteIndex');

const DEFAULTS = {
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

const MEDIA = [
  { key: 'heroVideoWebmUrl', label: 'Vidéo hero WebM', kind: 'WebM', type: 'video', source: DEFAULTS.heroVideoWebmUrl, storagePath: 'site/index/hero-video/sbi_master.webm', contentType: 'video/webm' },
  { key: 'heroVideoMp4Url', label: 'Vidéo hero MP4 fallback', kind: 'MP4', type: 'video', source: DEFAULTS.heroVideoMp4Url, storagePath: 'site/index/hero-video/sbi.mp4', contentType: 'video/mp4' },
  { key: 'heroLogoUrl', label: 'Logo massif hero', kind: 'PNG', type: 'image', source: DEFAULTS.heroLogoUrl, storagePath: 'site/index/logos/Logo_SBI_Tome.png', contentType: 'image/png', logo: true },
  { key: 'brandLogoUrl', label: 'Wordmark header/footer', kind: 'PNG', type: 'image', source: DEFAULTS.brandLogoUrl, storagePath: 'site/index/logos/sbi_brand.png', contentType: 'image/png', logo: true },
  { key: 'founderImageUrl', label: 'Image fondateur index', kind: 'Image', type: 'image', source: DEFAULTS.founderImageUrl, storagePath: 'site/index/founder/founder-image', contentType: 'image/jpeg' },
  { key: 'aboutFounderHeroImageUrl', label: 'Fondateur À propos hero PNG', kind: 'PNG', type: 'image', source: DEFAULTS.aboutFounderHeroImageUrl, storagePath: 'site/index/founder/about-founder-hero.png', contentType: 'image/png', accept: 'image/png', pngOnly: true }
];

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function extractYoutubeVideoId(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
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

function youtubeWatchUrl(videoId) {
  return YOUTUBE_VIDEO_ID_RE.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : '';
}

let currentCleanup = null;

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
  const clean = { ...DEFAULTS, ...raw };
  Object.keys(clean).forEach((key) => {
    if (isLegacyLocalMediaUrl(clean[key])) clean[key] = '';
    if (typeof clean[key] === 'string') clean[key] = clean[key].trim();
  });

  const parsedYoutubeId = extractYoutubeVideoId(clean.heroYoutubeVideoId) || extractYoutubeVideoId(clean.heroYoutubeUrl);
  clean.heroYoutubeVideoId = parsedYoutubeId;
  clean.heroYoutubeUrl = parsedYoutubeId ? (clean.heroYoutubeUrl || youtubeWatchUrl(parsedYoutubeId)) : '';

  return clean;
}

function isStorageUrl(value) {
  return typeof value === 'string' && value.includes('firebasestorage.googleapis.com');
}

export function mountSiteIndexSettings({ root = document } = {}) {
  currentCleanup?.({ reason: 'remount' });

  const state = { user: null, settings: { ...DEFAULTS }, disposed: false };

  function $(selector) {
    return root.querySelector(selector);
  }

  function status(message, tone = 'neutral') {
    const el = $('#site-index-status');
    if (!el || state.disposed) return;
    el.textContent = message;
    el.style.color = tone === 'ok' ? '#2ed573' : tone === 'error' ? '#ff4a4a' : '#9ca3af';
  }

  function renderYoutubeSettings() {
    const input = $('#site-index-youtube-url');
    const preview = $('#site-index-youtube-preview');
    const removeBtn = $('#site-index-youtube-remove');

    const videoId = extractYoutubeVideoId(state.settings.heroYoutubeVideoId || state.settings.heroYoutubeUrl);
    const watchUrl = videoId ? youtubeWatchUrl(videoId) : '';

    if (input) input.value = state.settings.heroYoutubeUrl || watchUrl || '';
    if (preview) {
      preview.textContent = videoId
        ? `ID vidéo : ${videoId} • Embed : youtube-nocookie.com/embed/${videoId}`
        : 'Aucune vidéo YouTube configurée.';
      preview.classList.toggle('is-ready', Boolean(videoId));
    }
    if (removeBtn) removeBtn.disabled = !videoId;
  }

  async function saveYoutubeSettings() {
    const input = $('#site-index-youtube-url');
    const rawUrl = input?.value?.trim() || '';
    const videoId = extractYoutubeVideoId(rawUrl);

    if (!rawUrl) {
      await removeYoutubeSettings();
      return;
    }

    if (!videoId) {
      status('Lien YouTube invalide. Formats acceptés : youtube.com/watch, youtu.be, shorts, embed ou live.', 'error');
      input?.focus();
      return;
    }

    const normalizedUrl = youtubeWatchUrl(videoId);
    await saveSettings({
      heroYoutubeUrl: normalizedUrl,
      heroYoutubeVideoId: videoId
    });
    renderYoutubeSettings();
    status('Vidéo YouTube hero enregistrée.', 'ok');
  }

  async function removeYoutubeSettings() {
    await saveSettings({
      heroYoutubeUrl: '',
      heroYoutubeVideoId: ''
    });
    renderYoutubeSettings();
    status('Vidéo YouTube hero supprimée.', 'ok');
  }

  function handleYoutubeClick(event) {
    const saveBtn = event.target.closest('[data-youtube-action="save"]');
    const removeBtn = event.target.closest('[data-youtube-action="remove"]');

    if (saveBtn && root.contains(saveBtn)) {
      event.preventDefault();
      saveYoutubeSettings().catch((error) => {
        console.error(error);
        status('Erreur lors de l’enregistrement de la vidéo YouTube.', 'error');
      });
      return;
    }

    if (removeBtn && root.contains(removeBtn)) {
      event.preventDefault();
      removeYoutubeSettings().catch((error) => {
        console.error(error);
        status('Erreur lors de la suppression de la vidéo YouTube.', 'error');
      });
    }
  }

  function handleYoutubeSubmit(event) {
    if (event.target.closest('[data-youtube-form]')) {
      event.preventDefault();
      saveYoutubeSettings().catch((error) => {
        console.error(error);
        status('Erreur lors de l’enregistrement de la vidéo YouTube.', 'error');
      });
    }
  }


  function makePreview(item, url) {
    const src = url && !isLegacyLocalMediaUrl(url) ? url : '';

    if (!src) {
      return `
        <div class="site-media-empty-preview">
          <span>Aucun média Storage configuré</span>
        </div>
      `;
    }

    if (item.type === 'video') {
      return `<video src="${src}" muted playsinline controls preload="metadata"></video>`;
    }

    return `<img src="${src}" alt="${item.label}" loading="lazy">`;
  }

  function cardTemplate(item) {
    const currentUrl = state.settings[item.key] && !isLegacyLocalMediaUrl(state.settings[item.key]) ? state.settings[item.key] : '';
    const fromStorage = isStorageUrl(currentUrl);
    return `
      <article class="site-media-card" data-key="${item.key}">
        <div class="site-media-card__head">
          <div>
            <h2>${item.label}</h2>
            <small>${fromStorage ? 'Source actuelle : Firebase Storage' : 'Source actuelle : fallback local/externe'}</small>
          </div>
          <span class="site-media-kind">${item.kind}</span>
        </div>
        <div class="site-media-preview ${item.logo ? 'logo-preview' : ''}">
          ${makePreview(item, currentUrl)}
        </div>
        <div class="site-media-url">${currentUrl}</div>
        <div class="site-media-actions">
          <label class="site-media-btn secondary">
            Remplacer le fichier
            <input type="file" data-upload="${item.key}" accept="${item.accept || (item.type === 'video' ? 'video/*' : 'image/*')}" hidden>
          </label>
        </div>
        <div class="site-media-progress"><span data-progress="${item.key}"></span></div>
      </article>
    `;
  }

  function renderCards() {
    const grid = $('#site-index-grid');
    if (!grid || state.disposed) return;
    grid.innerHTML = MEDIA.map(cardTemplate).join('');
  }

  function refreshCard(key) {
    const item = MEDIA.find((entry) => entry.key === key);
    const oldCard = root.querySelector(`[data-key="${key}"]`);
    if (!item || !oldCard) {
      renderCards();
      return;
    }

    const template = document.createElement('template');
    template.innerHTML = cardTemplate(item).trim();
    const newCard = template.content.firstElementChild;
    oldCard.replaceWith(newCard);
  }

  async function saveSettings(patch, changedKey = null) {
    if (!state.user) throw new Error('Non connecté');
    state.settings = { ...state.settings, ...patch };
    await setDoc(SETTINGS_REF, {
      ...state.settings,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid
    }, { merge: true });

    if (changedKey && !state.disposed) refreshCard(changedKey);
  }

  function setProgress(key, value) {
    const bar = root.querySelector(`[data-progress="${key}"]`);
    if (bar && !state.disposed) bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  async function uploadBlob(item, blob, fileNameSuffix = '') {
    const path = item.storagePath + fileNameSuffix;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, blob, { contentType: blob.type || item.contentType });

    return new Promise((resolve, reject) => {
      task.on('state_changed', (snapshot) => {
        const percent = snapshot.totalBytes ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0;
        setProgress(item.key, percent);
      }, reject, async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      });
    });
  }

  async function uploadItem(key, file) {
    const item = MEDIA.find((entry) => entry.key === key);
    if (!item || !file || state.disposed) return;
    try {
      if (item.pngOnly && file.type !== 'image/png') {
        status(`${item.label} : merci d’envoyer un fichier PNG.`, 'error');
        return;
      }
      status(`Upload de ${item.label}...`);
      const suffix = item.storagePath.endsWith('founder-image') ? `-${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '-')}` : '';
      const url = await uploadBlob(item, file, suffix);
      await saveSettings({ [item.key]: url }, item.key);
      status(`${item.label} mis à jour.`, 'ok');
    } catch (error) {
      console.error(error);
      status(`Erreur upload : ${item.label}.`, 'error');
    }
  }

  function handleChange(event) {
    const input = event.target.closest('[data-upload]');
    if (!input || !root.contains(input)) return;
    uploadItem(input.dataset.upload, input.files?.[0]);
    input.value = '';
  }

  async function loadSettings() {
    const snap = await getDoc(SETTINGS_REF);
    if (state.disposed) return;
    state.settings = snap.exists() ? sanitizeSettings(snap.data()) : { ...DEFAULTS };
    renderYoutubeSettings();
    renderCards();
  }

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (state.disposed) return;

    if (!user) {
      window.location.replace('/login.html');
      return;
    }

    state.user = user;
    await loadSettings();
    status('Médias actuels chargés.');
  });

  root.addEventListener('change', handleChange);
  root.addEventListener('click', handleYoutubeClick);
  root.addEventListener('submit', handleYoutubeSubmit);
  renderYoutubeSettings();
  renderCards();

  const cleanup = () => {
    state.disposed = true;
    root.removeEventListener('change', handleChange);
    root.removeEventListener('click', handleYoutubeClick);
    root.removeEventListener('submit', handleYoutubeSubmit);
    unsubscribeAuth?.();
    if (currentCleanup === cleanup) currentCleanup = null;
  };

  currentCleanup = cleanup;
  return cleanup;
}

function autoMount() {
  if (!document.querySelector('#site-index-grid')) return;
  if (window.__SBI_APP_SHELL_MOUNTING_SITE_INDEX) return;
  mountSiteIndexSettings({ root: document });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}
