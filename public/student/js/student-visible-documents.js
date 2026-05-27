import { auth, db, storage } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  getBlob,
  getDownloadURL,
  ref
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

const ROOT_ID = 'student-visible-documents';
const LIST_ID = 'student-visible-documents-list';
const STATUS_ID = 'student-visible-documents-status';
const TOGGLE_ID = 'student-visible-documents-toggle';
const COUNT_ID = 'student-visible-documents-count';
const STYLE_ID = 'student-visible-documents-style';

let lastDocuments = [];
let authUnsubscribe = null;
let bootScheduled = false;
let loadRequestId = 0;
let loadedForUid = '';

function isStudentPath() {
  return window.location.pathname.startsWith('/student/');
}

function getEffectiveProfileUrl() {
  return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
}

function isOwnProfileView(uid = '') {
  const targetId = getEffectiveProfileUrl().searchParams.get('id') || '';
  return !targetId || targetId === uid;
}

function setRootVisible(visible) {
  const root = getRoot();
  if (!root) return;
  root.hidden = !visible;
  root.style.display = visible ? '' : 'none';
  root.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function canShowDocumentsForUser(uid = '') {
  const visible = Boolean(uid && isOwnProfileView(uid));
  setRootVisible(visible);
  if (!visible) {
    loadRequestId += 1;
    lastDocuments = [];
    loadedForUid = '';
  }
  return visible;
}

function escapeHTML(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return 'Date inconnue';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(ms));
  } catch (_) {
    return 'Date inconnue';
  }
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function sanitizeFileName(value = 'document-sbi') {
  return String(value || 'document-sbi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'document-sbi';
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById(STATUS_ID);
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setCount(count = 0, label = '') {
  const countEl = document.getElementById(COUNT_ID);
  if (!countEl) return;
  if (label) {
    countEl.textContent = label;
    return;
  }
  countEl.textContent = count > 0 ? `${count} document(s)` : 'Aucun document';
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .student-visible-documents-panel {
      scroll-margin-top: 90px;
      transition: border-color .18s ease, box-shadow .18s ease;
    }

    .student-visible-documents-summary {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:1rem;
      cursor:pointer;
    }

    .student-visible-documents-summary-title {
      display:flex;
      align-items:center;
      gap:0.78rem;
      min-width:0;
    }

    .student-visible-documents-arrow {
      width:34px;
      height:34px;
      border-radius:12px;
      border:1px solid rgba(42,87,255,0.2);
      background:linear-gradient(180deg, rgba(42,87,255,0.08), rgba(42,87,255,0.03));
      color:var(--accent-blue);
      display:inline-flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
      box-shadow:0 8px 18px rgba(42,87,255,0.08);
      transition:transform .2s ease, background .2s ease, box-shadow .2s ease;
    }

    .student-visible-documents-arrow svg {
      width:16px;
      height:16px;
      display:block;
      stroke:currentColor;
      stroke-width:2.4;
      fill:none;
      stroke-linecap:round;
      stroke-linejoin:round;
      transition:transform .2s ease;
    }

    .student-visible-documents-panel:not(.is-collapsed) .student-visible-documents-arrow {
      background:rgba(42,87,255,0.13);
      box-shadow:0 10px 24px rgba(42,87,255,0.12);
    }

    .student-visible-documents-panel:not(.is-collapsed) .student-visible-documents-arrow svg {
      transform:rotate(90deg);
    }

    .student-visible-documents-count {
      display:block;
      color:var(--text-muted);
      font-size:0.85rem;
      font-weight:800;
      white-space:nowrap;
      margin-top:.16rem;
    }

    .student-visible-documents-content {
      margin-top:1rem;
    }

    .student-visible-documents-panel.is-collapsed .student-visible-documents-content {
      display:none;
    }

    .student-visible-documents-content p {
      margin:0 0 0.85rem;
      color:var(--text-muted);
      line-height:1.55;
      font-size:0.92rem;
    }

    .student-visible-documents-status {
      display:block;
      min-height:1.2rem;
      color:var(--text-muted);
      font-size:0.85rem;
      margin-bottom:0.85rem;
    }

    .student-visible-documents-status[data-tone="error"] { color:#ef4444; }
    .student-visible-documents-status[data-tone="success"] { color:#10b981; }

    .student-visible-documents-list {
      display:grid;
      gap:0.8rem;
    }

    .student-visible-doc-card {
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:1rem;
      align-items:center;
      padding:1rem;
      border:1px solid rgba(148, 163, 184, 0.25);
      border-radius:16px;
      background:rgba(255,255,255,0.72);
      box-shadow:0 8px 24px rgba(15, 23, 42, 0.05);
    }

    .student-visible-doc-card strong {
      display:block;
      color:var(--text-main);
      margin-bottom:0.25rem;
    }

    .student-visible-doc-card span,
    .student-visible-doc-card small {
      display:block;
      color:var(--text-muted);
      line-height:1.45;
    }

    .student-visible-doc-card__actions {
      display:flex;
      gap:0.5rem;
      flex-wrap:wrap;
      justify-content:flex-end;
    }

    .student-visible-doc-card__actions button,
    .student-visible-doc-retry {
      border:1px solid rgba(42,87,255,0.25);
      border-radius:999px;
      padding:0.58rem 0.85rem;
      color:var(--accent-blue);
      background:rgba(42,87,255,0.08);
      font-weight:800;
      cursor:pointer;
    }

    .student-visible-doc-card__actions button:hover,
    .student-visible-doc-retry:hover {
      background:rgba(42,87,255,0.14);
    }

    .student-visible-doc-empty {
      padding:1rem;
      border-radius:14px;
      background:rgba(148,163,184,0.08);
      color:var(--text-muted);
      line-height:1.55;
    }

    @media (max-width: 720px) {
      .student-visible-doc-card { grid-template-columns:1fr; }
      .student-visible-doc-card__actions { justify-content:flex-start; }
      .student-visible-documents-summary { align-items:flex-start; }
    }
  `;
  document.head.appendChild(style);
}

function getRoot() {
  return document.getElementById(ROOT_ID);
}

function setCollapsed(collapsed) {
  const root = getRoot();
  const toggle = document.getElementById(TOGGLE_ID);
  if (!root) return;
  root.classList.toggle('is-collapsed', collapsed);
  if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function bindToggle() {
  const root = getRoot();
  const toggle = document.getElementById(TOGGLE_ID);
  if (!root || !toggle || toggle.dataset.bound === '1') return;

  toggle.dataset.bound = '1';
  toggle.addEventListener('click', () => {
    setCollapsed(!root.classList.contains('is-collapsed'));
  });

  setCollapsed(window.location.hash !== '#student-visible-documents');
}

function activateTrackingTabIfNeeded() {
  if (window.location.hash !== '#student-visible-documents') return;

  document.querySelectorAll('.student-sub-nav-item').forEach((item) => {
    item.classList.remove('active');
    const onclick = String(item.getAttribute('onclick') || '');
    if (onclick.includes('tab-tracking')) item.classList.add('active');
  });

  document.querySelectorAll('.student-view').forEach((view) => view.classList.remove('active'));
  document.getElementById('tab-tracking')?.classList.add('active');
  setCollapsed(false);

  window.setTimeout(() => {
    getRoot()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 180);
}

function renderEmpty() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;
  list.innerHTML = `
    <div class="student-visible-doc-empty">
      Aucun document SBI n’est disponible dans ton espace pour le moment.
      Les documents apparaîtront ici quand l’équipe SBI les rendra accessibles.
    </div>
  `;
}

function renderError() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;
  list.innerHTML = `
    <div class="student-visible-doc-empty">
      Documents indisponibles pour le moment.
      <br><br>
      <button type="button" class="student-visible-doc-retry" id="student-visible-documents-retry">Réessayer</button>
    </div>
  `;
  document.getElementById('student-visible-documents-retry')?.addEventListener('click', () => {
    const user = auth.currentUser;
    if (user) loadAndRender(user.uid);
  });
}

function renderDocuments(documents = []) {
  const list = document.getElementById(LIST_ID);
  if (!list) return;

  lastDocuments = documents;
  setCount(documents.length);

  if (!documents.length) {
    renderEmpty();
    return;
  }

  list.innerHTML = documents.map((item) => `
    <article class="student-visible-doc-card">
      <div>
        <strong>${escapeHTML(item.title || item.fileName || 'Document SBI')}</strong>
        <span>${escapeHTML(item.fileName || 'Fichier')}</span>
        <small>${escapeHTML(formatBytes(item.size))} · Disponible depuis le ${escapeHTML(formatDate(item.studentVisibleAt || item.updatedAt || item.createdAt))}</small>
      </div>
      <div class="student-visible-doc-card__actions">
        <button type="button" data-doc-open="${escapeHTML(item.id)}">Ouvrir</button>
        <button type="button" data-doc-download="${escapeHTML(item.id)}">Télécharger</button>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('[data-doc-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = lastDocuments.find((entry) => entry.id === button.dataset.docOpen);
      if (!item) return;
      await openDocument(item, button);
    });
  });

  list.querySelectorAll('[data-doc-download]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = lastDocuments.find((entry) => entry.id === button.dataset.docDownload);
      if (!item) return;
      await downloadDocument(item, button);
    });
  });
}

