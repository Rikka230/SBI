/**
 * SBI 8.0P.167.282 — Espace ÉLÈVE « Mes documents » (lecture seule).
 *
 * Affiche les documents de la/les formation(s) de l'élève : livret d'accueil,
 * règlement intérieur, planning de SA promotion, référentiel/RNCP et autres
 * documents. Aucune édition, aucun listener temps réel.
 *
 * Périmètre : promotions de l'élève (userPromotionIds) + union des formations
 * (userFormationIds ∪ formationId des promotions de l'élève). Les documents
 * visibles sont filtrés via resolveVisibleDocuments selon les promotions.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, documentId
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  DOC_CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS,
  escapeHtml, formatSize, chunk, snapToArray,
  userFormationIds, userPromotionIds,
  loadFormationDocumentsForFormations, resolveVisibleDocuments
} from '/js/formation-documents/formation-docs-data.js?v=8.0P.167.282';
import {
  resolvePlanningModel, renderPlanningHtml, downloadPlanningPdf
} from '/js/formation-documents/planning-render.js?v=8.0P.167.298';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let caller = null; // { uid, data }
let formationIds = [];
let promotionIds = [];

function root() { return document.getElementById('fdoc-root'); }

function setStatus(message, isError = false) {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-fdoc-status${isError ? ' is-error' : ''}">${escapeHtml(message)}</div>`;
}

async function loadCaller(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Compte introuvable.');
  caller = { uid: user.uid, data: snap.data() || {} };
}

async function resolveScope() {
  formationIds = userFormationIds(caller.data);
  promotionIds = userPromotionIds(caller.data);
  // Compléter les formations à partir des promotions de l'élève.
  for (const part of chunk(promotionIds, 10)) {
    if (!part.length) continue;
    try {
      const snap = await getDocs(query(collection(db, 'promotions'), where(documentId(), 'in', part)));
      snapToArray(snap).forEach((p) => { if (p.formationId) formationIds.push(String(p.formationId)); });
    } catch (error) {
      console.warn('[SBI Documents élève] résolution formation depuis promotion échouée :', error?.message || error);
    }
  }
  formationIds = Array.from(new Set(formationIds.filter(Boolean)));
}

// Entrées planning générées depuis un cursus : id -> entry, hydratées après rendu.
let pendingCursusPlannings = [];

function isCursusPlanning(d) {
  return d && d.source === 'cursus' && d.cursusId;
}

function renderCursusPlanningItem(d) {
  const name = d.title || 'Planning';
  // Placeholder rendu d'abord ; rempli en asynchrone par hydrateCursusPlannings().
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
      // SBI 8.0P.167.298 — Planning CIBLÉ : on date le plan sur la promotion de
      // l'entrée (sa promotionId, qui fait partie des promotions de l'élève) ;
      // pour un planning par défaut (sans promotionId), on retombe sur toutes
      // les promotions de l'élève pour récupérer un éventuel plan daté.
      const planningPromotionIds = entry.promotionId ? [entry.promotionId] : promotionIds;
      const model = await resolvePlanningModel({ db, cursusId: entry.cursusId, promotionIds: planningPromotionIds });
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
      console.warn('[SBI Documents élève] planning cursus introuvable :', error?.message || error);
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
        <h1>Mes documents</h1>
        <p>Retrouve les documents de ta formation.</p>
      </div>
      <div class="sbi-fdoc-status">Aucun document disponible pour ta formation pour le moment.</div>`;
    return;
  }

  // Collecte les plannings générés depuis un cursus pour hydratation asynchrone.
  pendingCursusPlannings = DOC_CATEGORIES
    .flatMap((cat) => (visible[cat.key] || []))
    .filter(isCursusPlanning);

  r.innerHTML = `
    <div class="sbi-fdoc-head">
      <h1>Mes documents</h1>
      <p>Retrouve les documents de ta formation : livret d'accueil, règlement intérieur, planning, référentiel et autres documents.</p>
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

export function mountStudentDocuments() {
  const view = document.getElementById('view-student-documents');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_STUDENT_DOCUMENTS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) { setStatus('Connecte-toi pour accéder à tes documents.', true); return; }
      await loadCaller(user);
      await loadData();
    } catch (error) {
      console.warn('[SBI Documents élève] chargement impossible :', error);
      setStatus(error?.message || 'Impossible de charger tes documents.', true);
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_STUDENT_DOCUMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountStudentDocuments(), { once: true });
} else {
  mountStudentDocuments();
}
