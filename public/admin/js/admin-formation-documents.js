/**
 * SBI 8.0P.167.282 — Écran ADMIN « Documents de formation ».
 *
 * Gestion des documents de formation : livret d'accueil, règlement intérieur,
 * planning (par défaut formation + ciblés par promotion), référentiel/RNCP,
 * et liste libre « autres documents ».
 *
 * - sélecteur de formation ;
 * - catégories à doc unique (livret/règlement/référentiel + planning défaut) :
 *   remplacer / supprimer / ajouter ;
 * - planning par promotion : ajouter / remplacer / supprimer par promotion ;
 * - autres documents : liste libre (titre + fichier) avec ajout/suppression.
 *
 * Écritures Firestore + Storage réservées ADMIN (cf. règles). Pas de listener
 * temps réel : rechargement après chaque action. Pattern PJAX anti-double
 * montage + self-mount au DOMContentLoaded (cf. admin-assignments.js).
 */

import { auth, db, storage } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';
import {
  DOC_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  escapeHtml,
  formatSize,
  sanitizeStorageName,
  buildFormationDocId,
  loadFormationDocuments,
  loadPromotionsForFormation,
  groupByCategory,
  FORMATION_DOCS_COLLECTION
} from '/js/formation-documents/formation-docs-data.js?v=8.0P.167.282';

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;
let currentAdmin = null;
let busy = false;

let formations = [];
let selectedFormationId = '';
let documents = [];
let promotions = [];
let selectedPlanningPromo = '';

const SINGLE_CATEGORIES = DOC_CATEGORIES.filter((c) => c.mode === 'single');

function root() { return document.getElementById('fdoc-root'); }

function setStatus(message, tone = '') {
  const r = root();
  if (!r) return;
  const cls = tone === 'error' ? ' is-error' : tone === 'success' ? ' is-success' : '';
  r.innerHTML = `<div class="sbi-fdoc-status${cls}">${escapeHtml(message)}</div>`;
}

function flash(message, tone = '') {
  const el = root()?.querySelector('[data-fdoc-flash]');
  if (!el) return;
  el.className = `sbi-fdoc-status${tone === 'error' ? ' is-error' : tone === 'success' ? ' is-success' : ''}`;
  el.textContent = message;
}

async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Profil admin introuvable.');
  const profile = snap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');
  const displayName = profile.displayName || profile.name || profile.fullName
    || [profile.firstName, profile.lastName].filter(Boolean).join(' ')
    || user.email || 'Admin';
  currentAdmin = { uid: user.uid, profile, displayName };
}

async function loadFormations() {
  const snap = await getDocs(collection(db, 'formations'));
  const out = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    out.push({ id: d.id, titre: data.titre || data.title || data.nom || data.name || d.id });
  });
  formations = out.sort((a, b) => String(a.titre).localeCompare(String(b.titre), 'fr', { sensitivity: 'base' }));
}

async function loadFormationData() {
  if (!selectedFormationId) {
    documents = [];
    promotions = [];
    return;
  }
  const [docs, promos] = await Promise.all([
    loadFormationDocuments({ db, formationId: selectedFormationId }),
    loadPromotionsForFormation({ db, formationId: selectedFormationId })
  ]);
  documents = docs;
  promotions = promos;
  if (selectedPlanningPromo && !promotions.some((p) => p.id === selectedPlanningPromo)) {
    selectedPlanningPromo = '';
  }
}

function findDoc(predicate) {
  return documents.find(predicate) || null;
}

function promoName(promotionId) {
  return promotions.find((p) => p.id === promotionId)?.name || promotionId;
}

function validateFile(file) {
  if (!file) throw new Error('Aucun fichier sélectionné.');
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
  if (isSvg) throw new Error('Les fichiers SVG ne sont pas autorisés.');
  const okByMime = ALLOWED_MIME.has(file.type);
  const okByExt = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|docx?|xlsx?|pptx?)$/i.test(file.name || '');
  if (!okByMime && !okByExt) {
    throw new Error('Format non supporté (PDF, image hors SVG, Word/Excel/PowerPoint uniquement).');
  }
  if (file.size > MAX_BYTES) throw new Error('Le fichier dépasse 50 Mo.');
}

async function deleteStorageBestEffort(filePath) {
  const path = String(filePath || '').trim();
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    console.warn('[SBI Formation Docs admin] fichier Storage non supprimé :', path, error);
  }
}