async function getDocumentUrl(item) {
  if (!item?.filePath) throw new Error('Chemin fichier manquant.');
  return getDownloadURL(ref(storage, item.filePath));
}

function withDownloadDisposition(url, fileName) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('response-content-disposition', `attachment; filename="${sanitizeFileName(fileName)}"`);
    return parsed.toString();
  } catch (_) {
    const separator = String(url).includes('?') ? '&' : '?';
    return `${url}${separator}response-content-disposition=${encodeURIComponent(`attachment; filename="${sanitizeFileName(fileName)}"`)}`;
  }
}

async function openDocument(item, button) {
  const previous = button?.textContent || 'Ouvrir';
  if (button) {
    button.disabled = true;
    button.textContent = 'Ouverture...';
  }

  try {
    const url = await getDocumentUrl(item);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.warn('[SBI Student Documents] Ouverture impossible :', error);
    setStatus('Ouverture impossible pour le moment.', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

async function downloadDocument(item, button) {
  const previous = button?.textContent || 'Télécharger';
  if (button) {
    button.disabled = true;
    button.textContent = 'Téléchargement...';
  }

  const fileName = sanitizeFileName(item?.fileName || item?.title || 'document-sbi');

  try {
    if (!item?.filePath) throw new Error('Chemin fichier manquant.');

    const fileRef = ref(storage, item.filePath);
    const blob = await getBlob(fileRef);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = blobUrl;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1800);
    setStatus('Téléchargement lancé.', 'success');
  } catch (error) {
    console.warn('[SBI Student Documents] Téléchargement blob impossible, fallback lien direct :', error);

    try {
      const fallbackUrl = withDownloadDisposition(await getDocumentUrl(item), fileName);
      const link = document.createElement('a');
      link.href = fallbackUrl;
      link.download = fileName;
      link.rel = 'noopener';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Téléchargement lancé. Si le navigateur ouvre le fichier, utilise “Enregistrer sous”.', 'success');
    } catch (_) {
      setStatus('Téléchargement impossible pour le moment.', 'error');
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

async function loadVisibleDocuments(uid) {
  const docsQuery = query(
    collection(db, 'studentDocuments'),
    where('studentUid', '==', uid),
    where('visibility', '==', 'student_visible'),
    where('status', 'in', ['active', 'submitted', 'validated'])
  );

  const snap = await getDocs(docsQuery);
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  rows.sort((a, b) => toMillis(b.studentVisibleAt || b.updatedAt || b.createdAt) - toMillis(a.studentVisibleAt || a.updatedAt || a.createdAt));
  return rows;
}

async function loadAndRender(uid) {
  const requestId = ++loadRequestId;
  loadedForUid = uid;
  setStatus('Chargement des documents SBI...', 'muted');
  setCount(0, 'Chargement...');

  try {
    const documents = await Promise.race([
      loadVisibleDocuments(uid),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 9000))
    ]);

    if (requestId !== loadRequestId) return;
    renderDocuments(documents);
    setStatus(documents.length ? `${documents.length} document(s) disponible(s).` : '', documents.length ? 'success' : 'muted');
    activateTrackingTabIfNeeded();
  } catch (error) {
    if (requestId !== loadRequestId) return;
    console.warn('[SBI Student Documents] Lecture impossible :', error);
    setCount(0, 'Indisponible');
    setStatus('Documents indisponibles pour le moment.', 'error');
    renderError();
  }
}

function mount() {
  if (!isStudentPath()) return;

  const root = getRoot();
  if (!root) return;
  const currentUid = auth.currentUser?.uid || '';

  if (currentUid && !canShowDocumentsForUser(currentUid)) return;
  if (!currentUid && getEffectiveProfileUrl().searchParams.get('id')) {
    setRootVisible(false);
    return;
  }

  if (root.dataset.studentDocumentsMounted === '1') {
    if (currentUid && canShowDocumentsForUser(currentUid) && loadedForUid !== currentUid) {
      loadAndRender(currentUid);
    }
    activateTrackingTabIfNeeded();
    return;
  }

  root.dataset.studentDocumentsMounted = '1';

  injectStyle();
  bindToggle();
  activateTrackingTabIfNeeded();

  if (auth.currentUser) {
    if (canShowDocumentsForUser(auth.currentUser.uid)) {
      loadAndRender(auth.currentUser.uid);
    }
  }

  if (!authUnsubscribe) {
    authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!getRoot()) return;

      if (!user) {
        setRootVisible(true);
        setStatus('Connecte-toi pour consulter tes documents SBI.', 'error');
        setCount(0);
        renderEmpty();
        return;
      }

      if (!canShowDocumentsForUser(user.uid)) return;
      await loadAndRender(user.uid);
    });
  }
}

function boot() {
  if (bootScheduled) return;
  bootScheduled = true;
  window.requestAnimationFrame(() => {
    bootScheduled = false;
    mount();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

const observer = new MutationObserver(() => boot());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('pageshow', boot);
window.addEventListener('hashchange', () => {
  boot();
  activateTrackingTabIfNeeded();
});
window.addEventListener('sbi:pjax-ready', boot);
window.addEventListener('sbi:page-loaded', boot);
window.addEventListener('popstate', boot);
