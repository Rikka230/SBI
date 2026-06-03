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
import {
  loadCursusOptions,
  resolvePlanningModel,
  renderPlanningHtml,
  downloadPlanningPdf
} from '/js/formation-documents/planning-render.js?v=8.0P.167.296';

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
let cursusOptions = [];
// Cache des aperçus de planning générés depuis un cursus, indexés par docId.
const planningPreviews = new Map();

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
    cursusOptions = [];
    planningPreviews.clear();
    return;
  }
  planningPreviews.clear();
  const [docs, promos, cursus] = await Promise.all([
    loadFormationDocuments({ db, formationId: selectedFormationId }),
    loadPromotionsForFormation({ db, formationId: selectedFormationId }),
    loadCursusOptions({ db, formationId: selectedFormationId }).catch((error) => {
      console.warn('[SBI Formation Docs admin] cursus non chargés :', error);
      return [];
    })
  ]);
  documents = docs;
  promotions = promos;
  cursusOptions = Array.isArray(cursus) ? cursus : [];
  if (selectedPlanningPromo && !promotions.some((p) => p.id === selectedPlanningPromo)) {
    selectedPlanningPromo = '';
  }
  // SBI 8.0P.167.296 — Persistance du planning CIBLÉ : si aucune promo n'est
  // sélectionnée mais qu'au moins une promotion a déjà un planning enregistré
  // (PDF ou cursus), on la sélectionne d'office pour que son état « ✓ Enregistré »
  // s'affiche immédiatement au (re)chargement, comme le planning par défaut.
  if (!selectedPlanningPromo) {
    const firstPromoWithPlanning = promotions.find((p) =>
      documents.some((d) => d.category === 'planning' && d.promotionId === p.id));
    if (firstPromoWithPlanning) selectedPlanningPromo = firstPromoWithPlanning.id;
  }
}

function findDoc(predicate) {
  return documents.find(predicate) || null;
}

function promoName(promotionId) {
  return promotions.find((p) => p.id === promotionId)?.name || promotionId;
}

