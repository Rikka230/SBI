/**
 * =======================================================================
 * SBI 8.0P.167.300 — Espace TUTEUR « Documents de formation » (lecture seule)
 * -----------------------------------------------------------------------
 * Calqué sur student-documents.js. Le tuteur n'a pas de formations propres :
 * son périmètre est déduit des livrets de ses apprentis
 * (apprenticeshipBooklets where tutorId == lui) → formationId + promotionId.
 * Les documents visibles sont ensuite résolus comme pour l'élève.
 *
 * Aucune édition, aucun listener temps réel.
 * =======================================================================
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  DOC_CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS,
  escapeHtml, formatSize,
  loadFormationDocumentsForFormations, resolveVisibleDocuments
} from '/js/formation-documents/formation-docs-data.js?v=8.0P.167.300';
import {
  resolvePlanningModel, renderPlanningHtml, downloadPlanningPdf
} from '/js/formation-documents/planning-render.js?v=8.0P.167.300';
import { loadBookletsForTutor } from '/js/booklet/booklet-data.js?v=8.0P.167.300';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let currentUid = null;
let formationIds = [];
let promotionIds = [];

function root() { return document.getElementById('fdoc-root'); }

function setStatus(message, isError = false) {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-fdoc-status${isError ? ' is-error' : ''}">${escapeHtml(message)}</div>`;
}

// Périmètre du tuteur : déduit des livrets de ses apprentis.
async function resolveScope() {
  formationIds = [];
  promotionIds = [];
  const booklets = await loadBookletsForTutor({ db, tutorId: currentUid });
  const fids = new Set();
  const pids = new Set();
  (booklets || []).forEach((b) => {
    const fid = String(b.formationId || '').trim();
    if (fid) fids.add(fid);
    const pid = String(b.promotionId || '').trim();
    if (pid) pids.add(pid);
  });
  formationIds = Array.from(fids);
  promotionIds = Array.from(pids);
}

// Entrées planning générées depuis un cursus : id -> entry, hydratées après rendu.
let pendingCursusPlannings = [];

function isCursusPlanning(d) {
  return d && d.source === 'cursus' && d.cursusId;
}

function renderCursusPlanningItem(d) {
  const name = d.title || 'Planning';
  return `
    <div class="sbi-fdoc-item sbi-fdoc-item--planning" data-planning-id="${escapeHtml(d.id || '')}">
      <div class="sbi-fdoc-item__main" style="width:100%;">
        <div class="sbi-fdoc-item__name">${escapeHtml(name)}</div>
        <div class="sbi-fdoc-planning-body" data-planning-body>
          <div class="sbi-fdoc-status">Génération du planning…</div>
        </div>
      </div>
    </div>`;
}

function renderItem(d) {
  if (isCursusPlanning(d)) return renderCursusPlanningItem(d);
  const name = d.title || d.fileName || 'Document';
  const size = formatSize(d.size);
  const url = d.downloadURL || '';
  return `
    <div class="sbi-fdoc-item">
      <div class="sbi-fdoc-item__main">
        <div class="sbi-fdoc-item__name">${escapeHtml(name)}</div>
        ${size ? `<div class="sbi-fdoc-item__meta">${escapeHtml(size)}</div>` : ''}
      </div>
      <div class="sbi-fdoc-item__actions">
        ${url
          ? `<a class="sbi-fdoc-btn primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ouvrir / Télécharger</a>`
          : '<span class="sbi-fdoc-empty">Fichier indisponible</span>'}
      </div>
    </div>`;
}

// Après l'insertion du HTML, calcule et injecte le tableau de planning + bouton PDF.
async function hydrateCursusPlannings() {
  const entries = pendingCursusPlannings;
  pendingCursusPlannings = [];
  for (const entry of entries) {
    const host = document.querySelector(`.sbi-fdoc-item--planning[data-planning-id="${(window.CSS && CSS.escape) ? CSS.escape(entry.id || '') : (entry.id || '')}"] [data-planning-body]`);
    if (!host) continue;
    try {
      const model = await resolvePlanningModel({ db, cursusId: entry.cursusId, promotionIds });
      host.innerHTML = `
        ${renderPlanningHtml(model, { title: entry.title || 'Planning', promotionName: model.promotionName })}
        <div class="sbi-fdoc-item__actions" style="margin-top:.6rem;">
          <button type="button" class="sbi-fdoc-btn primary" data-planning-pdf>Télécharger en PDF</button>
        </div>`;
      const btn = host.querySelector('[data-planning-pdf]');
      if (btn) {
        btn.addEventListener('click', () => {
          downloadPlanningPdf(model, {
            id: entry.id,
            title: entry.title || 'Planning de formation',
            formationName: '',
            promotionName: model.promotionName
          });
        });
      }
    } catch (error) {
      console.warn('[SBI Documents tuteur] planning cursus introuvable :', error?.message || error);
      host.innerHTML = '<div class="sbi-fdoc-empty">Planning indisponible.</div>';
    }
  }
}

function renderSection(cat, docs) {
  const items = (docs || []).map(renderItem).join('');
  return `
    <section class="sbi-fdoc-section">
      <div class="sbi-fdoc-section__head">
        <span class="sbi-fdoc-section__icon">${CATEGORY_ICONS[cat.key] || '📄'}</span>
        <h2 class="sbi-fdoc-section__title">${escapeHtml(CATEGORY_LABELS[cat.key] || cat.key)}</h2>
      </div>
      ${items || '<div class="sbi-fdoc-empty">Aucun document</div>'}
    </section>`;
}

function render(visible) {
  const r = root();
  if (!r) return;
  const total = DOC_CATEGORIES.reduce((sum, cat) => sum + ((visible[cat.key] || []).length), 0);

  if (!formationIds.length || total === 0) {
    r.innerHTML = `
      <div class="sbi-fdoc-head">
        <h1>Documents de formation</h1>
        <p>Retrouvez les documents de la formation de votre apprenti.</p>
      </div>
      <div class="sbi-fdoc-status">Aucun document disponible pour le moment.</div>`;
    return;
  }

  pendingCursusPlannings = DOC_CATEGORIES
    .flatMap((cat) => (visible[cat.key] || []))
    .filter(isCursusPlanning);

  r.innerHTML = `
    <div class="sbi-fdoc-head">
      <h1>Documents de formation</h1>
      <p>Retrouvez les documents de la formation de votre apprenti : livret d'accueil, règlement intérieur, planning, référentiel et autres documents.</p>
    </div>
    ${DOC_CATEGORIES.map((cat) => renderSection(cat, visible[cat.key])).join('')}`;

  if (pendingCursusPlannings.length) hydrateCursusPlannings();
}

async function loadData() {
  await resolveScope();
  if (!formationIds.length) {
    render({ livret: [], reglement: [], planning: [], referentiel: [], autre: [] });
    return;
  }
  const docs = await loadFormationDocumentsForFormations({ db, formationIds });
  const visible = resolveVisibleDocuments(docs, promotionIds);
  render(visible);
}

export function mountTutorDocuments() {
  const view = document.getElementById('view-tutor-documents');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_TUTOR_DOCUMENTS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) { setStatus('Connectez-vous pour accéder aux documents.', true); return; }
      currentUid = user.uid;
      await loadData();
    } catch (error) {
      console.warn('[SBI Documents tuteur] chargement impossible :', error);
      setStatus(error?.message || 'Impossible de charger les documents.', true);
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null; currentUid = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_TUTOR_DOCUMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTutorDocuments(), { once: true });
} else {
  mountTutorDocuments();
}
