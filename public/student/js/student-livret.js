/**
 * SBI 8.0P.167.287 — Espace ÉLÈVE « Mon livret d'apprentissage ».
 *
 * L'apprenti consulte SON livret (bookletId === user.uid) et édite UNIQUEMENT
 * ses propres champs : la section « identité » et, par période, les champs
 * apprenti (objectifs, ressources, moyens, recueil de projet, bilan, signature
 * élève). Les champs tuteur / validation SBI sont affichés en lecture seule.
 * Verrou : une période verrouillée (lockedAt) ou un livret 'locked' passe en
 * lecture seule. Onglets : Identité, Formation/contrat, Planning, Absences,
 * Périodes 1→6, Documents/annexes, Export PDF. Complétion + manquants + PDF.
 * Aucun listener temps réel : on (re)charge à la demande.
 */

import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  LABELS,
  PERIOD_FIELDS,
  periodFieldLabel,
  canEditField,
  editableFieldsFor,
  escapeHtml,
  formatDate,
  computeCompletion,
  statusMeta,
  updateBookletSection,
  loadBookletByStudent
} from '/js/booklet/booklet-data.js?v=8.0P.167.289';
import { downloadBookletPdf } from '/js/booklet/booklet-pdf.js?v=8.0P.167.289';

/* =====================================================================
 * État du module
 * ===================================================================== */
let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;

let currentUid = '';
let booklet = null;
let activeTab = 'identity';
let busy = false;

// Champs éditables par l'apprenti (synchronisés avec le socle / la CF).
const STUDENT_PERIOD_FIELDS = editableFieldsFor('student', 'period'); // inclut studentSignedAt
const STUDENT_PERIOD_TEXT_FIELDS = STUDENT_PERIOD_FIELDS.filter((k) => k !== 'studentSignedAt');

// Champs « tuteur » d'une période (lecture seule pour l'apprenti).
const TUTOR_PERIOD_FIELDS = ['objectivesEvaluation', 'tutorPositivePoints', 'tutorImprovementAxes', 'tutorReport'];

// Champs de la section identité éditables par l'apprenti.
const IDENTITY_FIELDS = [
  { key: 'fullName',   label: "Nom et prénom" },
  { key: 'birthDate',  label: 'Date de naissance' },
  { key: 'birthPlace', label: 'Lieu de naissance' },
  { key: 'address',    label: 'Adresse postale', full: true },
  { key: 'phone',      label: 'Téléphone' },
  { key: 'email',      label: 'E-mail' }
];

/* =====================================================================
 * Helpers DOM / statut
 * ===================================================================== */
function root() { return document.getElementById('booklet-root'); }

function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-booklet-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}

function setInlineStatus(message, tone = 'muted') {
  const el = root()?.querySelector('[data-booklet-status]');
  if (el) {
    el.hidden = !message;
    el.textContent = message || '';
    el.dataset.tone = tone;
  }
}

function isLocked() {
  return booklet ? String(booklet.status || '') === 'locked' : false;
}

function periodLocked(period) {
  return isLocked() || !!(period && period.lockedAt);
}

function periods() {
  return Array.isArray(booklet?.periods) ? booklet.periods : [];
}

/* =====================================================================
 * Onglets
 * ===================================================================== */
function tabDefs() {
  const tabs = [
    { key: 'identity',  label: 'Identité' },
    { key: 'formation', label: 'Formation / contrat' },
    { key: 'planning',  label: 'Planning' },
    { key: 'absences',  label: 'Absences' }
  ];
  periods().forEach((p, i) => {
    tabs.push({ key: `period:${p?.id || `p${i + 1}`}`, label: p?.label || `Période ${i + 1}` });
  });
  tabs.push({ key: 'documents', label: 'Documents / annexes' });
  tabs.push({ key: 'export', label: 'Export PDF' });
  return tabs;
}

/* =====================================================================
 * Fabriques de champs
 * ===================================================================== */
