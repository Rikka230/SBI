/**
 * SBI 8.0P.167.282 — Espace PROF « Documents de formation » (lecture seule).
 *
 * Affiche, pour les formations que le prof accompagne, les documents partagés
 * (livret, règlement, planning, référentiel, autres). Aucune édition : chaque
 * document expose un simple lien d'ouverture / téléchargement.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { loadAssignedFormationsForUser } from '/js/learning-access.js';
import {
  DOC_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  escapeHtml,
  formatSize,
  loadFormationDocumentsForFormations,
  groupByCategory
} from '/js/formation-documents/formation-docs-data.js?v=8.0P.167.282';
import {
  resolvePlanningModel,
  renderPlanningHtml,
  downloadPlanningPdf
} from '/js/formation-documents/planning-render.js?v=8.0P.167.284';

// Compteur pour générer des id uniques de placeholder planning (hydratés async).
let planningSeq = 0;
// Entrées planning « cursus » à hydrater après le rendu : id placeholder → entry.
const pendingPlanningEntries = new Map();

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let formations = [];
let formationIds = [];
let formationNameById = new Map();
let documents = [];
let selectedFormationId = ''; // '' = toutes

function root() { return document.getElementById('fdoc-root'); }

function setStatus(message, isError = false) {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-fdoc-status${isError ? ' is-error' : ''}">${escapeHtml(message)}</div>`;
}

async function loadProfile(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Compte introuvable.');
  return { uid: user.uid, data: snap.data() || {} };
}

async function loadData(user) {
  const profile = await loadProfile(user);

  formations = await loadAssignedFormationsForUser({
    uid: profile.uid,
    userData: profile.data,
    role: profile.data.role || ''
  });

  formationNameById = new Map(
    formations.map((f) => [f.id, f.titre || f.nom || f.name || f.id])
  );
  formationIds = formations.map((f) => f.id);

  if (!formationIds.length) {
    documents = [];
  } else {
    documents = await loadFormationDocumentsForFormations({ db, formationIds });
  }

  render();
}

function formationName(formationId) {
  return formationNameById.get(formationId) || formationId || '';
}

function visibleDocuments() {
  if (!selectedFormationId) return documents;
  return documents.filter((d) => d.formationId === selectedFormationId);
}

function renderItem(docItem) {
  const name = docItem.title || docItem.fileName || 'Document';
  const metaParts = [];
  const size = formatSize(docItem.size);
  if (size) metaParts.push(size);
  metaParts.push(formationName(docItem.formationId));
  const meta = metaParts.filter(Boolean).map((m) => escapeHtml(m)).join(' · ');

  // Planning généré depuis un cursus : tableau dynamique + export PDF (pas de
  // lien de téléchargement). Le prof n'a pas de promotion propre.
  if (docItem.category === 'planning' && docItem.source === 'cursus' && docItem.cursusId) {
    const phId = `fdoc-planning-${++planningSeq}`;
    pendingPlanningEntries.set(phId, docItem);
    return `
      <div class="sbi-fdoc-item sbi-fdoc-item--planning">
        <div class="sbi-fdoc-item__main">
          <div class="sbi-fdoc-item__name">${escapeHtml(name)}</div>
          <div class="sbi-fdoc-item__meta">${meta}</div>
          <div class="sbi-fdoc-planning" id="${phId}">
            <div class="sbi-fdoc-empty">Chargement du planning…</div>
          </div>
        </div>
      </div>`;
  }

  const action = docItem.downloadURL
    ? `<a class="sbi-fdoc-btn primary" href="${escapeHtml(docItem.downloadURL)}" target="_blank" rel="noopener">Ouvrir / Télécharger</a>`
    : '<span class="sbi-fdoc-empty">Fichier indisponible.</span>';

  return `
    <div class="sbi-fdoc-item">
      <div class="sbi-fdoc-item__main">
        <div class="sbi-fdoc-item__name">${escapeHtml(name)}</div>
        <div class="sbi-fdoc-item__meta">${meta}</div>
      </div>
      <div class="sbi-fdoc-item__actions">${action}</div>
    </div>`;
}

// Hydrate les placeholders planning « cursus » après insertion dans le DOM :
// résout le modèle, injecte le tableau, branche le bouton « Télécharger en PDF ».
async function hydratePlanningEntries() {
  const entries = [...pendingPlanningEntries.entries()];
  pendingPlanningEntries.clear();
  for (const [phId, entry] of entries) {
    const host = document.getElementById(phId);
    if (!host) continue;
    try {
      const promotionIds = entry.promotionId ? [entry.promotionId] : [];
      const model = await resolvePlanningModel({ db, cursusId: entry.cursusId, promotionIds });
      const title = entry.title || 'Planning';
      host.innerHTML = `
        ${renderPlanningHtml(model, { title, promotionName: model.promotionName })}
        <div class="sbi-fdoc-item__actions" style="margin-top:.6rem;">
          <button type="button" class="sbi-fdoc-btn primary" data-fdoc-planning-pdf>Télécharger en PDF</button>
        </div>`;
      const btn = host.querySelector('[data-fdoc-planning-pdf]');
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
      console.warn('[SBI Documents prof] planning cursus indisponible :', error);
      host.innerHTML = '<div class="sbi-fdoc-empty">Planning indisponible pour le moment.</div>';
    }
  }
}

function renderSection(category, docs) {
  const list = docs.length
    ? docs.map((d) => renderItem(d)).join('')
    : '<div class="sbi-fdoc-empty">Aucun document dans cette catégorie.</div>';

  return `
    <section class="sbi-fdoc-section">
      <div class="sbi-fdoc-section__head">
        <span class="sbi-fdoc-section__icon">${escapeHtml(CATEGORY_ICONS[category] || '📎')}</span>
        <span class="sbi-fdoc-section__title">${escapeHtml(CATEGORY_LABELS[category] || category)}</span>
      </div>
      ${list}
    </section>`;
}

function renderSelector() {
  if (formations.length < 2) return '';
  const options = [`<option value=""${selectedFormationId ? '' : ' selected'}>Toutes mes formations</option>`]
    .concat(formations.map((f) => {
      const id = escapeHtml(f.id);
      const label = escapeHtml(formationName(f.id));
      return `<option value="${id}"${selectedFormationId === f.id ? ' selected' : ''}>${label}</option>`;
    }))
    .join('');
  return `<select class="sbi-fdoc-select" data-fdoc-formation aria-label="Filtrer par formation">${options}</select>`;
}

function render() {
  const r = root();
  if (!r) return;

  if (!formationIds.length) {
    r.innerHTML = `
      <div class="sbi-fdoc-head">
        <h1>Documents de formation</h1>
      </div>
      <div class="sbi-fdoc-status">Aucune formation ne vous est rattachée pour le moment.</div>`;
    return;
  }

  // Nouveau rendu : on repart d'une liste vierge de placeholders planning.
  pendingPlanningEntries.clear();

  const docs = visibleDocuments();
  const grouped = groupByCategory(docs);

  const sections = DOC_CATEGORIES
    .map((cat) => renderSection(cat.key, grouped[cat.key] || []))
    .join('');

  const body = docs.length
    ? sections
    : '<div class="sbi-fdoc-status">Aucun document disponible pour le moment.</div>';

  r.innerHTML = `
    <div class="sbi-fdoc-head">
      <h1>Documents de formation</h1>
      <p class="sbi-fdoc-status">Consultez les documents partagés des formations que vous accompagnez.</p>
      ${renderSelector()}
    </div>
    ${body}`;

  bindEvents();
  hydratePlanningEntries();
}

function bindEvents() {
  const r = root();
  if (!r) return;
  const select = r.querySelector('[data-fdoc-formation]');
  if (select) {
    select.addEventListener('change', (e) => {
      selectedFormationId = e.target.value || '';
      render();
    });
  }
}

export function mountTeacherDocuments() {
  const view = document.getElementById('view-teacher-documents');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_TEACHER_DOCUMENTS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadData(user);
    } catch (error) {
      console.warn('[SBI Documents prof] chargement impossible :', error);
      setStatus(error?.message || 'Documents indisponibles pour le moment.', true);
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_TEACHER_DOCUMENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTeacherDocuments(), { once: true });
} else {
  mountTeacherDocuments();
}
