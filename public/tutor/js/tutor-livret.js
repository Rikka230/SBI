/**
 * =======================================================================
 * SBI 8.0P.167.287 — Espace TUTEUR : livret d'apprentissage (édition)
 * -----------------------------------------------------------------------
 * Lit l'id du livret depuis l'URL (?id=), loadBooklet, vérifie que
 * booklet.tutorId === user.uid (sinon accès refusé). Le tuteur édite
 * UNIQUEMENT ses champs (canEditField('tutor', ...)) : sections employer,
 * tutor, absencesEntreprise ; par période : objectivesEvaluation,
 * tutorPositivePoints, tutorImprovementAxes, tutorReport, tutorSignedAt.
 * Le reste (apprenti + validations SBI) est en lecture seule. Verrou :
 * période lockedAt → lecture seule. Sauvegarde via updateBookletSection.
 * =======================================================================
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  LABELS,
  periodFieldLabel,
  PERIOD_FIELDS,
  canEditField,
  escapeHtml,
  formatDate,
  computeCompletion,
  statusMeta,
  updateBookletSection,
  loadBooklet
} from '/js/booklet/booklet-data.js?v=8.0P.167.289';
import { downloadBookletPdf } from '/js/booklet/booklet-pdf.js?v=8.0P.167.289';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let currentUid = null;
let booklet = null;
let activeTab = 'overview'; // overview | section:<name> | period:<id>

const ROLE = 'tutor';

/* Champs tuteur d'une période, dans l'ordre d'affichage. */
const TUTOR_PERIOD_FIELDS = [
  'objectivesEvaluation',
  'tutorPositivePoints',
  'tutorImprovementAxes',
  'tutorReport'
];

/* Sections éditables par le tuteur + leurs champs (clé doc → label). */
const TUTOR_SECTIONS = {
  employer: {
    label: LABELS.sections.employer,
    path: 'employer',
    fields: [
      { key: 'name', label: 'Nom de la structure' },
      { key: 'address', label: 'Adresse' },
      { key: 'contact', label: 'Contact (email / téléphone)' }
    ]
  },
  tutor: {
    label: LABELS.sections.tutor,
    path: 'tutor',
    fields: [
      { key: 'name', label: "Maître d'apprentissage" },
      { key: 'role', label: 'Fonction' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Téléphone' }
    ]
  }
};

function root() { return document.getElementById('tutor-livret-root'); }

function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-booklet-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}