function formationName() {
  return formations.find((f) => f.id === selectedFormationId)?.titre || selectedFormationId;
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

// SBI 8.0P.167.287 — Enregistre les réglages « Annexe livret d'apprentissage »
// d'un document PDF : écrit EXACTEMENT les 5 champs attendus par la Cloud Function
// de fusion (includeInApprenticeshipBooklet, appendixTitle, appendixOrder Number,
// appendixVisibility, version), puis recharge la vue.
async function handleSaveAppendix(docId) {
  if (busy || !docId) return;
  const document = findDoc((d) => d.id === docId);
  if (!document || !isPdfFileDocument(document)) {
    flash('Document PDF introuvable.', 'error');
    return;
  }
  const r = root();
  const sel = (attr) => r?.querySelector(`[${attr}][data-doc-id="${cssAttr(docId)}"]`);

  const include = Boolean(sel('data-fdoc-appendix-include')?.checked);
  const appendixTitleRaw = (sel('data-fdoc-appendix-title')?.value || '').trim();
  const appendixTitle = appendixTitleRaw || document.title || '';
  const orderRaw = sel('data-fdoc-appendix-order')?.value;
  const orderNum = Number(orderRaw);
  const appendixOrder = Number.isFinite(orderNum) ? orderNum : 1;
  const visRaw = sel('data-fdoc-appendix-visibility')?.value || 'tous';
  const appendixVisibility = ['tous', 'eleve', 'tuteur', 'admin'].includes(visRaw) ? visRaw : 'tous';
  const version = (sel('data-fdoc-appendix-version')?.value || '').trim();

  const VALID_VISIBILITIES = ['tous', 'eleve', 'tuteur', 'admin'];
  if (!VALID_VISIBILITIES.includes(appendixVisibility)) return;

  busy = true;
  flash('Enregistrement de l\'annexe…');
  try {
    await setDoc(doc(db, FORMATION_DOCS_COLLECTION, docId), {
      includeInApprenticeshipBooklet: include,
      appendixTitle,
      appendixOrder,
      appendixVisibility,
      version
    }, { merge: true });
    await loadFormationData();
    render();
    flash('Réglages d\'annexe enregistrés.', 'success');
  } catch (error) {
    console.error('[SBI Formation Docs admin] enregistrement annexe impossible :', error);
    render();
    flash(error?.message || 'Enregistrement impossible.', 'error');
  } finally {
    busy = false;
  }
}

// Définit un planning « généré depuis un cursus » pour une portée (formation-wide
// ou une promotion). Écrase un éventuel PDF de même portée (supprime son fichier
// Storage best-effort), puis recharge.
async function handleSetCursusPlanning({ docId, promotionId = '', cursusId }) {
  if (busy) return;
  const cursusIdClean = String(cursusId || '').trim();
  if (!cursusIdClean) { flash('Choisis un cursus.', 'error'); return; }
  const option = cursusOptions.find((c) => c.id === cursusIdClean);
  const cursusName = option?.title || cursusIdClean;
  busy = true;
  flash('Enregistrement du planning…');
  try {
    const previous = findDoc((d) => d.id === docId);
    if (previous?.filePath) {
      await deleteStorageBestEffort(previous.filePath);
    }
    const uid = auth.currentUser?.uid || currentAdmin?.uid || '';
    await setDoc(doc(db, FORMATION_DOCS_COLLECTION, docId), {
      category: 'planning',
      source: 'cursus',
      cursusId: cursusIdClean,
      cursusName,
      formationId: selectedFormationId,
      promotionId: promotionId || '',
      title: `Planning — ${cursusName}`,
      createdAt: serverTimestamp(),
      createdBy: uid,
      createdByName: currentAdmin?.displayName || ''
    }, { merge: false });
    planningPreviews.delete(docId);
    await loadFormationData();
    render();
    flash('Planning défini depuis le cursus.', 'success');
  } catch (error) {
    console.error('[SBI Formation Docs admin] planning cursus impossible :', error);
    render();
    flash(error?.message || 'Enregistrement impossible.', 'error');
  } finally {
    busy = false;
  }
}

// Charge (et met en cache) le modèle de planning d'une entrée source:'cursus',
// puis injecte son aperçu HTML dans le conteneur dédié.
async function loadPlanningPreview(document) {
  if (!document || planningPreviews.has(document.id)) return;
  try {
    const model = await resolvePlanningModel({
      db,
      cursusId: document.cursusId || '',
      promotionIds: document.promotionId ? [document.promotionId] : []
    });
    planningPreviews.set(document.id, model);
  } catch (error) {
    console.warn('[SBI Formation Docs admin] aperçu planning indisponible :', error);
    planningPreviews.set(document.id, null);
  }
  const r = root();
  const host = r?.querySelector(`[data-fdoc-planning-preview="${cssAttr(document.id)}"]`);
  if (host) host.innerHTML = renderPlanningPreviewBody(document);
}

function renderPlanningPreviewBody(document) {
  if (!planningPreviews.has(document.id)) {
    return '<p class="sbi-fdoc-empty">Chargement de l\'aperçu…</p>';
  }
  const model = planningPreviews.get(document.id);
  if (!model) {
    return '<p class="sbi-fdoc-empty">Aperçu indisponible.</p>';
  }
  return renderPlanningHtml(model, {
    title: document.title || 'Planning',
    promotionName: document.promotionId ? promoName(document.promotionId) : ''
  });
}

function handleDownloadPlanningPdf(document) {
  const model = planningPreviews.get(document.id);
  if (!model) { flash('Aperçu pas encore chargé, réessaie dans un instant.', 'error'); return; }
  downloadPlanningPdf(model, {
    id: document.id,
    title: document.title || 'Planning de formation',
    formationName: formationName(),
    promotionName: document.promotionId ? promoName(document.promotionId) : ''
  });
}

function cssAttr(value) {
  return String(value).replace(/"/g, '\\"');
}

// Rend une entrée planning générée depuis un cursus (aperçu + PDF + suppression).
function renderCursusPlanningLine(document) {
  const id = escapeHtml(document.id);
  const sub = [document.cursusName, document.promotionId ? promoName(document.promotionId) : '']
    .filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <div class="sbi-fdoc-item">
      <div class="sbi-fdoc-item__main">
        <span class="sbi-fdoc-item__name">${escapeHtml(document.title || 'Planning')}</span>
        <span class="sbi-fdoc-item__meta" style="color:#15803d; font-weight:600;">✓ Enregistré en base${sub ? ` · ${sub}` : ' (depuis un cursus)'}</span>
      </div>
      <div class="sbi-fdoc-item__actions">
        <button type="button" class="sbi-fdoc-btn primary" data-fdoc-planning-pdf="${id}">Télécharger en PDF</button>
        <button type="button" class="sbi-fdoc-btn danger" data-fdoc-delete="${id}">Supprimer</button>
      </div>
    </div>
    <div class="sbi-fdoc-planning-preview" data-fdoc-planning-preview="${id}" style="margin:.5rem 0 .25rem;">${renderPlanningPreviewBody(document)}</div>`;
}

// Bloc « Générer depuis un cursus » pour une portée donnée (formation ou promotion).
function renderCursusPicker({ docId, promotionId = '', selectedCursusId = '' }) {
  if (!cursusOptions.length) {
    return '<p class="sbi-fdoc-section__hint" style="margin-top:.5rem;">Aucun cursus disponible pour générer un planning.</p>';
  }
  const opts = cursusOptions.map((c) =>
    `<option value="${escapeHtml(c.id)}"${selectedCursusId && selectedCursusId === c.id ? ' selected' : ''}>${escapeHtml(c.title)}${c.itemCount ? ` (${c.itemCount})` : ''}</option>`
  ).join('');
  return `
    <div class="sbi-fdoc-upload" style="margin-top:.5rem; flex-wrap:wrap; gap:.5rem;">
      <span class="sbi-fdoc-section__hint" style="flex-basis:100%; margin:0;">Générer depuis un cursus</span>
      <select class="sbi-fdoc-select" data-fdoc-cursus-select data-doc-id="${escapeHtml(docId)}" data-promotion="${escapeHtml(promotionId)}">
        <option value="">— Choisir un cursus —</option>
        ${opts}
      </select>
      <button type="button" class="sbi-fdoc-btn primary"
        data-fdoc-cursus-set data-doc-id="${escapeHtml(docId)}" data-promotion="${escapeHtml(promotionId)}">
        💾 Sauvegarder ce planning
      </button>
    </div>`;
}

// Rend l'état d'une portée planning : PDF uploadé (comportement actuel),
// planning généré depuis un cursus, ou rien (upload + picker cursus).
function renderPlanningScope({ docId, promotionId = '', uploadLabel }) {
  const existing = findDoc((d) => d.id === docId);
  if (existing && existing.source === 'cursus') {
    return renderCursusPlanningLine(existing) + renderCursusPicker({ docId, promotionId, selectedCursusId: existing.cursusId || '' });
  }
  if (existing) {
    return renderDocLine(existing, { replaceCategory: 'planning', replacePromotion: promotionId, replaceDocId: docId })
      + renderCursusPicker({ docId, promotionId });
  }
  return `<p class="sbi-fdoc-empty">Aucun planning.</p>`
    + renderUpload({ category: 'planning', promotionId, docId, label: uploadLabel })
    + renderCursusPicker({ docId, promotionId });
}

// SBI 8.0P.167.287 — Détecte une entrée document basée sur un fichier PDF :
// elle doit posséder un fichier (filePath ou downloadURL) ET être un PDF
// (contentType contenant 'pdf' ou fileName se terminant par .pdf).
function isPdfFileDocument(document) {
  if (!document) return false;
  const hasFile = Boolean(document.filePath || document.downloadURL);
  if (!hasFile) return false;
  const byMime = /pdf/i.test(String(document.contentType || ''));
  const byExt = /\.pdf$/i.test(String(document.fileName || ''));
  return byMime || byExt;
}

// SBI 8.0P.167.287 — Bloc « Annexe livret d'apprentissage » : permet de marquer
// un document PDF comme annexe à fusionner automatiquement à la suite du livret.
// Écrit 5 champs (cf. handleSaveAppendix) consommés par une Cloud Function de
// fusion PDF. Réservé aux documents PDF (cf. isPdfFileDocument).
// Catégories institutionnelles jointes AUTOMATIQUEMENT au livret (mode hybride,
// aligné sur la Cloud Function) — sauf décochage explicite.
const AUTO_ANNEX_CATEGORIES = ['livret', 'reglement', 'referentiel', 'planning'];

function renderAppendixBlock(document) {
  if (!isPdfFileDocument(document)) return '';
  const id = escapeHtml(document.id);
  const isAuto = AUTO_ANNEX_CATEGORIES.includes(document.category);
  // Institutionnel : joint par défaut (coché) sauf opt-out explicite (=== false).
  // « Autre » : opt-in (coché uniquement si === true).
  const isChecked = isAuto
    ? document.includeInApprenticeshipBooklet !== false
    : document.includeInApprenticeshipBooklet === true;
  const checked = isChecked ? ' checked' : '';
  const includeLabel = isAuto
    ? "Joint au livret d'apprentissage par défaut — décocher pour exclure"
    : "Ajouter au livret d'apprentissage";
  const appendixTitle = escapeHtml(document.appendixTitle || document.title || '');
  const order = Number.isFinite(Number(document.appendixOrder)) && document.appendixOrder !== '' && document.appendixOrder != null
    ? Number(document.appendixOrder)
    : 1;
  const visibility = String(document.appendixVisibility || 'tous');
  const version = escapeHtml(document.version || '');
  const visOptions = [
    ['tous', 'Tous'],
    ['eleve', 'Élève'],
    ['tuteur', 'Tuteur'],
    ['admin', 'Admin uniquement']
  ].map(([value, label]) =>
    `<option value="${value}"${visibility === value ? ' selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');

  return `
    <div class="sbi-fdoc-appendix" data-fdoc-appendix data-doc-id="${id}"
      style="margin:.4rem 0 .75rem; padding:.6rem .75rem; border:1px solid var(--border-color,#333); border-radius:8px; display:flex; flex-direction:column; gap:.5rem;">
      <label style="display:flex; align-items:center; gap:.5rem; font-weight:600;">
        <input type="checkbox" data-fdoc-appendix-include data-doc-id="${id}"${checked}>
        ${escapeHtml(includeLabel)}
      </label>
      <div class="sbi-fdoc-upload" style="flex-wrap:wrap; gap:.5rem; margin:0;">
        <label style="display:flex; flex-direction:column; gap:.2rem; flex:1 1 220px;">
          <span class="sbi-fdoc-section__hint" style="margin:0;">Titre dans le sommaire</span>
          <input type="text" class="sbi-fdoc-input" data-fdoc-appendix-title data-doc-id="${id}"
            placeholder="Titre dans le sommaire" value="${appendixTitle}">
        </label>
        <label style="display:flex; flex-direction:column; gap:.2rem; flex:0 1 120px;">
          <span class="sbi-fdoc-section__hint" style="margin:0;">Ordre dans les annexes</span>
          <input type="number" class="sbi-fdoc-input" data-fdoc-appendix-order data-doc-id="${id}"
            min="0" step="1" value="${order}">
        </label>
        <label style="display:flex; flex-direction:column; gap:.2rem; flex:0 1 160px;">
          <span class="sbi-fdoc-section__hint" style="margin:0;">Visibilité</span>
          <select class="sbi-fdoc-select" data-fdoc-appendix-visibility data-doc-id="${id}">
            ${visOptions}
          </select>
        </label>
        <label style="display:flex; flex-direction:column; gap:.2rem; flex:1 1 160px;">
          <span class="sbi-fdoc-section__hint" style="margin:0;">Version / date (optionnel)</span>
          <input type="text" class="sbi-fdoc-input" data-fdoc-appendix-version data-doc-id="${id}"
            placeholder="Ex. v1 · 2026-06-03" value="${version}">
        </label>
      </div>
      <div class="sbi-fdoc-upload" style="margin:0;">
        <button type="button" class="sbi-fdoc-btn primary" data-fdoc-appendix-save data-doc-id="${id}">
          Enregistrer l'annexe
        </button>
      </div>
    </div>`;
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
    </div>
    ${renderAppendixBlock(document)}`;
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
      targeted = renderPlanningScope({ docId: promoDocId, promotionId: selectedPlanningPromo, uploadLabel: 'Ajouter le planning de la promotion' });
    } else {
      targeted = '<p class="sbi-fdoc-empty">Sélectionne une promotion pour gérer son planning dédié.</p>';
    }

    // Récapitulatif des plannings de promotion déjà déposés.
    const promoDocs = documents
      .filter((d) => d.category === 'planning' && d.promotionId)
      .sort((a, b) => String(promoName(a.promotionId)).localeCompare(String(promoName(b.promotionId)), 'fr'));
    const list = promoDocs.length
      ? promoDocs.map((d) => {
          const meta = d.source === 'cursus'
            ? `Cursus · ${escapeHtml(d.cursusName || '—')}`
            : ([formatSize(d.size), d.fileName].filter(Boolean).map(escapeHtml).join(' · ') || '—');
          return `<div class="sbi-fdoc-item">
          <div class="sbi-fdoc-item__main">
            <span class="sbi-fdoc-item__name">${escapeHtml(promoName(d.promotionId))}</span>
            <span class="sbi-fdoc-item__meta">${meta}</span>
          </div>
          <div class="sbi-fdoc-item__actions">
            ${d.downloadURL ? `<a class="sbi-fdoc-btn" href="${escapeHtml(d.downloadURL)}" target="_blank" rel="noopener">Voir</a>` : ''}
            <button type="button" class="sbi-fdoc-btn danger" data-fdoc-delete="${escapeHtml(d.id)}">Supprimer</button>
          </div>
        </div>`;
        }).join('')
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
      ${renderPlanningScope({ docId: defaultDocId, promotionId: '', uploadLabel: 'Ajouter le planning par défaut' })}
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

  // Planning depuis un cursus : définition.
  r.querySelectorAll('[data-fdoc-cursus-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const promotionId = btn.dataset.promotion || '';
      const select = r.querySelector(`[data-fdoc-cursus-select][data-doc-id="${cssAttr(docId)}"]`);
      handleSetCursusPlanning({ docId, promotionId, cursusId: select?.value || '' });
    });
  });

  // SBI 8.0P.167.287 — Enregistrement des réglages d'annexe livret (PDF).
  r.querySelectorAll('[data-fdoc-appendix-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleSaveAppendix(btn.dataset.docId);
    });
  });

  // Téléchargement PDF d'un planning généré depuis un cursus.
  r.querySelectorAll('[data-fdoc-planning-pdf]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = documents.find((d) => d.id === btn.dataset.fdocPlanningPdf);
      handleDownloadPlanningPdf(target);
    });
  });

  // Chargement asynchrone des aperçus de planning « cursus ».
  documents
    .filter((d) => d.category === 'planning' && d.source === 'cursus')
    .forEach((d) => {
      if (r.querySelector(`[data-fdoc-planning-preview="${cssAttr(d.id)}"]`)) {
        loadPlanningPreview(d);
      }
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
