/**
 * SBI 8.0P.167.287 — Espace PROF « Livrets d'apprentissage ».
 *
 * Le rôle teacher = responsable pédagogique / formateur SBI.
 * Lecture des livrets de ses promotions/formations + validation/dévalidation
 * des 6 périodes de suivi (Cloud Function validateBookletPeriod, qui accepte
 * admin OU teacher) + export PDF. Lecture seule sur tout le reste.
 *
 * Pas de listener live : on recharge après chaque action.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  LABELS, PERIOD_FIELDS, periodFieldLabel,
  escapeHtml, formatDate, computeCompletion, statusMeta,
  validateBookletPeriod, loadBookletsForTeacher
} from '/js/booklet/booklet-data.js?v=8.0P.167.301';
import { requestMergedBookletPdf } from '/js/booklet/booklet-pdf.js?v=8.0P.167.301';
import { resolveBookletPlanningModel } from '/js/formation-documents/planning-render.js?v=8.0P.167.301';
import { loadAssignedFormationsForUser } from '/js/learning-access.js';

const TEACHER_ROLES = ['teacher', 'prof', 'professeur', 'enseignant'];

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let caller = null;            // { uid, isAdmin, data }
let formations = [];          // formations rattachées au prof
let booklets = [];            // livrets des promotions du prof
let bookletById = new Map();
let selectedBookletId = '';
let busy = false;

function root() { return document.getElementById('booklet-root'); }

function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-booklet-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}

function badge(label, soft = false) {
  return `<span class="sbi-booklet-badge${soft ? ' is-soft' : ''}">${escapeHtml(label)}</span>`;
}

async function loadCaller(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Compte introuvable.');
  const data = snap.data() || {};
  const role = String(data.role || '').toLowerCase();
  const isAdmin = data.isGod === true || role === 'admin';
  const isTeacher = TEACHER_ROLES.includes(role);
  if (!isAdmin && !isTeacher) throw new Error('Accès réservé aux responsables pédagogiques.');
  caller = { uid: user.uid, isAdmin, data };
}

/**
 * Promotions du prof : on récupère ses formations rattachées, puis toutes les
 * promotions de ces formations (collection `promotions`, champ formationId).
 * Renvoie { promotionIds, promotionNameById, formationNameById }.
 */
async function loadScope() {
  formations = await loadAssignedFormationsForUser({
    uid: caller.uid,
    userData: caller.data,
    role: caller.isAdmin ? 'admin' : 'teacher'
  });
  const formationNameById = new Map();
  formations.forEach((f) => formationNameById.set(f.id, String(f.titre || f.nom || f.name || '').trim()));

  const formationIds = formations.map((f) => f.id).filter(Boolean);
  const promotionNameById = new Map();
  const promotionIds = [];

  // Firestore `in` accepte au plus 30 valeurs : on découpe par lots.
  for (let i = 0; i < formationIds.length; i += 30) {
    const chunk = formationIds.slice(i, i + 30);
    if (!chunk.length) continue;
    try {
      const snap = await getDocs(query(collection(db, 'promotions'), where('formationId', 'in', chunk)));
      snap.forEach((d) => {
        const data = d.data() || {};
        promotionIds.push(d.id);
        promotionNameById.set(d.id, String(data.nom || data.titre || data.name || 'Promotion').trim() || 'Promotion');
      });
    } catch (error) {
      console.warn('[SBI Livrets prof] requête promotions échouée :', error?.message || error);
    }
  }

  return { promotionIds, formationIds, promotionNameById, formationNameById };
}

async function loadData() {
  const { promotionIds, formationIds, promotionNameById, formationNameById } = await loadScope();

  // 8.0P.167.301 — Lecture UNIQUEMENT par formationId : la règle Firestore
  // n'autorise le prof à lire un livret que via `formation.profs` (fonction
  // formationDocHasCurrentUser), PAS via promotionId (qui exige que la promotion
  // soit dans le user.promotionIds — champ élève, jamais prof). La requête par
  // promotionId échouait donc toujours (« Missing or insufficient permissions »).
  // Tout livret porte un formationId, donc la requête par formation couvre tout.
  booklets = formationIds.length
    ? await loadBookletsForTeacher({ db, promotionIds: [], formationIds })
    : [];

  // Enrichit chaque livret avec des noms lisibles (sinon retombe sur les champs stockés).
  booklets.forEach((b) => {
    b._promotionName = promotionNameById.get(b.promotionId) || b.promotionName || b.promotionLabel || '';
    b._formationName = formationNameById.get(b.formationId) || b.formationName || b.formationTitle || '';
  });
  booklets.sort((a, b) => String(a.studentName || '').localeCompare(String(b.studentName || ''), 'fr', { sensitivity: 'base' }));

  bookletById = new Map(booklets.map((b) => [b.id, b]));
  if (selectedBookletId && !bookletById.has(selectedBookletId)) selectedBookletId = '';

  render();
}

/* ---------------------------------------------------------------------------
 * Rendu
 * ------------------------------------------------------------------------- */