function readonlyField(label, value, { full = false, hint = '' } = {}) {
  return `
    <div class="sbi-booklet-field ${full ? 'is-full' : ''}">
      <label>${escapeHtml(label)}${hint ? ` <span class="sbi-booklet-field__hint">${escapeHtml(hint)}</span>` : ''}</label>
      <div class="sbi-booklet-readonly">${escapeHtml(String(value ?? '')).replace(/\n/g, '<br>')}</div>
    </div>`;
}

function editableField(name, label, value, { textarea = true, full = true, disabled = false, hint = '' } = {}) {
  const safe = escapeHtml(String(value ?? ''));
  const dis = disabled ? 'disabled' : '';
  const control = textarea
    ? `<textarea class="sbi-booklet-textarea" data-field="${escapeHtml(name)}" ${dis}>${safe}</textarea>`
    : `<input type="text" class="sbi-booklet-input" data-field="${escapeHtml(name)}" value="${safe}" ${dis}>`;
  return `
    <div class="sbi-booklet-field ${full ? 'is-full' : ''}">
      <label>${escapeHtml(label)}${hint ? ` <span class="sbi-booklet-field__hint">${escapeHtml(hint)}</span>` : ''}</label>
      ${control}
    </div>`;
}

/* =====================================================================
 * Rendu : Identité (éditable par l'apprenti)
 * ===================================================================== */
function renderIdentity() {
  const identity = (booklet && typeof booklet.identity === 'object' && booklet.identity) || {};
  const locked = isLocked();
  const canEdit = canEditField('student', 'section', 'identity') && !locked;

  const fields = IDENTITY_FIELDS.map((f) => {
    const value = identity[f.key] != null ? identity[f.key] : (f.key === 'fullName' ? (booklet.studentName || '') : '');
    return canEdit
      ? editableField(`identity.${f.key}`, f.label, value, { textarea: f.full === true, full: f.full === true })
      : readonlyField(f.label, value, { full: f.full === true });
  }).join('');

  return `
    <div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.identity)}</h2>
      ${locked ? '<p class="sbi-booklet-section__hint">Ce livret est verrouillé : consultation seule.</p>'
        : '<p class="sbi-booklet-section__hint">Renseigne tes informations personnelles.</p>'}
      <div class="sbi-booklet-grid">${fields}</div>
      ${canEdit ? `
        <p class="sbi-booklet-status" data-booklet-status hidden></p>
        <div class="sbi-booklet-actions">
          <button type="button" class="sbi-booklet-btn primary" data-save-section="identity">Enregistrer mon identité</button>
        </div>` : ''}
    </div>`;
}

/* =====================================================================
 * Rendu : Formation / contrat (lecture seule)
 * ===================================================================== */
function renderFormation() {
  const employer = booklet.employer || {};
  const tutor = booklet.tutor || {};
  const contract = booklet.contract || {};
  return `
    <div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.formation)}</h2>
      <p class="sbi-booklet-section__hint">Informations renseignées par l'équipe SBI (lecture seule).</p>
      <div class="sbi-booklet-grid">
        ${readonlyField(LABELS.fields.formationTitle, booklet.formationTitle || booklet.formationName || '')}
        ${readonlyField(LABELS.fields.promotionLabel, booklet.promotionLabel || booklet.promotionName || '')}
        ${readonlyField(LABELS.fields.contractStart, formatDate(booklet.contractStart) || (contract.start || ''))}
        ${readonlyField(LABELS.fields.contractEnd, formatDate(booklet.contractEnd) || (contract.end || ''))}
      </div>
      <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.sections.employer)}</div>
      <div class="sbi-booklet-grid">
        ${readonlyField(LABELS.fields.employerName, booklet.employerName || employer.name || '')}
        ${readonlyField('Adresse', employer.address || '')}
        ${readonlyField('Contact', employer.contact || employer.email || employer.phone || '')}
      </div>
      <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.sections.tutor)}</div>
      <div class="sbi-booklet-grid">
        ${readonlyField(LABELS.fields.tutorName, booklet.tutorName || tutor.name || tutor.fullName || '')}
        ${readonlyField('Fonction', tutor.role || tutor.fonction || '')}
        ${readonlyField('Contact', tutor.email || tutor.contact || tutor.phone || '')}
      </div>
    </div>`;
}

