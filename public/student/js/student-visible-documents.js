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

let mounted = false;
let lastDocuments = [];

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

function setCount(count = 0) {
  const countEl = document.getElementById(COUNT_ID);
  if (!countEl) return;
  countEl.textContent = count > 0 ? `${count} document(s)` : 'Aucun document';
}

function injectStyle() {
  if (document.getElementById('student-visible-documents-style')) return;
  const style = document.createElement('style');
  style.id = 'student-visible-documents-style';
  style.textContent = `
    .student-visible-documents-panel {
      scroll-margin-top: 90px;
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
      gap:0.7rem;
      min-width:0;
    }

    .student-visible-documents-arrow {
      width:34px;
      height:34px;
      border-radius:999px;
      border:1px solid rgba(42,87,255,0.22);
      background:rgba(42,87,255,0.08);
      color:var(--accent-blue);
      display:inline-flex;
      align-items:center;
      justify-content:center;
      font-weight:900;
      transition:transform 0.2s ease, background 0.2s ease;
      flex-shrink:0;
    }

    .student-visible-documents-panel:not(.is-collapsed) .student-visible-documents-arrow {
      transform:rotate(90deg);
      background:rgba(42,87,255,0.14);
    }

    .student-visible-documents-count {
      color:var(--text-muted);
      font-size:0.85rem;
      font-weight:800;
      white-space:nowrap;
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

    .student-visible-documents-status[data-tone="error"] {
      color:#ef4444;
    }

    .student-visible-documents-status[data-tone="success"] {
      color:#10b981;
    }

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
      .student-visible-doc-card {
        grid-template-columns:1fr;
      }

      .student-visible-doc-card__actions {
        justify-content:flex-start;
      }

      .student-visible-documents-summary {
        align-items:flex-start;
      }
    }
  `;
  document.head.appendChild(style);
}

function setCollapsed(collapsed) {
  const root = document.getElementById(ROOT_ID);
  const toggle = document.getElementById(TOGGLE_ID);
  if (!root) return;
  root.classList.toggle('is-collapsed', collapsed);
  if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function bindToggle() {
  const root = document.getElementById(ROOT_ID);
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
    document.getElementById(ROOT_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  try {
    if (!item?.filePath) throw new Error('Chemin fichier manquant.');

    const fileRef = ref(storage, item.filePath);
    const blob = await getBlob(fileRef);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = blobUrl;
    link.download = sanitizeFileName(item.fileName || item.title || 'document-sbi');
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1800);
    setStatus('Téléchargement lancé.', 'success');
  } catch (error) {
    console.warn('[SBI Student Documents] Téléchargement impossible :', error);
    setStatus('Téléchargement direct indisponible sur ce navigateur. Ouverture du fichier.', 'error');

    try {
      const fallbackUrl = await getDocumentUrl(item);
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    } catch (_) {}
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
  setStatus('Chargement des documents SBI...', 'muted');

  try {
    const documents = await Promise.race([
      loadVisibleDocuments(uid),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 9000))
    ]);

    renderDocuments(documents);
    setStatus(documents.length ? `${documents.length} document(s) disponible(s).` : '', documents.length ? 'success' : 'muted');
    activateTrackingTabIfNeeded();
  } catch (error) {
    console.warn('[SBI Student Documents] Lecture impossible :', error);
    setCount(0);
    setStatus('Documents indisponibles pour le moment.', 'error');
    renderError();
  }
}

function mount() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  if (mounted && root.dataset.studentDocumentsMounted === '1') {
    activateTrackingTabIfNeeded();
    return;
  }

  mounted = true;
  root.dataset.studentDocumentsMounted = '1';

  injectStyle();
  bindToggle();
  activateTrackingTabIfNeeded();

  let authResolved = false;

  onAuthStateChanged(auth, async (user) => {
    authResolved = true;

    if (!user) {
      setStatus('Connecte-toi pour consulter tes documents SBI.', 'error');
      setCount(0);
      renderEmpty();
      return;
    }

    await loadAndRender(user.uid);
  });

  window.setTimeout(() => {
    if (authResolved) return;
    if (auth.currentUser) {
      authResolved = true;
      loadAndRender(auth.currentUser.uid);
    }
  }, 900);
}

function boot() {
  mount();
  window.setTimeout(mount, 350);
  window.setTimeout(mount, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

window.addEventListener('pageshow', boot);
window.addEventListener('hashchange', activateTrackingTabIfNeeded);
window.addEventListener('sbi:pjax-ready', boot);
window.addEventListener('sbi:page-loaded', boot);