function render() {
  const r = root();
  if (!r) return;

  r.innerHTML = `
    <div class="sbi-booklet-head">
      <h1>Livrets d'apprentissage</h1>
      <p>Suivi des livrets de vos promotions : consultation et validation des périodes.</p>
    </div>
    ${!booklets.length
      ? '<div class="sbi-booklet-empty">Aucun livret rattaché à vos promotions pour le moment.</div>'
      : `<div class="sbi-booklet-shell" style="display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:1.25rem;align-items:start;">
          <div class="sbi-booklet-list" data-booklet-list>${renderList()}</div>
          <div class="sbi-booklet-detail" data-booklet-detail>${renderDetail()}</div>
        </div>`}
  `;
  bindEvents();
}

function renderList() {
  return booklets.map((b) => {
    const sm = statusMeta(b.status);
    const { rate } = computeCompletion(b);
    const name = b.studentName || b.id || 'Apprenti';
    const scope = [b._formationName, b._promotionName].filter(Boolean).join(' · ');
    return `
      <button type="button" class="sbi-booklet-section" style="display:block;width:100%;text-align:left;cursor:pointer;${selectedBookletId === b.id ? 'border-color:var(--bk-accent);' : ''}" data-booklet-id="${escapeHtml(b.id)}">
        <div style="font-weight:700;">${escapeHtml(name)}</div>
        ${scope ? `<div class="sbi-booklet-section__hint" style="margin:.25rem 0 .4rem;">${escapeHtml(scope)}</div>` : ''}
        <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;">
          ${badge(sm.label, true)}
          <span class="sbi-booklet-section__hint" style="margin:0;">Complétion ${rate}%</span>
        </div>
      </button>`;
  }).join('');
}

function renderDetail() {
  if (!selectedBookletId) {
    return '<div class="sbi-booklet-empty">Sélectionnez un livret à gauche pour le consulter.</div>';
  }
  const b = bookletById.get(selectedBookletId);
  if (!b) return '<div class="sbi-booklet-empty">Livret introuvable.</div>';

  const sm = statusMeta(b.status);
  const { rate, missing } = computeCompletion(b);
  const meta = [
    b.studentName && `${LABELS.fields.studentName} : ${b.studentName}`,
    b._formationName && `${LABELS.fields.formationTitle} : ${b._formationName}`,
    b._promotionName && `${LABELS.fields.promotionLabel} : ${b._promotionName}`,
    b.tutorName && `${LABELS.fields.tutorName} : ${b.tutorName}`
  ].filter(Boolean);

  return `
    <div class="sbi-booklet-section">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <h2 style="border:0;margin:0 0 .4rem;">${escapeHtml(b.studentName || 'Apprenti')}</h2>
          <div class="sbi-booklet-meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
          ${badge(sm.label)}
          <button type="button" class="sbi-booklet-btn ghost" data-booklet-pdf>Télécharger le dossier (PDF)</button>
          <span class="sbi-booklet-status" data-pdf-status hidden></span>
        </div>
      </div>
      <div class="sbi-booklet-completion">
        <div class="sbi-booklet-completion__label"><span>Complétion globale</span><strong>${rate}%</strong></div>
        <div class="sbi-booklet-progress"><div class="sbi-booklet-progress__bar" style="width:${rate}%;"></div></div>
        ${missing.length ? `<ul class="sbi-booklet-missing">${missing.slice(0, 8).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}${missing.length > 8 ? `<li>… (+${missing.length - 8})</li>` : ''}</ul>` : ''}
      </div>
    </div>

    ${renderHeaderSections(b)}

    <div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.periods)}</h2>
      ${renderPeriods(b)}
    </div>

    <p class="sbi-booklet-status" data-booklet-action-status hidden></p>
  `;
}

function readField(value) {
  return `<div class="sbi-booklet-readonly">${escapeHtml(value || '')}</div>`;
}

function renderHeaderSections(b) {
  const rows = [
    [LABELS.fields.studentName, b.studentName],
    [LABELS.fields.employerName, b.employerName || (b.employer && b.employer.name)],
    [LABELS.fields.tutorName, b.tutorName || (b.tutor && b.tutor.name)],
    [LABELS.fields.contractStart, formatDate(b.contractStart)],
    [LABELS.fields.contractEnd, formatDate(b.contractEnd)]
  ];
  return `
    <div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.identity)} &amp; ${escapeHtml(LABELS.sections.contract)}</h2>
      <div class="sbi-booklet-grid">
        ${rows.map(([label, value]) => `
          <div class="sbi-booklet-field">
            <label>${escapeHtml(label)}</label>
            ${readField(value)}
          </div>`).join('')}
      </div>
    </div>`;
}