async function uploadDocument({ docId, category, promotionId, title, file }) {
  validateFile(file);
  const uid = auth.currentUser?.uid || currentAdmin?.uid || '';
  const filePath = `formation-documents/${selectedFormationId}/${docId}/${sanitizeStorageName(file.name)}`;
  const fileRef = ref(storage, filePath);

  await uploadBytes(fileRef, file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: { uploadedBy: uid }
  });
  const downloadURL = await getDownloadURL(fileRef);

  await setDoc(doc(db, FORMATION_DOCS_COLLECTION, docId), {
    formationId: selectedFormationId,
    promotionId: promotionId || '',
    category,
    title: title || CATEGORY_LABELS[category] || file.name,
    fileName: file.name,
    filePath,
    downloadURL,
    contentType: file.type || 'application/octet-stream',
    size: file.size || 0,
    createdAt: serverTimestamp(),
    createdBy: uid,
    createdByName: currentAdmin?.displayName || ''
  }, { merge: false });

  return filePath;
}

async function handleUpload({ file, category, promotionId = '', title = '', docId, previousFilePath = '' }) {
  if (busy) return;
  busy = true;
  flash('Envoi du fichier…');
  try {
    const newPath = await uploadDocument({ docId, category, promotionId, title, file });
    if (previousFilePath && previousFilePath !== newPath) {
      await deleteStorageBestEffort(previousFilePath);
    }
    await loadFormationData();
    render();
    flash('Document enregistré.', 'success');
  } catch (error) {
    console.error('[SBI Formation Docs admin] envoi impossible :', error);
    render();
    flash(error?.message || 'Envoi impossible.', 'error');
  } finally {
    busy = false;
  }
}

async function handleDelete(document) {
  if (busy || !document) return;
  const label = document.title || CATEGORY_LABELS[document.category] || document.fileName || 'ce document';
  if (!window.confirm(`Supprimer « ${label} » ? Cette action est définitive.`)) return;
  busy = true;
  flash('Suppression…');
  try {
    await deleteStorageBestEffort(document.filePath);
    await deleteDoc(doc(db, FORMATION_DOCS_COLLECTION, document.id));
    await loadFormationData();
    render();
    flash('Document supprimé.', 'success');
  } catch (error) {
    console.error('[SBI Formation Docs admin] suppression impossible :', error);
    render();
    flash(error?.message || 'Suppression impossible.', 'error');
  } finally {
    busy = false;
  }
}