/* =====================================================================
 * Rendu : Planning (lecture seule)
 * ===================================================================== */
function renderPlanning() {
  const list = periods();
  const rows = list.length
    ? list.map((p, i) => {
        const dates = [formatDate(p.startDate), formatDate(p.endDate)].filter(Boolean).join(' → ') || '—';
        const sm = statusMeta(p.status);
        return `<tr>
          <td>${escapeHtml(p.label || `Période ${i + 1}`)}</td>
          <td>${escapeHtml(dates)}</td>
          <td><span class="sbi-booklet-badge is-soft" style="--bk-accent:${escapeHtml(sm.color)};">${escapeHtml(sm.label)}</span></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="3">Aucune période planifiée.</td></tr>';
  return `
    <div class="sbi-booklet-section">
      <h2>Planning des périodes</h2>
      <p class="sbi-booklet-section__hint">Calendrier prévisionnel défini par l'équipe SBI (lecture seule).</p>
      <table class="sbi-booklet-table" style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;padding:.4rem .6rem;">Période</th>
          <th style="text-align:left;padding:.4rem .6rem;">Dates</th>
          <th style="text-align:left;padding:.4rem .6rem;">Statut</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* =====================================================================
 * Rendu : Absences (lecture seule)
 * ===================================================================== */
function renderAbsenceList(items, title) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return `<p class="sbi-booklet-section__hint">${escapeHtml(title)} : aucune absence enregistrée.</p>`;
  const rows = list.map((a) => {
    const start = formatDate(a.startDate || a.start || a.date);
    const end = formatDate(a.endDate || a.end);
    const period = end && end !== start ? `${start} → ${end}` : (start || '—');
    const reason = String(a.reason || a.motif || a.label || '').trim() || '—';
    return `<tr><td style="padding:.4rem .6rem;">${escapeHtml(period)}</td><td style="padding:.4rem .6rem;">${escapeHtml(reason)}</td></tr>`;
  }).join('');
  return `
    <div class="sbi-booklet-subtitle">${escapeHtml(title)}</div>
    <table class="sbi-booklet-table" style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:.4rem .6rem;">Période</th>
        <th style="text-align:left;padding:.4rem .6rem;">Motif</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderAbsences() {
  const abs = booklet.absences || {};
  return `
    <div class="sbi-booklet-section">
      <h2>Absences</h2>
      <p class="sbi-booklet-section__hint">Absences saisies par l'équipe SBI et la structure (lecture seule).</p>
      ${renderAbsenceList(abs.cfmfs, LABELS.sections.absencesCfmfs)}
      ${renderAbsenceList(abs.entreprise, LABELS.sections.absencesEntreprise)}
    </div>`;
}

/* =====================================================================
 * Rendu : Période (apprenti éditable + tuteur/validation lecture seule)
 * ===================================================================== */
function renderPeriod(periodKey) {
  const list = periods();
  const period = list.find((p, i) => (p?.id || `p${i + 1}`) === periodKey) || null;
  if (!period) {
    return '<div class="sbi-booklet-section"><p class="sbi-booklet-empty">Période introuvable.</p></div>';
  }
  const locked = periodLocked(period);
  const sm = statusMeta(period.status);
  const dates = [formatDate(period.startDate), formatDate(period.endDate)].filter(Boolean).join(' → ');

  // Bloc apprenti : champs texte éditables (sauf si verrouillé).
  const studentBlocks = STUDENT_PERIOD_TEXT_FIELDS.map((key) => {
    const value = period[key];
    return locked
      ? readonlyField(periodFieldLabel(key), value)
      : editableField(key, periodFieldLabel(key), value, { textarea: true, full: true });
  }).join('');

  // Signature élève : bouton / état.
  const studentSigned = period.studentSignedAt;
  const sigBlock = `
    <div class="sbi-booklet-field is-full">
      <label>${escapeHtml(periodFieldLabel('studentSignedAt'))}</label>
      ${studentSigned
        ? `<div class="sbi-booklet-readonly">Signée le ${escapeHtml(formatDate(studentSigned) || '—')}</div>`
        : (locked
            ? '<div class="sbi-booklet-readonly">Non signée</div>'
            : '<div><button type="button" class="sbi-booklet-btn" data-sign-period="' + escapeHtml(periodKey) + '">Signer cette période</button></div>')}
    </div>`;

  // Bloc tuteur (lecture seule).
  const tutorBlocks = TUTOR_PERIOD_FIELDS.map((key) => readonlyField(periodFieldLabel(key), period[key])).join('');

  // Validations (lecture seule).
  const validations = `
    <div class="sbi-booklet-grid">
      ${readonlyField(periodFieldLabel('tutorSignedAt'), period.tutorSignedAt ? formatDate(period.tutorSignedAt) : 'Non signée')}
      ${readonlyField(periodFieldLabel('sbiValidatedAt'), period.sbiValidatedAt ? formatDate(period.sbiValidatedAt) : 'Non validée')}
    </div>`;

  return `
    <div class="sbi-booklet-section">
      <h2>${escapeHtml(period.label || 'Période')}
        <span class="sbi-booklet-badge is-soft" style="--bk-accent:${escapeHtml(sm.color)};">${escapeHtml(sm.label)}</span>
      </h2>
      ${dates ? `<p class="sbi-booklet-section__hint">${escapeHtml(dates)}</p>` : ''}
      ${locked ? '<p class="sbi-booklet-section__hint">Période verrouillée : consultation seule.</p>' : ''}

      <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.roles.student)} — ${escapeHtml(LABELS.sections.project)}</div>
      <div class="sbi-booklet-grid">${studentBlocks}${sigBlock}</div>

      ${!locked ? `
        <p class="sbi-booklet-status" data-booklet-status hidden></p>
        <div class="sbi-booklet-actions">
          <button type="button" class="sbi-booklet-btn primary" data-save-period="${escapeHtml(periodKey)}">Enregistrer mes parties</button>
        </div>` : ''}

      <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.roles.tutor)}</div>
      <div class="sbi-booklet-grid">${tutorBlocks}</div>

      <div class="sbi-booklet-subtitle">Validations</div>
      ${validations}
    </div>`;
}

/* =====================================================================
 * Rendu : Documents / annexes (lecture seule)
 * ===================================================================== */
function renderDocuments() {
  const docs = Array.isArray(booklet.documents) ? booklet.documents : [];
  const items = docs.length
    ? `<ul class="sbi-booklet-missing" style="list-style:none;padding-left:0;">${docs.map((d) => {
        const name = escapeHtml(d.name || d.fileName || d.title || 'Document');
        return `<li>📎 ${d.url || d.downloadURL
          ? `<a href="${escapeHtml(d.url || d.downloadURL)}" target="_blank" rel="noopener">${name}</a>`
          : name}</li>`;
      }).join('')}</ul>`
    : '<p class="sbi-booklet-section__hint">Aucune pièce jointe pour le moment.</p>';
  return `
    <div class="sbi-booklet-section">
      <h2>${escapeHtml(LABELS.sections.documents)}</h2>
      ${items}
      <div class="sbi-booklet-subtitle">${escapeHtml(LABELS.annexTitle)}</div>
      <p class="sbi-booklet-section__hint">Le livret d'apprentissage accompagne ton parcours d'Animateur E-Sport : objectifs, suivi des situations d'animation et des projets, bilans croisés et validation SBI à chaque période.</p>
    </div>`;
}

/* =====================================================================
 * Rendu : Export PDF
 * ===================================================================== */
function renderExport() {
  const { rate, missing } = computeCompletion(booklet);
  return `
    <div class="sbi-booklet-section">
      <h2>Export PDF</h2>
      <p class="sbi-booklet-section__hint">Télécharge une version imprimable de ton livret (complétion actuelle : ${rate}%).</p>
      ${missing.length ? `<p class="sbi-booklet-section__hint">${missing.length} information(s) encore à compléter.</p>` : ''}
      <div class="sbi-booklet-actions">
        <button type="button" class="sbi-booklet-btn primary" data-download-pdf>Télécharger le PDF</button>
      </div>
    </div>`;
}

/* =====================================================================
 * Complétion (barre + manquants)
 * ===================================================================== */
function renderCompletion() {
  const { rate, missing } = computeCompletion(booklet);
  const missingHtml = missing.length
    ? `<ul class="sbi-booklet-missing">${missing.slice(0, 12).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}${missing.length > 12 ? `<li>… +${missing.length - 12} autre(s)</li>` : ''}</ul>`
    : '<p class="sbi-booklet-section__hint">Toutes les informations attendues sont renseignées. 🎉</p>';
  return `
    <div class="sbi-booklet-completion">
      <div class="sbi-booklet-completion__label">
        <span>Complétion du livret</span><strong>${rate}%</strong>
      </div>
      <div class="sbi-booklet-progress"><div class="sbi-booklet-progress__bar" style="width:${rate}%;"></div></div>
      ${missingHtml}
    </div>`;
}

/* =====================================================================
 * Rendu principal
 * ===================================================================== */
function renderTabBody() {
  if (activeTab === 'identity') return renderIdentity();
  if (activeTab === 'formation') return renderFormation();
  if (activeTab === 'planning') return renderPlanning();
  if (activeTab === 'absences') return renderAbsences();
  if (activeTab.startsWith('period:')) return renderPeriod(activeTab.slice('period:'.length));
  if (activeTab === 'documents') return renderDocuments();
  if (activeTab === 'export') return renderExport();
  return renderIdentity();
}

function render() {
  const r = root();
  if (!r) return;

  if (!booklet) {
    r.innerHTML = `
      <div class="sbi-booklet-head">
        <h1>Mon livret d'apprentissage</h1>
      </div>
      <div class="sbi-booklet-empty">Ton livret n'a pas encore été créé par l'équipe SBI.</div>`;
    return;
  }

  const sm = statusMeta(booklet.status);
  const tabs = tabDefs();
  const meta = [booklet.studentName, booklet.formationTitle || booklet.formationName, booklet.promotionLabel || booklet.promotionName]
    .filter(Boolean).map((x) => escapeHtml(String(x))).join(' — ');

  r.innerHTML = `
    <div class="sbi-booklet-head">
      <h1>Mon livret d'apprentissage</h1>
      <p>Complète tes parties, consulte les bilans du maître d'apprentissage et la validation SBI.</p>
      <div class="sbi-booklet-meta">
        <span class="sbi-booklet-badge is-soft" style="--bk-accent:${escapeHtml(sm.color)};">${escapeHtml(sm.label)}</span>
        ${meta ? `<span>${meta}</span>` : ''}
      </div>
    </div>
    ${renderCompletion()}
    <div class="sbi-booklet-tabs" data-booklet-tabs>
      ${tabs.map((t) => `<button type="button" class="sbi-booklet-tab ${activeTab === t.key ? 'is-active' : ''}" data-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`).join('')}
    </div>
    <div data-booklet-body>${renderTabBody()}</div>
  `;
  bindEvents();
}

/* =====================================================================
 * Lecture des champs modifiés (envoi ciblé)
 * ===================================================================== */
function collectFields(keys) {
  const r = root();
  const out = {};
  keys.forEach((key) => {
    const el = r?.querySelector(`[data-field="${CSS.escape(key)}"]`);
    if (el) out[key] = el.value;
  });
  return out;
}

/* =====================================================================
 * Sauvegardes
 * ===================================================================== */
async function saveIdentity(button) {
  if (busy || !booklet) return;
  const keys = IDENTITY_FIELDS.map((f) => `identity.${f.key}`);
  const collected = collectFields(keys);
  // On reconstruit { fieldKey: value } sans le préfixe "identity.".
  const fields = {};
  Object.keys(collected).forEach((k) => { fields[k.replace(/^identity\./, '')] = collected[k]; });

  busy = true;
  button.disabled = true;
  setInlineStatus('Enregistrement…');
  try {
    await updateBookletSection({
      bookletId: booklet.id,
      target: { kind: 'section', section: 'identity' },
      fields
    });
    setInlineStatus('Identité enregistrée ✅', 'success');
    await reload();
  } catch (error) {
    console.error('[SBI Livret élève] enregistrement identité impossible :', error);
    setInlineStatus(error?.message || "Enregistrement impossible. Réessaie.", 'error');
    button.disabled = false;
  } finally {
    busy = false;
  }
}

async function savePeriod(periodKey, button, extraFields = null) {
  if (busy || !booklet) return;
  const list = periods();
  const period = list.find((p, i) => (p?.id || `p${i + 1}`) === periodKey);
  if (!period) return;
  const periodId = period.id || periodKey;

  const fields = extraFields || collectFields(STUDENT_PERIOD_TEXT_FIELDS);
  if (!fields || Object.keys(fields).length === 0) {
    setInlineStatus('Rien à enregistrer.', 'error');
    return;
  }

  busy = true;
  if (button) button.disabled = true;
  setInlineStatus('Enregistrement…');
  try {
    await updateBookletSection({
      bookletId: booklet.id,
      target: { kind: 'period', periodId },
      fields
    });
    setInlineStatus('Enregistré ✅', 'success');
    await reload();
  } catch (error) {
    console.error('[SBI Livret élève] enregistrement période impossible :', error);
    setInlineStatus(error?.message || "Enregistrement impossible. Réessaie.", 'error');
    if (button) button.disabled = false;
  } finally {
    busy = false;
  }
}

async function signPeriod(periodKey, button) {
  if (!window.confirm('Confirmer ta signature pour cette période ?')) return;
  // On enregistre d'abord les champs texte saisis, puis la signature.
  const textFields = collectFields(STUDENT_PERIOD_TEXT_FIELDS);
  const fields = Object.assign({}, textFields, { studentSignedAt: new Date().toISOString() });
  await savePeriod(periodKey, button, fields);
}

/* =====================================================================
 * Événements
 * ===================================================================== */
function bindEvents() {
  const r = root();
  if (!r) return;

  r.querySelector('[data-booklet-tabs]')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { activeTab = tab.dataset.tab; render(); }
  });

  const body = r.querySelector('[data-booklet-body]');
  body?.addEventListener('click', (e) => {
    const saveSection = e.target.closest('[data-save-section]');
    if (saveSection && saveSection.dataset.saveSection === 'identity') { saveIdentity(saveSection); return; }

    const savePeriodBtn = e.target.closest('[data-save-period]');
    if (savePeriodBtn) { savePeriod(savePeriodBtn.dataset.savePeriod, savePeriodBtn); return; }

    const signBtn = e.target.closest('[data-sign-period]');
    if (signBtn) { signPeriod(signBtn.dataset.signPeriod, signBtn); return; }

    const pdfBtn = e.target.closest('[data-download-pdf]');
    if (pdfBtn) { downloadBookletPdf(booklet); return; }
  });
}

/* =====================================================================
 * Chargement
 * ===================================================================== */
async function reload() {
  booklet = await loadBookletByStudent({ db, studentId: currentUid });
  render();
}

async function loadAndRender(user) {
  currentUid = user.uid;
  setStatus('Chargement…');
  booklet = await loadBookletByStudent({ db, studentId: currentUid });
  render();
}

/* =====================================================================
 * Montage
 * ===================================================================== */
export function mountStudentBooklet() {
  const view = document.getElementById('view-student-livret');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_STUDENT_BOOKLET_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace('/login.html'); return; }
    try {
      await loadAndRender(user);
    } catch (error) {
      console.warn('[SBI Livret élève] chargement impossible :', error);
      setStatus(error?.message || "Impossible de charger ton livret.", 'error');
    }
  });

  const cleanup = () => {
    mounted = false; mountedView = null;
    unsubscribeAuth?.(); unsubscribeAuth = null;
  };
  window.SBI_STUDENT_BOOKLET_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountStudentBooklet(), { once: true });
} else {
  mountStudentBooklet();
}