function bookletIdFromUrl() {
  // En PJAX, l'URL réelle est dans window.SBI_APP_SHELL_CURRENT_URL (pas toujours
  // window.location). On lit les deux + le hash en repli.
  const candidates = [];
  try { if (window.SBI_APP_SHELL_CURRENT_URL) candidates.push(new URL(window.SBI_APP_SHELL_CURRENT_URL, window.location.origin)); } catch (_) {}
  try { candidates.push(new URL(window.location.href)); } catch (_) {}
  for (const u of candidates) {
    const fromQuery = u.searchParams.get('id');
    if (fromQuery) return fromQuery;
    try {
      const fromHash = new URLSearchParams(String(u.hash || '').replace(/^#/, '')).get('id');
      if (fromHash) return fromHash;
    } catch (_) {}
  }
  return '';
}

function hasValue(v) {
  return v != null && String(v).trim() !== '';
}

function isBookletLocked() {
  return booklet && booklet.status === 'locked';
}

function periodById(id) {
  const periods = Array.isArray(booklet?.periods) ? booklet.periods : [];
  return periods.find((p) => p && p.id === id) || null;
}

/* ---------------------------------------------------------------------
 * Rendu des champs
 * ------------------------------------------------------------------- */
function readonlyField(label, value, full = true) {
  return `<div class="sbi-booklet-field ${full ? 'is-full' : ''}">
    <label>${escapeHtml(label)}</label>
    <div class="sbi-booklet-readonly">${escapeHtml(value || '')}</div>
  </div>`;
}

function editableTextarea(label, fieldKey, value, disabled) {
  return `<div class="sbi-booklet-field is-full">
    <label for="fld-${escapeHtml(fieldKey)}">${escapeHtml(label)}</label>
    <textarea id="fld-${escapeHtml(fieldKey)}" class="sbi-booklet-textarea"
      data-field="${escapeHtml(fieldKey)}" ${disabled ? 'disabled' : ''}>${escapeHtml(value || '')}</textarea>
  </div>`;
}

function editableInput(label, fieldKey, value, disabled) {
  return `<div class="sbi-booklet-field">
    <label for="fld-${escapeHtml(fieldKey)}">${escapeHtml(label)}</label>
    <input id="fld-${escapeHtml(fieldKey)}" class="sbi-booklet-input" type="text"
      data-field="${escapeHtml(fieldKey)}" value="${escapeHtml(value || '')}" ${disabled ? 'disabled' : ''}>
  </div>`;
}

/* ---------------------------------------------------------------------
 * En-tête + onglets
 * ------------------------------------------------------------------- */
function headHtml() {
  const studentName = booklet.studentName
    || (booklet.identity && (booklet.identity.fullName || booklet.identity.name))
    || 'Apprenti';
  const sub = [booklet.formationTitle, booklet.promotionLabel].filter(Boolean).map(escapeHtml).join(' — ');
  const sm = statusMeta(booklet.status);
  const completion = computeCompletion(booklet);

  return `<div class="sbi-booklet-head">
    <h1>${escapeHtml(studentName)}
      <span class="sbi-booklet-badge" style="background:${sm.color}; vertical-align:middle;">${escapeHtml(sm.label)}</span>
    </h1>
    ${sub ? `<p>${sub}</p>` : ''}
  </div>
  <div class="sbi-booklet-completion">
    <div class="sbi-booklet-completion__label">
      <span>Complétion du livret</span><strong>${completion.rate}%</strong>
    </div>
    <div class="sbi-booklet-progress"><div class="sbi-booklet-progress__bar" style="width:${completion.rate}%;"></div></div>
  </div>`;
}

function tabsHtml() {
  const periods = Array.isArray(booklet.periods) ? booklet.periods : [];
  const tabs = [];
  tabs.push({ key: 'overview', label: 'Aperçu' });
  Object.keys(TUTOR_SECTIONS).forEach((s) => tabs.push({ key: `section:${s}`, label: TUTOR_SECTIONS[s].label }));
  periods.forEach((p, i) => {
    const pending = !(hasValue(p?.tutorReport) || hasValue(p?.tutorSignedAt));
    tabs.push({ key: `period:${p?.id || `p${i + 1}`}`, label: (p && p.label) || `Période ${i + 1}`, dot: pending });
  });

  return `<div class="sbi-booklet-tabs">${tabs.map((t) => `
    <button type="button" class="sbi-booklet-tab ${activeTab === t.key ? 'is-active' : ''}" data-tab="${escapeHtml(t.key)}">
      ${escapeHtml(t.label)}${t.dot ? ' •' : ''}
    </button>`).join('')}</div>`;
}

/* ---------------------------------------------------------------------
 * Vues
 * ------------------------------------------------------------------- */
function overviewHtml() {
  const identity = booklet.identity || {};
  const headTable = `<div class="sbi-booklet-grid">
    ${readonlyField(LABELS.fields.studentName, booklet.studentName || identity.fullName || identity.name, false)}
    ${readonlyField(LABELS.fields.formationTitle, booklet.formationTitle, false)}
    ${readonlyField(LABELS.fields.promotionLabel, booklet.promotionLabel, false)}
    ${readonlyField(LABELS.fields.contractStart, formatDate(booklet.contractStart), false)}
    ${readonlyField(LABELS.fields.contractEnd, formatDate(booklet.contractEnd), false)}
  </div>`;

  const sg = booklet.signatures || {};
  const sigTable = `<div class="sbi-booklet-grid">
    ${readonlyField(LABELS.roles.student, sg.studentSignedAt ? formatDate(sg.studentSignedAt) : 'Non signé', false)}
    ${readonlyField(LABELS.roles.tutor, sg.tutorSignedAt ? formatDate(sg.tutorSignedAt) : 'Non signé', false)}
    ${readonlyField(LABELS.roles.sbi, sg.sbiValidatedAt ? formatDate(sg.sbiValidatedAt) : 'Non validé', false)}
  </div>`;

  return `<div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.identity)}</h2>
      <p class="sbi-booklet-section__hint">Renseigné par l'apprenti et le centre de formation — lecture seule.</p>
      ${headTable}
    </div>
    <div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.signatures)}</h2>
      ${sigTable}
    </div>`;
}

function sectionViewHtml(sectionKey) {
  const def = TUTOR_SECTIONS[sectionKey];
  if (!def) return overviewHtml();
  const data = (booklet[def.path] && typeof booklet[def.path] === 'object') ? booklet[def.path] : {};
  const locked = isBookletLocked();

  const fields = def.fields.map((f) => {
    const editable = canEditField(ROLE, 'section', sectionKey) && !locked;
    return editableInput(f.label, `${def.path}.${f.key}`, data[f.key], !editable);
  }).join('');

  return `<div class="sbi-booklet-section" data-section="${escapeHtml(sectionKey)}">
    <h2>${escapeHtml(def.label)}</h2>
    ${locked ? '<p class="sbi-booklet-section__hint">Livret verrouillé : lecture seule.</p>' : ''}
    <div class="sbi-booklet-grid">${fields}</div>
    <div class="sbi-booklet-actions">
      <button type="button" class="sbi-booklet-btn primary" data-save-section="${escapeHtml(sectionKey)}" ${locked ? 'disabled' : ''}>Enregistrer</button>
    </div>
    <div class="sbi-booklet-status" data-section-status></div>
  </div>`;
}

function periodViewHtml(periodId) {
  const period = periodById(periodId);
  if (!period) return overviewHtml();
  const locked = isBookletLocked() || !!period.lockedAt;

  // Bloc apprenti (lecture seule) : tous les champs hors champs tuteur.
  const studentFields = PERIOD_FIELDS
    .filter((k) => !TUTOR_PERIOD_FIELDS.includes(k))
    .map((k) => readonlyField(periodFieldLabel(k), period[k]))
    .join('');

  // Bloc tuteur (éditable selon permissions + verrou).
  const tutorFields = TUTOR_PERIOD_FIELDS.map((k) => {
    const editable = canEditField(ROLE, 'period', k) && !locked;
    return editableTextarea(periodFieldLabel(k), k, period[k], !editable);
  }).join('');

  const signed = hasValue(period.tutorSignedAt);
  const dates = [formatDate(period.startDate), formatDate(period.endDate)].filter(Boolean).join(' → ');

  return `<div class="sbi-booklet-section" data-period="${escapeHtml(periodId)}">
    <h2>${escapeHtml(period.label || 'Période')}${dates ? ` <span class="sbi-booklet-section__hint" style="font-weight:400;">${escapeHtml(dates)}</span>` : ''}</h2>
    ${locked ? '<p class="sbi-booklet-section__hint">Période verrouillée : lecture seule.</p>' : ''}

    <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.roles.student)} — ${escapeHtml(LABELS.sections.project)}</div>
    <div class="sbi-booklet-grid">${studentFields}</div>

    <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.roles.tutor)} — Mon bilan</div>
    <div class="sbi-booklet-grid">${tutorFields}</div>

    <div class="sbi-booklet-grid">
      ${readonlyField(periodFieldLabel('studentSignedAt'), period.studentSignedAt ? formatDate(period.studentSignedAt) : 'Non signé', false)}
      ${readonlyField(periodFieldLabel('tutorSignedAt'), signed ? formatDate(period.tutorSignedAt) : 'Non signé', false)}
      ${readonlyField(periodFieldLabel('sbiValidatedAt'), period.sbiValidatedAt ? formatDate(period.sbiValidatedAt) : 'Non validé', false)}
    </div>

    <div class="sbi-booklet-actions">
      <button type="button" class="sbi-booklet-btn primary" data-save-period="${escapeHtml(periodId)}" ${locked ? 'disabled' : ''}>Compléter mon bilan</button>
      <button type="button" class="sbi-booklet-btn" data-sign-period="${escapeHtml(periodId)}" ${locked || signed ? 'disabled' : ''}>${signed ? 'Bilan signé' : 'Signer'}</button>
    </div>
    <div class="sbi-booklet-status" data-period-status></div>
  </div>`;
}

function bodyHtml() {
  if (activeTab.startsWith('section:')) return sectionViewHtml(activeTab.slice('section:'.length));
  if (activeTab.startsWith('period:')) return periodViewHtml(activeTab.slice('period:'.length));
  return overviewHtml();
}

function render() {
  const r = root();
  if (!r) return;
  r.innerHTML = `${headHtml()}
    <div class="sbi-booklet-actions" style="margin:0 0 .5rem;">
      <button type="button" class="sbi-booklet-btn ghost" data-download-pdf>Télécharger PDF</button>
    </div>
    ${tabsHtml()}
    ${bodyHtml()}`;
  wire();
}

/* ---------------------------------------------------------------------
 * Sauvegardes
 * ------------------------------------------------------------------- */
function collectFields(container) {
  const out = {};
  container.querySelectorAll('[data-field]').forEach((el) => {
    if (el.disabled) return;
    out[el.dataset.field] = el.value;
  });
  return out;
}

async function reload() {
  booklet = await loadBooklet({ db, bookletId: booklet.id });
}

async function saveSection(sectionKey, btn) {
  const def = TUTOR_SECTIONS[sectionKey];
  if (!def) return;
  const card = btn.closest('[data-section]');
  const statusEl = card?.querySelector('[data-section-status]');
  const raw = collectFields(card);
  // Reconstituer les clés simples (path.key → key).
  const fields = {};
  Object.keys(raw).forEach((k) => {
    const parts = k.split('.');
    fields[parts[parts.length - 1]] = raw[k];
  });

  btn.disabled = true;
  if (statusEl) { statusEl.dataset.tone = 'muted'; statusEl.textContent = 'Enregistrement…'; }
  try {
    await updateBookletSection({
      bookletId: booklet.id,
      target: { kind: 'section', section: sectionKey },
      fields
    });
    await reload();
    render();
  } catch (error) {
    console.warn('[SBI Tuteur] enregistrement section échoué :', error);
    if (statusEl) { statusEl.dataset.tone = 'error'; statusEl.textContent = error?.message || 'Échec de l\'enregistrement.'; }
    btn.disabled = false;
  }
}

async function savePeriod(periodId, btn, extraFields = {}) {
  const card = btn.closest('[data-period]');
  const statusEl = card?.querySelector('[data-period-status]');
  const fields = Object.assign(card ? collectFields(card) : {}, extraFields);

  btn.disabled = true;
  if (statusEl) { statusEl.dataset.tone = 'muted'; statusEl.textContent = 'Enregistrement…'; }
  try {
    await updateBookletSection({
      bookletId: booklet.id,
      target: { kind: 'period', periodId },
      fields
    });
    await reload();
    render();
  } catch (error) {
    console.warn('[SBI Tuteur] enregistrement période échoué :', error);
    if (statusEl) { statusEl.dataset.tone = 'error'; statusEl.textContent = error?.message || 'Échec de l\'enregistrement.'; }
    btn.disabled = false;
  }
}

async function signPeriod(periodId, btn) {
  if (!canEditField(ROLE, 'period', 'tutorSignedAt')) return;
  // Pose tutorSignedAt + enregistre aussi les champs courants du bilan.
  await savePeriod(periodId, btn, { tutorSignedAt: new Date().toISOString() });
}

/* ---------------------------------------------------------------------
 * Câblage des événements
 * ------------------------------------------------------------------- */
function wire() {
  const r = root();
  if (!r) return;

  r.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); });
  });

  r.querySelector('[data-download-pdf]')?.addEventListener('click', () => downloadBookletPdf(booklet));

  const saveSec = r.querySelector('[data-save-section]');
  saveSec?.addEventListener('click', () => saveSection(saveSec.dataset.saveSection, saveSec));

  const savePer = r.querySelector('[data-save-period]');
  savePer?.addEventListener('click', () => savePeriod(savePer.dataset.savePeriod, savePer));

  const signPer = r.querySelector('[data-sign-period]');
  signPer?.addEventListener('click', () => signPeriod(signPer.dataset.signPeriod, signPer));
}