function renderDocLine(document, { replaceCategory, replacePromotion = '', replaceDocId } = {}) {
  const meta = [formatSize(document.size), document.fileName].filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <div class="sbi-fdoc-item">
      <div class="sbi-fdoc-item__main">
        <span class="sbi-fdoc-item__name">${escapeHtml(document.title || document.fileName || 'Document')}</span>
        <span class="sbi-fdoc-item__meta">${meta || '—'}</span>
      </div>
      <div class="sbi-fdoc-item__actions">
        ${document.downloadURL ? `<a class="sbi-fdoc-btn" href="${escapeHtml(document.downloadURL)}" target="_blank" rel="noopener">Voir</a>` : ''}
        <label class="sbi-fdoc-btn">Remplacer
          <input type="file" hidden
            data-fdoc-replace
            data-doc-id="${escapeHtml(replaceDocId || document.id)}"
            data-category="${escapeHtml(replaceCategory || document.category)}"
            data-promotion="${escapeHtml(replacePromotion)}"
            data-prev-path="${escapeHtml(document.filePath || '')}">
        </label>
        <button type="button" class="sbi-fdoc-btn danger" data-fdoc-delete="${escapeHtml(document.id)}">Supprimer</button>
      </div>
    </div>`;
}

function renderUpload({ category, promotionId = '', docId, label = 'Ajouter un fichier' }) {
  return `
    <div class="sbi-fdoc-upload">
      <label class="sbi-fdoc-btn primary">${escapeHtml(label)}
        <input type="file" hidden
          data-fdoc-upload
          data-doc-id="${escapeHtml(docId)}"
          data-category="${escapeHtml(category)}"
          data-promotion="${escapeHtml(promotionId)}">
      </label>
    </div>`;
}

function renderSingleSection(cat) {
  const docId = buildFormationDocId({ formationId: selectedFormationId, category: cat.key });
  const existing = findDoc((d) => d.id === docId);
  return `
    <div class="sbi-fdoc-section">
      <div class="sbi-fdoc-section__head">
        <span class="sbi-fdoc-section__icon">${cat.icon}</span>
        <h2 class="sbi-fdoc-section__title">${escapeHtml(cat.label)}</h2>
      </div>
      ${existing
        ? renderDocLine(existing, { replaceCategory: cat.key, replaceDocId: docId })
        : `<p class="sbi-fdoc-empty">Aucun document.</p>${renderUpload({ category: cat.key, docId, label: 'Ajouter le fichier' })}`}
    </div>`;
}

function renderPlanningSection() {
  const defaultDocId = buildFormationDocId({ formationId: selectedFormationId, category: 'planning' });
  const defaultDoc = findDoc((d) => d.id === defaultDocId);

  const promoOptions = promotions.map((p) =>
    `<option value="${escapeHtml(p.id)}" ${selectedPlanningPromo === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  let promoBlock = '';
  if (!promotions.length) {
    promoBlock = '<p class="sbi-fdoc-empty">Aucune promotion pour cette formation. Le planning par défaut s\'applique à tous.</p>';
  } else {
    let targeted = '';
    if (selectedPlanningPromo) {
      const promoDocId = buildFormationDocId({ formationId: selectedFormationId, category: 'planning', promotionId: selectedPlanningPromo });
      const promoDoc = findDoc((d) => d.id === promoDocId);
      targeted = promoDoc
        ? renderDocLine(promoDoc, { replaceCategory: 'planning', replacePromotion: selectedPlanningPromo, replaceDocId: promoDocId })
        : `<p class="sbi-fdoc-empty">Aucun planning pour cette promotion.</p>${renderUpload({ category: 'planning', promotionId: selectedPlanningPromo, docId: promoDocId, label: 'Ajouter le planning de la promotion' })}`;
    } else {
      targeted = '<p class="sbi-fdoc-empty">Sélectionne une promotion pour gérer son planning dédié.</p>';
    }

    // Récapitulatif des plannings de promotion déjà déposés.
    const promoDocs = documents
      .filter((d) => d.category === 'planning' && d.promotionId)
      .sort((a, b) => String(promoName(a.promotionId)).localeCompare(String(promoName(b.promotionId)), 'fr'));
    const list = promoDocs.length
      ? promoDocs.map((d) => `<div class="sbi-fdoc-item">
          <div class="sbi-fdoc-item__main">
            <span class="sbi-fdoc-item__name">${escapeHtml(promoName(d.promotionId))}</span>
            <span class="sbi-fdoc-item__meta">${[formatSize(d.size), d.fileName].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</span>
          </div>
          <div class="sbi-fdoc-item__actions">
            ${d.downloadURL ? `<a class="sbi-fdoc-btn" href="${escapeHtml(d.downloadURL)}" target="_blank" rel="noopener">Voir</a>` : ''}
            <button type="button" class="sbi-fdoc-btn danger" data-fdoc-delete="${escapeHtml(d.id)}">Supprimer</button>
          </div>
        </div>`).join('')
      : '';

    promoBlock = `
      <p class="sbi-fdoc-section__hint">Planning ciblé par promotion (prioritaire sur le planning par défaut pour les élèves concernés).</p>
      <div class="sbi-fdoc-upload">
        <select class="sbi-fdoc-select" data-fdoc-promo-select>
          <option value="">— Choisir une promotion —</option>
          ${promoOptions}
        </select>
      </div>
      ${targeted}
      ${list ? `<p class="sbi-fdoc-section__hint" style="margin-top:.6rem;">Plannings de promotion existants</p>${list}` : ''}`;
  }

  return `
    <div class="sbi-fdoc-section">
      <div class="sbi-fdoc-section__head">
        <span class="sbi-fdoc-section__icon">${CATEGORY_ICONS.planning}</span>
        <h2 class="sbi-fdoc-section__title">${escapeHtml(CATEGORY_LABELS.planning)}</h2>
      </div>
      <p class="sbi-fdoc-section__hint">Planning par défaut de la formation (visible par tous, sauf si un planning de promotion existe).</p>
      ${defaultDoc
        ? renderDocLine(defaultDoc, { replaceCategory: 'planning', replaceDocId: defaultDocId })
        : `<p class="sbi-fdoc-empty">Aucun planning par défaut.</p>${renderUpload({ category: 'planning', docId: defaultDocId, label: 'Ajouter le planning par défaut' })}`}
      <hr style="border:none;border-top:1px solid var(--border-color,#333);margin:1rem 0 .75rem;">
      ${promoBlock}
    </div>`;
}

function renderOtherSection() {
  const others = documents
    .filter((d) => d.category === 'autre')
    .sort((a, b) => String(a.title || a.fileName).localeCompare(String(b.title || b.fileName), 'fr'));
  const lines = others.length
    ? others.map((d) => renderDocLine(d, { replaceCategory: 'autre', replaceDocId: d.id })).join('')
    : '<p class="sbi-fdoc-empty">Aucun autre document.</p>';

  return `
    <div class="sbi-fdoc-section">
      <div class="sbi-fdoc-section__head">
        <span class="sbi-fdoc-section__icon">${CATEGORY_ICONS.autre}</span>
        <h2 class="sbi-fdoc-section__title">${escapeHtml(CATEGORY_LABELS.autre)}</h2>
      </div>
      ${lines}
      <div class="sbi-fdoc-upload" style="margin-top:.8rem;">
        <input type="text" class="sbi-fdoc-input" placeholder="Titre du document" data-fdoc-other-title>
        <label class="sbi-fdoc-btn primary">Ajouter un document
          <input type="file" hidden data-fdoc-other-file>
        </label>
      </div>
    </div>`;
}

function render() {
  const r = root();
  if (!r) return;

  const options = formations.map((f) =>
    `<option value="${escapeHtml(f.id)}" ${selectedFormationId === f.id ? 'selected' : ''}>${escapeHtml(f.titre)}</option>`
  ).join('');

  let body = '';
  if (!selectedFormationId) {
    body = '<p class="sbi-fdoc-empty">Sélectionne une formation pour gérer ses documents.</p>';
  } else {
    body = `
      ${SINGLE_CATEGORIES.map(renderSingleSection).join('')}
      ${renderPlanningSection()}
      ${renderOtherSection()}`;
  }

  r.innerHTML = `
    <div class="sbi-fdoc-head">
      <h1>Documents de formation</h1>
      <p>Gérez le livret d'accueil, le règlement intérieur, le planning, le référentiel et les autres documents mis à disposition des élèves et professeurs.</p>
    </div>
    <div class="sbi-fdoc-toolbar">
      <select class="sbi-fdoc-select" data-fdoc-formation>
        <option value="">— Choisir une formation —</option>
        ${options}
      </select>
    </div>
    <div class="sbi-fdoc-status" data-fdoc-flash></div>
    ${body}
  `;
  bindEvents();
}

function fileFromInput(input) {
  const file = input?.files?.[0] || null;
  if (input) input.value = '';
  return file;
}

function bindEvents() {
  const r = root();
  if (!r) return;

  r.querySelector('[data-fdoc-formation]')?.addEventListener('change', async (e) => {
    selectedFormationId = e.target.value;
    selectedPlanningPromo = '';
    if (!selectedFormationId) { documents = []; promotions = []; render(); return; }
    setStatus('Chargement des documents…');
    try {
      await loadFormationData();
      render();
    } catch (error) {
      console.error('[SBI Formation Docs admin] chargement impossible :', error);
      setStatus(error?.message || 'Chargement impossible.', 'error');
    }
  });

  r.querySelector('[data-fdoc-promo-select]')?.addEventListener('change', (e) => {
    selectedPlanningPromo = e.target.value;
    render();
  });

  // Upload (nouveau doc unique / planning).
  r.querySelectorAll('[data-fdoc-upload]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = fileFromInput(input);
      if (!file) return;
      handleUpload({
        file,
        category: input.dataset.category,
        promotionId: input.dataset.promotion || '',
        docId: input.dataset.docId
      });
    });
  });

  // Remplacement.
  r.querySelectorAll('[data-fdoc-replace]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = fileFromInput(input);
      if (!file) return;
      handleUpload({
        file,
        category: input.dataset.category,
        promotionId: input.dataset.promotion || '',
        docId: input.dataset.docId,
        previousFilePath: input.dataset.prevPath || ''
      });
    });
  });

  // Suppression.
  r.querySelectorAll('[data-fdoc-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = documents.find((d) => d.id === btn.dataset.fdocDelete);
      handleDelete(target);
    });
  });

  // Autres documents : titre libre + fichier.
  const otherFile = r.querySelector('[data-fdoc-other-file]');
  otherFile?.addEventListener('change', () => {
    const file = fileFromInput(otherFile);
    if (!file) return;
    const title = (r.querySelector('[data-fdoc-other-title]')?.value || '').trim();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const docId = buildFormationDocId({ formationId: selectedFormationId, category: 'autre', uniqueSuffix: suffix });
    handleUpload({ file, category: 'autre', docId, title: title || file.name });
  });
}

export function mountAdminFormationDocuments() {
  const view = document.getElementById('view-formation-documents');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_ADMIN_FORMATION_DOCUMENTS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadFormations();
      render();
    } catch (error) {
      console.warn('[SBI Formation Docs admin] accès refusé :', error);
      setStatus(error?.message || 'Accès réservé aux administrateurs.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false;
    mountedView = null;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
  window.SBI_ADMIN_FORMATION_DOCUMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminFormationDocuments(), { once: true });
} else {
  mountAdminFormationDocuments();
}