function renderPeriods(b) {
  const periods = Array.isArray(b.periods) ? b.periods : [];
  if (!periods.length) return '<p class="sbi-booklet-status">Aucune période enregistrée.</p>';

  return periods.map((p, idx) => {
    const plabel = (p && p.label) || `Période ${idx + 1}`;
    const validated = !!(p && p.sbiValidatedAt);
    const dates = [formatDate(p.startDate), formatDate(p.endDate)].filter(Boolean).join(' → ');

    const fields = PERIOD_FIELDS
      .filter((key) => p && String(p[key] || '').trim() !== '')
      .map((key) => `
        <div class="sbi-booklet-field is-full">
          <label>${escapeHtml(periodFieldLabel(key))}</label>
          ${readField(p[key])}
        </div>`).join('');

    return `
      <div class="sbi-booklet-section" style="margin-top:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;">
          <div class="sbi-booklet-subtitle" style="margin:0;">${escapeHtml(plabel)}${dates ? ` — ${escapeHtml(dates)}` : ''}</div>
          ${validated ? badge('Période validée', true) : ''}
        </div>
        <div class="sbi-booklet-grid" style="margin-top:.6rem;">
          ${fields || '<p class="sbi-booklet-status" style="grid-column:1/-1;">Aucun élément renseigné pour cette période.</p>'}
        </div>
        <div class="sbi-booklet-actions">
          ${validated
            ? `<button type="button" class="sbi-booklet-btn" data-booklet-unvalidate="${escapeHtml(String(p.id || ''))}">Retirer la validation</button>`
            : `<button type="button" class="sbi-booklet-btn primary" data-booklet-validate="${escapeHtml(String(p.id || ''))}">Valider la période</button>`}
        </div>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------- */
function actionStatusEl() { return root()?.querySelector('[data-booklet-action-status]'); }
function setActionStatus(message, tone = 'muted') {
  const el = actionStatusEl();
  if (el) { el.hidden = !message; el.textContent = message; el.dataset.tone = tone; }
}

async function handleValidate(periodId, decision) {
  if (busy || !selectedBookletId || !periodId) return;
  busy = true;
  setActionStatus(decision === 'validate' ? 'Validation…' : 'Mise à jour…');
  try {
    await validateBookletPeriod({ bookletId: selectedBookletId, periodId, decision });
    setActionStatus(decision === 'validate' ? 'Période validée.' : 'Validation retirée.', 'success');
    busy = false;
    await loadData();
  } catch (error) {
    console.error('[SBI Livrets prof] validation impossible :', error);
    setActionStatus(error?.message || 'Action impossible.', 'error');
    busy = false;
  }
}

/* Export PDF d'un livret : dossier complet (corps + annexes autorisées au prof,
 * filtrées côté serveur). Récupère le planning réel de « Documents de formation ». */
async function exportPdf(b, button) {
  if (!b) return;
  const statusEl = root()?.querySelector('[data-pdf-status]');
  const setPdfStatus = (msg, tone = 'muted') => {
    if (statusEl) { statusEl.hidden = !msg; statusEl.textContent = msg || ''; statusEl.dataset.tone = tone; }
  };
  if (button) button.disabled = true;
  setPdfStatus('Génération du dossier PDF en cours… (jusqu\'à 30 s)');
  try {
    const p = await resolveBookletPlanningModel({ db, booklet: b }).catch(() => null);
    const planningOpts = p ? {
      planningModel: p.model,
      planningTitle: p.title,
      planningPromotionName: p.promotionName,
      planningUploadedUrl: p.uploadedUrl
    } : {};
    const res = await requestMergedBookletPdf(b, { withAnnexes: true, ...planningOpts });
    if (res?.fallback) setPdfStatus('Service serveur indisponible : ouverture de la version imprimable.');
    else setPdfStatus('Dossier PDF généré.', 'success');
  } catch (error) {
    console.warn('[SBI Livrets prof] génération du dossier PDF impossible :', error);
    setPdfStatus(error?.message || 'Génération impossible.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function bindEvents() {
  const r = root();
  if (!r) return;

  r.querySelector('[data-booklet-list]')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-booklet-id]');
    if (item) { selectedBookletId = item.dataset.bookletId; render(); }
  });

  const detail = r.querySelector('[data-booklet-detail]');
  detail?.addEventListener('click', (e) => {
    const pdfBtn = e.target.closest('[data-booklet-pdf]');
    if (pdfBtn) {
      const b = bookletById.get(selectedBookletId);
      if (b) exportPdf(b, pdfBtn);
      return;
    }
    const validateBtn = e.target.closest('[data-booklet-validate]');
    if (validateBtn) { handleValidate(validateBtn.dataset.bookletValidate, 'validate'); return; }
    const unvalidateBtn = e.target.closest('[data-booklet-unvalidate]');
    if (unvalidateBtn) { handleValidate(unvalidateBtn.dataset.bookletUnvalidate, 'unvalidate'); }
  });
}

/* ---------------------------------------------------------------------------
 * Montage
 * ------------------------------------------------------------------------- */
export function mountTeacherBooklets() {
  const view = document.getElementById('view-teacher-livrets');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_TEACHER_BOOKLETS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCaller(user);
      await loadData();
    } catch (error) {
      console.warn('[SBI Livrets prof] accès refusé :', error);
      setStatus(error?.message || 'Accès réservé aux responsables pédagogiques.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_TEACHER_BOOKLETS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTeacherBooklets(), { once: true });
} else {
  mountTeacherBooklets();
}