/* ---------------------------------------------------------------------
 * Montage
 * ------------------------------------------------------------------- */
export function mountTutorBooklet() {
  const view = document.getElementById('view-tutor-livret');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_TUTOR_BOOKLET_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  const id = bookletIdFromUrl();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) { setStatus('Connexion requise.', 'error'); return; }
    currentUid = user.uid;
    if (!id) {
      const v = document.getElementById('tutor-livret-root') || mountedView;
      if (v) v.innerHTML = '<div class="sbi-booklet-status">Aucun apprenti sélectionné. <a href="/tutor/dashboard.html" data-sbi-href="/tutor/dashboard.html">Reviens au tableau de bord</a> et ouvre le livret d\'un apprenti.</div>';
      return;
    }
    try {
      booklet = await loadBooklet({ db, bookletId: id });
      if (!booklet) { setStatus('Livret introuvable.', 'error'); return; }
      if (booklet.tutorId !== currentUid) {
        booklet = null;
        setStatus('Accès refusé : ce livret ne vous est pas rattaché.', 'error');
        return;
      }
      activeTab = 'overview';
      render();
    } catch (error) {
      console.warn('[SBI Tuteur] chargement du livret échoué :', error);
      setStatus(error?.message || 'Impossible de charger ce livret.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null; booklet = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_TUTOR_BOOKLET_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTutorBooklet(), { once: true });
} else {
  mountTutorBooklet();
}
