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

function renderItem(d) {
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

  r.innerHTML = `
    <div class="sbi-fdoc-head">
      <h1>Mes documents</h1>
      <p>Retrouve les documents de ta formation : livret d'accueil, règlement intérieur, planning, référentiel et autres documents.</p>
    </div>
    ${DOC_CATEGORIES.map((cat) => renderSection(cat, visible[cat.key])).join('')}`;
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
