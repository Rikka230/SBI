/**
 * SBI 8.0P.167.287 — Écran ADMIN « Livret d'apprentissage » (Animateur E-Sport).
 *
 * L'admin pilote TOUT : liste filtrable des livrets, génération depuis un élève,
 * édition de toutes les sections (Identité, Employeur, Tuteur, Contrat, Absences,
 * Périodes 1→6), assignation du maître d'apprentissage, validation/verrouillage
 * des périodes, export PDF.
 *
 * Lecture client (admin lit tout) via loadBookletsForAdmin ; écritures sensibles
 * via Cloud Functions callables (module /js/booklet/booklet-data.js).
 * Pas de listener temps réel : on recharge après chaque action.
 */

import { auth, db } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import {
  STATUS_META,
  statusMeta,
  LABELS,
  periodFieldLabel,
  PERIOD_FIELDS,
  canEditField,
  escapeHtml,
  computeCompletion,
  generateBooklet,
  updateBookletSection,
  validateBookletPeriod,
  lockBookletPeriod,
  assignBookletTutor,
  loadBooklet,
  loadBookletsForAdmin,
  periodGuide
} from '/js/booklet/booklet-data.js?v=8.0P.167.290';
import { downloadBookletPdf } from '/js/booklet/booklet-pdf.js?v=8.0P.167.290';

const ROLE = 'admin';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;
let currentAdmin = null;

// Référentiels (chargés une fois pour les pickers & libellés).
let students = [];        // users role student
let tutors = [];          // users role tutor (ou tuteur)
let formations = [];      // formations
let promotions = [];      // promotions

// État liste
let booklets = [];
let filters = { formationId: '', promotionId: '', tutorId: '', status: '', search: '', minCompletion: '' };

// État détail
let mode = 'list';        // list | create | edit
let selectedId = '';
let selectedBooklet = null;
let activeTab = 'meta';   // meta | p1..p6 (onglet d'édition)

/* ============================================================
 * Helpers
 * ============================================================ */
function root() { return document.getElementById('booklet-root'); }

function setStatus(message, tone = 'muted') {
  const r = root();
  if (r) r.innerHTML = `<div class="sbi-booklet-status" data-tone="${tone}">${escapeHtml(message)}</div>`;
}

function fullName(u = {}) {
  return (
    u.displayName ||
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
    [u.prenom, u.nom].filter(Boolean).join(' ').trim() ||
    u.name ||
    u.fullName ||
    u.email ||
    u.id ||
    'Sans nom'
  );
}

function formationName(f = {}) {
  return f.titre || f.title || f.nom || f.name || f.slug || f.id || 'Formation';
}

function promotionName(p = {}) {
  return p.name || p.promotionName || p.title || p.id || 'Promotion';
}

function isStudentRole(u = {}) {
  const r = String(u.role || u.type || '').toLowerCase();
  return r === 'student' || r === 'eleve' || r === 'élève' || r === 'apprenti';
}

function isTutorRole(u = {}) {
  const r = String(u.role || u.type || '').toLowerCase();
  return r === 'tutor' || r === 'tuteur';
}

function studentById(id) { return students.find((s) => s.id === id) || null; }
function tutorById(id) { return tutors.find((t) => t.id === id) || null; }
function formationById(id) { return formations.find((f) => f.id === id) || null; }
function promotionById(id) { return promotions.find((p) => p.id === id) || null; }

function bookletDisplayName(b = {}) {
  if (b.studentName) return b.studentName;
  const s = studentById(b.studentId || b.id);
  return s ? fullName(s) : (b.studentId || b.id || 'Apprenti');
}

function bookletFormationLabel(b = {}) {
  const f = b.formationId ? formationById(b.formationId) : null;
  const fName = b.formationTitle || (f ? formationName(f) : '');
  const p = b.promotionId ? promotionById(b.promotionId) : null;
  const pName = b.promotionLabel || (p ? promotionName(p) : '');
  return [fName, pName].filter(Boolean).join(' · ') || '—';
}

function bookletTutorLabel(b = {}) {
  if (b.tutorName) return b.tutorName;
  const t = b.tutorId ? tutorById(b.tutorId) : null;
  return t ? fullName(t) : '';
}

/* ============================================================
 * Chargement
 * ============================================================ */
async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Connexion requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Profil admin introuvable.');
  const profile = snap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');
  currentAdmin = { uid: user.uid, profile };
}

async function loadReferentials() {
  const [usersSnap, fSnap, pSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'formations')),
    getDocs(collection(db, 'promotions'))
  ]);
  const allUsers = [];
  usersSnap.forEach((d) => allUsers.push({ id: d.id, ...(d.data() || {}) }));
  students = allUsers.filter(isStudentRole).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  tutors = allUsers.filter(isTutorRole).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  formations = [];
  fSnap.forEach((d) => formations.push({ id: d.id, ...(d.data() || {}) }));
  promotions = [];
  pSnap.forEach((d) => promotions.push({ id: d.id, ...(d.data() || {}) }));
}

async function loadBookletList() {
  const queryFilters = {};
  if (filters.formationId) queryFilters.formationId = filters.formationId;
  if (filters.promotionId) queryFilters.promotionId = filters.promotionId;
  if (filters.status) queryFilters.status = filters.status;
  booklets = await loadBookletsForAdmin({ db, filters: queryFilters });
}

/* ============================================================
 * Liste + filtres
 * ============================================================ */
function filteredBooklets() {
  const needle = filters.search.trim().toLowerCase();
  const minC = filters.minCompletion ? Number(filters.minCompletion) : 0;
  return booklets
    .filter((b) => !filters.tutorId || (b.tutorId === filters.tutorId))
    .filter((b) => {
      if (!needle) return true;
      const hay = `${bookletDisplayName(b)} ${bookletFormationLabel(b)} ${bookletTutorLabel(b)}`.toLowerCase();
      return hay.includes(needle);
    })
    .filter((b) => {
      if (!minC) return true;
      return computeCompletion(b).rate >= minC;
    });
}

function statusOptions(selected) {
  return Object.keys(STATUS_META).map((key) => {
    const m = STATUS_META[key];
    return `<option value="${key}" ${selected === key ? 'selected' : ''}>${escapeHtml(m.label)}</option>`;
  }).join('');
}

function statusBadge(status) {
  const m = statusMeta(status);
  return `<span class="sbi-booklet-badge" style="background:${m.color};">${escapeHtml(m.label)}</span>`;
}

function renderListView() {
  const list = filteredBooklets();

  const formationOpts = ['<option value="">Toutes les formations</option>']
    .concat(formations.map((f) => `<option value="${escapeHtml(f.id)}" ${filters.formationId === f.id ? 'selected' : ''}>${escapeHtml(formationName(f))}</option>`))
    .join('');
  const promotionOpts = ['<option value="">Toutes les promotions</option>']
    .concat(promotions.map((p) => `<option value="${escapeHtml(p.id)}" ${filters.promotionId === p.id ? 'selected' : ''}>${escapeHtml(promotionName(p))}</option>`))
    .join('');
  const tutorOpts = ['<option value="">Tous les tuteurs</option>']
    .concat(tutors.map((t) => `<option value="${escapeHtml(t.id)}" ${filters.tutorId === t.id ? 'selected' : ''}>${escapeHtml(fullName(t))}</option>`))
    .join('');

  const rows = list.length
    ? list.map((b) => {
        const comp = computeCompletion(b);
        return `
          <tr data-open="${escapeHtml(b.id)}" style="cursor:pointer;">
            <td>${escapeHtml(bookletDisplayName(b))}</td>
            <td>${escapeHtml(bookletFormationLabel(b))}</td>
            <td>${escapeHtml(bookletTutorLabel(b) || '—')}</td>
            <td>${statusBadge(b.status)}</td>
            <td style="min-width:140px;">
              <div class="sbi-booklet-progress" style="margin:0 0 .25rem;"><div class="sbi-booklet-progress__bar" style="width:${comp.rate}%;"></div></div>
              <small>${comp.rate}% · ${comp.filled}/${comp.total}</small>
            </td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="5"><div class="sbi-booklet-empty">Aucun livret pour ces filtres.</div></td></tr>`;

  return `
    <div class="sbi-booklet-head">
      <h1>Livret d'apprentissage</h1>
      <p>Pilotez les livrets des apprentis Animateur E-Sport : génération, suivi, édition de toutes les sections, validation et verrouillage des périodes.</p>
    </div>

    <div class="sbi-booklet-actions" style="margin:0 0 1rem;">
      <button type="button" class="sbi-booklet-btn primary" data-action="create">+ Générer un livret</button>
    </div>

    <div class="sbi-booklet-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
      <div class="sbi-booklet-field">
        <label>Formation</label>
        <select class="sbi-booklet-input" data-filter="formationId">${formationOpts}</select>
      </div>
      <div class="sbi-booklet-field">
        <label>Promotion</label>
        <select class="sbi-booklet-input" data-filter="promotionId">${promotionOpts}</select>
      </div>
      <div class="sbi-booklet-field">
        <label>Tuteur</label>
        <select class="sbi-booklet-input" data-filter="tutorId">${tutorOpts}</select>
      </div>
      <div class="sbi-booklet-field">
        <label>Statut</label>
        <select class="sbi-booklet-input" data-filter="status">
          <option value="">Tous les statuts</option>
          ${statusOptions(filters.status)}
        </select>
      </div>
      <div class="sbi-booklet-field">
        <label>Complétion min.</label>
        <select class="sbi-booklet-input" data-filter="minCompletion">
          <option value="">Toutes</option>
          <option value="25" ${filters.minCompletion === '25' ? 'selected' : ''}>≥ 25%</option>
          <option value="50" ${filters.minCompletion === '50' ? 'selected' : ''}>≥ 50%</option>
          <option value="75" ${filters.minCompletion === '75' ? 'selected' : ''}>≥ 75%</option>
          <option value="100" ${filters.minCompletion === '100' ? 'selected' : ''}>100%</option>
        </select>
      </div>
      <div class="sbi-booklet-field">
        <label>Recherche (apprenti)</label>
        <input type="search" class="sbi-booklet-input" data-filter="search" value="${escapeHtml(filters.search)}" placeholder="Nom de l'apprenti…">
      </div>
    </div>

    <div class="sbi-booklet-section" style="margin-top:1rem;">
      <table style="width:100%;border-collapse:collapse;font-size:.88rem;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:.5rem .6rem;">Apprenti</th>
            <th style="padding:.5rem .6rem;">Formation / promo</th>
            <th style="padding:.5rem .6rem;">Maître d'apprentissage</th>
            <th style="padding:.5rem .6rem;">Statut</th>
            <th style="padding:.5rem .6rem;">Complétion</th>
          </tr>
        </thead>
        <tbody data-list>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ============================================================
 * Création
 * ============================================================ */
function renderCreateView() {
  const studentOpts = ['<option value="">— Choisir un apprenti —</option>']
    .concat(students.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(fullName(s))}${s.email ? ` (${escapeHtml(s.email)})` : ''}</option>`))
    .join('');
  const formationOpts = ['<option value="">— (optionnel) —</option>']
    .concat(formations.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(formationName(f))}</option>`))
    .join('');
  const promotionOpts = ['<option value="">— (optionnel) —</option>']
    .concat(promotions.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(promotionName(p))}</option>`))
    .join('');
  const tutorOpts = ['<option value="">— (optionnel) —</option>']
    .concat(tutors.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(fullName(t))}</option>`))
    .join('');

  return `
    <div class="sbi-booklet-head">
      <h1>Générer un livret</h1>
      <p>Choisissez un apprenti, puis renseignez (optionnellement) la formation, la promotion, l'employeur, le tuteur et les dates de contrat.</p>
    </div>
    <div class="sbi-booklet-section">
      <div class="sbi-booklet-grid">
        <div class="sbi-booklet-field is-full">
          <label for="bk-student">Apprenti *</label>
          <select id="bk-student" class="sbi-booklet-input">${studentOpts}</select>
        </div>
        <div class="sbi-booklet-field">
          <label for="bk-formation">Formation</label>
          <select id="bk-formation" class="sbi-booklet-input">${formationOpts}</select>
        </div>
        <div class="sbi-booklet-field">
          <label for="bk-promotion">Promotion</label>
          <select id="bk-promotion" class="sbi-booklet-input">${promotionOpts}</select>
        </div>
        <div class="sbi-booklet-field">
          <label for="bk-tutor">Maître d'apprentissage</label>
          <select id="bk-tutor" class="sbi-booklet-input">${tutorOpts}</select>
        </div>
        <div class="sbi-booklet-field">
          <label for="bk-employer">Structure / employeur</label>
          <input id="bk-employer" class="sbi-booklet-input" type="text" placeholder="Nom de la structure">
        </div>
        <div class="sbi-booklet-field">
          <label for="bk-contract-start">Début du contrat</label>
          <input id="bk-contract-start" class="sbi-booklet-input" type="date">
        </div>
        <div class="sbi-booklet-field">
          <label for="bk-contract-end">Fin du contrat</label>
          <input id="bk-contract-end" class="sbi-booklet-input" type="date">
        </div>
      </div>
      <p class="sbi-booklet-status" data-create-status hidden></p>
      <div class="sbi-booklet-actions">
        <button type="button" class="sbi-booklet-btn primary" data-action="create-submit">Générer le livret</button>
        <button type="button" class="sbi-booklet-btn ghost" data-action="back">Annuler</button>
      </div>
    </div>
  `;
}

/* ============================================================
 * Édition d'un livret
 * ============================================================ */
function fieldHtml({ key, label, value, target, multiline = true, type = 'text', full = false }) {
  // 8.0P.167.291 — CORRECTIF MAJEUR : pour une SECTION, le droit s'évalue sur le
  // NOM DE SECTION (target.section), pas sur la clé de champ. FIELD_PERMISSIONS.section
  // mappe des noms de section -> true (identity/employer/tutor/contract/formation…),
  // donc canEditField(role,'section', cleDeChamp) renvoyait toujours false et TOUS les
  // champs de section s'affichaient en lecture seule (admin inclus) -> rien n'était
  // jamais enregistré. On évalue désormais le droit sur la section.
  let editable;
  if (target.kind === 'period') {
    editable = canEditField(ROLE, 'period', key);
  } else if (target.kind === 'meta') {
    editable = ROLE === 'admin';
  } else {
    editable = canEditField(ROLE, 'section', target.section);
  }
  const safe = escapeHtml(value == null ? '' : String(value));
  const idAttr = `f-${target.kind}-${target.section || target.periodId || 'meta'}-${key}`;
  let control;
  if (!editable) {
    control = `<div class="sbi-booklet-readonly">${safe.replace(/\n/g, '<br>')}</div>`;
  } else if (multiline) {
    control = `<textarea class="sbi-booklet-textarea" id="${idAttr}" data-field="${escapeHtml(key)}">${safe}</textarea>`;
  } else {
    control = `<input class="sbi-booklet-input" id="${idAttr}" type="${type}" data-field="${escapeHtml(key)}" value="${safe}">`;
  }
  return `
    <div class="sbi-booklet-field ${full ? 'is-full' : ''}">
      <label for="${idAttr}">${escapeHtml(label)}</label>
      ${control}
    </div>`;
}

function collectFields(sectionEl) {
  const fields = {};
  sectionEl.querySelectorAll('[data-field]').forEach((el) => {
    fields[el.dataset.field] = el.value;
  });
  return fields;
}

function metaSectionsConfig(b) {
  const identity = b.identity || {};
  const employer = b.employer || {};
  const tutor = b.tutor || {};
  const contract = b.contract || {};
  const formation = b.formation || {};
  const idf = LABELS.identityFields;
  const ff = LABELS.formationFields;
  return [
    {
      section: 'identity', title: LABELS.sections.identity,
      fields: [
        { key: 'fullName', label: idf.studentName, value: identity.fullName || identity.name || [identity.prenom, identity.nom].filter(Boolean).join(' ').trim() || b.studentName, multiline: false, full: true },
        { key: 'birthDate', label: idf.birthDate, value: identity.birthDate, multiline: false, type: 'date' },
        { key: 'birthPlace', label: idf.birthPlace, value: identity.birthPlace, multiline: false },
        { key: 'email', label: idf.email, value: identity.email || b.studentEmail, multiline: false, type: 'email' },
        { key: 'phone', label: idf.phone, value: identity.phone, multiline: false },
        { key: 'address', label: idf.address, value: identity.address, full: true },
        { key: 'postalCode', label: idf.postalCode, value: identity.postalCode, multiline: false },
        { key: 'city', label: idf.city, value: identity.city, multiline: false },
        { key: 'legalGuardian', label: idf.legalGuardian, value: identity.legalGuardian, multiline: false, full: true }
      ]
    },
    {
      section: 'formation', title: LABELS.sections.formation,
      fields: [
        { key: 'establishmentName', label: ff.establishmentName, value: formation.establishmentName, multiline: false, full: true },
        { key: 'establishmentAddress', label: ff.establishmentAddress, value: formation.establishmentAddress, full: true },
        { key: 'director', label: ff.director, value: formation.director, multiline: false },
        { key: 'pedagogicalManager', label: ff.pedagogicalManager, value: formation.pedagogicalManager, multiline: false },
        { key: 'handicapReferent', label: ff.handicapReferent, value: formation.handicapReferent, multiline: false },
        { key: 'formationTitle', label: ff.formationTitle, value: formation.formationTitle || b.formationName, multiline: false, full: true },
        { key: 'rncp', label: ff.rncp, value: formation.rncp, multiline: false }
      ]
    },
    {
      section: 'employer', title: LABELS.sections.employer,
      fields: [
        { key: 'name', label: LABELS.fields.employerName, value: b.employerName || employer.name, multiline: false, full: true },
        { key: 'address', label: 'Adresse', value: employer.address, full: true },
        { key: 'contact', label: 'Contact', value: employer.contact || employer.email || employer.phone, multiline: false }
      ]
    },
    {
      section: 'tutor', title: LABELS.sections.tutor,
      fields: [
        { key: 'name', label: LABELS.fields.tutorName, value: b.tutorName || tutor.name || tutor.fullName, multiline: false, full: true },
        { key: 'role', label: 'Fonction', value: tutor.role || tutor.fonction, multiline: false },
        { key: 'email', label: 'Contact', value: tutor.email || tutor.contact || tutor.phone, multiline: false }
      ]
    },
    {
      section: 'contract', title: LABELS.sections.contract,
      fields: [
        { key: 'start', label: LABELS.fields.contractStart, value: dateInputValue(b.contractStart || contract.start), multiline: false, type: 'date' },
        { key: 'end', label: LABELS.fields.contractEnd, value: dateInputValue(b.contractEnd || contract.end), multiline: false, type: 'date' }
      ]
    }
  ];
}

function dateInputValue(value) {
  if (!value) return '';
  let ms = 0;
  if (typeof value === 'string') {
    // déjà au format yyyy-mm-dd ?
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const parsed = Date.parse(value);
    ms = Number.isNaN(parsed) ? 0 : parsed;
  } else if (typeof value?.toMillis === 'function') {
    ms = value.toMillis();
  } else if (typeof value?.seconds === 'number') {
    ms = value.seconds * 1000;
  } else if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  }
  if (!ms) return '';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function renderMetaPanel(b) {
  const sections = metaSectionsConfig(b);
  const blocks = sections.map((sec) => `
    <div class="sbi-booklet-section" data-meta-section="${sec.section}">
      <h2>${escapeHtml(sec.title)}</h2>
      <div class="sbi-booklet-grid">
        ${sec.fields.map((f) => fieldHtml({
          key: f.key, label: f.label, value: f.value,
          target: { kind: 'section', section: sec.section },
          multiline: f.multiline !== false, type: f.type, full: f.full
        })).join('')}
      </div>
      <div class="sbi-booklet-actions">
        <button type="button" class="sbi-booklet-btn primary" data-save-section="${sec.section}">Enregistrer</button>
      </div>
      <p class="sbi-booklet-status" data-section-status="${sec.section}" hidden></p>
    </div>`).join('');

  // Bloc tuteur (assignation rapide)
  const tutorOpts = ['<option value="">— Aucun —</option>']
    .concat(tutors.map((t) => `<option value="${escapeHtml(t.id)}" ${b.tutorId === t.id ? 'selected' : ''}>${escapeHtml(fullName(t))}</option>`))
    .join('');
  const assignBlock = `
    <div class="sbi-booklet-section">
      <h2>Assigner le maître d'apprentissage</h2>
      <div class="sbi-booklet-grid">
        <div class="sbi-booklet-field is-full">
          <label for="bk-assign-tutor">Tuteur</label>
          <select id="bk-assign-tutor" class="sbi-booklet-input">${tutorOpts}</select>
        </div>
      </div>
      <div class="sbi-booklet-actions">
        <button type="button" class="sbi-booklet-btn" data-action="assign-tutor">Assigner</button>
      </div>
      <p class="sbi-booklet-status" data-assign-status hidden></p>
    </div>`;

  return blocks + assignBlock;
}

function renderPeriodPanel(b, period, index) {
  const target = { kind: 'period', periodId: period.id };
  const dateFields = `
    <div class="sbi-booklet-grid">
      ${fieldHtml({ key: 'label', label: periodFieldLabel('label'), value: period.label, target, multiline: false })}
      ${fieldHtml({ key: 'startDate', label: periodFieldLabel('startDate'), value: dateInputValue(period.startDate), target, multiline: false, type: 'date' })}
      ${fieldHtml({ key: 'endDate', label: periodFieldLabel('endDate'), value: dateInputValue(period.endDate), target, multiline: false, type: 'date' })}
    </div>`;

  const periodTextFields = PERIOD_FIELDS.map((key) =>
    fieldHtml({ key, label: periodFieldLabel(key), value: period[key], target, multiline: true, full: true })
  ).join('');

  const sm = statusMeta(period.status);
  const locked = period.status === 'locked' || !!period.lockedAt;
  const validated = !!period.sbiValidatedAt || period.status === 'validated';

  const guide = periodGuide(index);
  const guideHtml = guide
    ? `<div class="sbi-booklet-guide" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:.6rem .9rem;margin:.5rem 0;font-size:.85rem;color:#166534;">
        <strong>${escapeHtml(guide.title)}</strong>
        <ul style="margin:.35rem 0 0;padding-left:1.1rem;">${guide.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
      </div>`
    : '';

  return `
    <div class="sbi-booklet-section" data-period-id="${escapeHtml(period.id)}">
      <h2>${escapeHtml(period.label || `Période ${index + 1}`)}
        <span class="sbi-booklet-badge" style="background:${sm.color};margin-left:.5rem;">${escapeHtml(sm.label)}</span>
      </h2>
      ${dateFields}
      ${guideHtml}
      <div class="sbi-booklet-subtitle">Recueil / projet d'animation &amp; bilans</div>
      ${periodTextFields}
      <div class="sbi-booklet-actions">
        <button type="button" class="sbi-booklet-btn primary" data-save-period="${escapeHtml(period.id)}">Enregistrer la période</button>
        <button type="button" class="sbi-booklet-btn" data-validate-period="${escapeHtml(period.id)}" data-decision="validate" ${validated ? 'disabled' : ''}>Valider (SBI)</button>
        <button type="button" class="sbi-booklet-btn ghost" data-validate-period="${escapeHtml(period.id)}" data-decision="reject">Renvoyer</button>
        <button type="button" class="sbi-booklet-btn ${locked ? 'ghost' : 'danger'}" data-lock-period="${escapeHtml(period.id)}" data-locked="${locked ? '0' : '1'}">${locked ? 'Déverrouiller' : 'Verrouiller'}</button>
      </div>
      <p class="sbi-booklet-status" data-period-status="${escapeHtml(period.id)}" hidden></p>
    </div>`;
}

function renderEditView() {
  const b = selectedBooklet;
  if (!b) return '<div class="sbi-booklet-empty">Livret introuvable.</div>';

  const comp = computeCompletion(b);
  const periods = Array.isArray(b.periods) ? b.periods : [];

  const tabs = [{ key: 'meta', label: "En-tête & sections" }]
    .concat(periods.map((p, i) => ({ key: p.id || `p${i + 1}`, label: p.label || `Période ${i + 1}` })));

  const tabsHtml = tabs.map((t) => `
    <button type="button" class="sbi-booklet-tab ${activeTab === t.key ? 'is-active' : ''}" data-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`).join('');

  let panel;
  if (activeTab === 'meta') {
    panel = renderMetaPanel(b);
  } else {
    const idx = periods.findIndex((p, i) => (p.id || `p${i + 1}`) === activeTab);
    panel = idx >= 0 ? renderPeriodPanel(b, periods[idx], idx) : '<div class="sbi-booklet-empty">Période introuvable.</div>';
  }

  const missingList = comp.missing.length
    ? `<ul class="sbi-booklet-missing">${comp.missing.slice(0, 12).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}${comp.missing.length > 12 ? `<li>… (+${comp.missing.length - 12})</li>` : ''}</ul>`
    : '';

  return `
    <div class="sbi-booklet-head">
      <h1>${escapeHtml(bookletDisplayName(b))}</h1>
      <div class="sbi-booklet-meta">
        <span>${escapeHtml(bookletFormationLabel(b))}</span>
        <span>Maître d'apprentissage : ${escapeHtml(bookletTutorLabel(b) || '—')}</span>
        <span>${statusBadge(b.status)}</span>
      </div>
    </div>

    <div class="sbi-booklet-actions" style="margin:0 0 .5rem;">
      <button type="button" class="sbi-booklet-btn ghost" data-action="back">← Retour à la liste</button>
      <button type="button" class="sbi-booklet-btn" data-action="pdf">Télécharger le PDF</button>
    </div>

    <div class="sbi-booklet-completion">
      <div class="sbi-booklet-completion__label"><span>Complétion du livret</span><strong>${comp.rate}%</strong></div>
      <div class="sbi-booklet-progress"><div class="sbi-booklet-progress__bar" style="width:${comp.rate}%;"></div></div>
      ${missingList}
    </div>

    <div class="sbi-booklet-tabs">${tabsHtml}</div>
    <div data-panel>${panel}</div>
  `;
}

/* ============================================================
 * Rendu principal + binding
 * ============================================================ */
function render() {
  const r = root();
  if (!r) return;
  if (mode === 'create') r.innerHTML = renderCreateView();
  else if (mode === 'edit') r.innerHTML = renderEditView();
  else r.innerHTML = renderListView();
}

function setLocalStatus(el, message, tone = 'muted') {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message;
  el.dataset.tone = tone;
}

// Délégation attachée UNE fois au montage (le conteneur #booklet-root persiste).
let delegationBound = false;
function bindDelegation() {
  const r = root();
  if (!r || delegationBound) return;
  delegationBound = true;
  r.addEventListener('click', onClick);
  r.addEventListener('change', onFilterChange);
  r.addEventListener('input', onFilterChange);
}

async function onFilterChange(e) {
  if (mode !== 'list') return;
  const el = e.target.closest('[data-filter]');
  if (!el) return;
  // input → search ; change → selects (évite le double déclenchement).
  if (e.type === 'input' && el.tagName !== 'INPUT') return;
  if (e.type === 'change' && el.tagName === 'INPUT') return;
  filters[el.dataset.filter] = el.value;
  // formationId/promotionId/status passent par la requête Firestore → rechargement.
  if (['formationId', 'promotionId', 'status'].includes(el.dataset.filter)) {
    await loadBookletList();
  }
  render();
}

function onClick(e) {
  // Ouverture d'un livret depuis la liste.
  const openRow = e.target.closest('[data-open]');
  if (openRow && mode === 'list') { openBooklet(openRow.dataset.open); return; }

  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'create') { mode = 'create'; render(); return; }
    if (action === 'back') { mode = 'list'; selectedId = ''; selectedBooklet = null; render(); return; }
    if (action === 'create-submit') { handleCreate(actionEl); return; }
    if (action === 'pdf') { if (selectedBooklet) downloadBookletPdf(selectedBooklet); return; }
    if (action === 'assign-tutor') { handleAssignTutor(actionEl); return; }
  }

  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { activeTab = tabBtn.dataset.tab; render(); return; }

  const saveSection = e.target.closest('[data-save-section]');
  if (saveSection) { handleSaveSection(saveSection.dataset.saveSection, saveSection); return; }

  const savePeriod = e.target.closest('[data-save-period]');
  if (savePeriod) { handleSavePeriod(savePeriod.dataset.savePeriod, savePeriod); return; }

  const validateBtn = e.target.closest('[data-validate-period]');
  if (validateBtn) { handleValidatePeriod(validateBtn.dataset.validatePeriod, validateBtn.dataset.decision, validateBtn); return; }

  const lockBtn = e.target.closest('[data-lock-period]');
  if (lockBtn) { handleLockPeriod(lockBtn.dataset.lockPeriod, lockBtn.dataset.locked === '1', lockBtn); return; }
}

/* ============================================================
 * Actions
 * ============================================================ */
async function openBooklet(id) {
  selectedId = id;
  mode = 'edit';
  activeTab = 'meta';
  setStatus('Chargement du livret…');
  try {
    selectedBooklet = await loadBooklet({ db, bookletId: id });
    if (!selectedBooklet) { setStatus('Livret introuvable.', 'error'); return; }
    render();
  } catch (error) {
    console.error('[SBI Livret admin] ouverture impossible :', error);
    setStatus('Ouverture du livret impossible.', 'error');
  }
}

async function handleCreate(button) {
  const r = root();
  const statusEl = r.querySelector('[data-create-status]');
  const studentId = r.querySelector('#bk-student')?.value || '';
  if (!studentId) { setLocalStatus(statusEl, 'Choisis un apprenti.', 'error'); return; }

  const formationId = r.querySelector('#bk-formation')?.value || '';
  const promotionId = r.querySelector('#bk-promotion')?.value || '';
  const tutorId = r.querySelector('#bk-tutor')?.value || '';
  const employerName = r.querySelector('#bk-employer')?.value?.trim() || '';
  const contractStart = r.querySelector('#bk-contract-start')?.value || '';
  const contractEnd = r.querySelector('#bk-contract-end')?.value || '';

  const student = studentById(studentId);
  const tutor = tutorId ? tutorById(tutorId) : null;
  const formation = formationId ? formationById(formationId) : null;
  const promotion = promotionId ? promotionById(promotionId) : null;

  const payload = { studentId };
  if (student) payload.studentName = fullName(student);
  if (formationId) { payload.formationId = formationId; if (formation) payload.formationTitle = formationName(formation); }
  if (promotionId) { payload.promotionId = promotionId; if (promotion) payload.promotionLabel = promotionName(promotion); }
  if (tutorId) { payload.tutorId = tutorId; if (tutor) payload.tutorName = fullName(tutor); }
  if (employerName) payload.employerName = employerName;
  if (contractStart) payload.contractStart = contractStart;
  if (contractEnd) payload.contractEnd = contractEnd;

  button.disabled = true;
  setLocalStatus(statusEl, 'Génération en cours…');
  try {
    const res = await generateBooklet(payload);
    const newId = res?.data?.bookletId || res?.data?.id || studentId;
    mode = 'edit';
    selectedId = newId;
    activeTab = 'meta';
    await loadBookletList();
    selectedBooklet = await loadBooklet({ db, bookletId: newId });
    render();
  } catch (error) {
    console.error('[SBI Livret admin] génération impossible :', error);
    setLocalStatus(statusEl, error?.message || 'Génération impossible.', 'error');
    button.disabled = false;
  }
}

async function handleSaveSection(section, button) {
  const r = root();
  const sectionEl = r.querySelector(`[data-meta-section="${section}"]`);
  const statusEl = r.querySelector(`[data-section-status="${section}"]`);
  if (!sectionEl) return;
  const fields = collectFields(sectionEl);

  // Toutes les sections de la méta-config (identity, employer, tutor, contract)
  // sont de vraies sections acceptées par le serveur (BOOKLET_SECTION_ADMIN).
  // Le contrat passe par section 'contract' (clés start/end), PAS par 'meta'
  // (dont la whitelist ne contient pas contractStart/contractEnd).
  const target = { kind: 'section', section };

  button.disabled = true;
  setLocalStatus(statusEl, 'Enregistrement…');
  try {
    await updateBookletSection({ bookletId: selectedId, target, fields });
    selectedBooklet = await loadBooklet({ db, bookletId: selectedId });
    setLocalStatus(statusEl, 'Enregistré.', 'success');
    button.disabled = false;
    // Met à jour la barre de complétion / en-tête.
    render();
  } catch (error) {
    console.error('[SBI Livret admin] sauvegarde section impossible :', error);
    setLocalStatus(statusEl, error?.message || 'Enregistrement impossible.', 'error');
    button.disabled = false;
  }
}

async function handleSavePeriod(periodId, button) {
  const r = root();
  const sectionEl = r.querySelector(`[data-period-id="${periodId}"]`);
  const statusEl = r.querySelector(`[data-period-status="${periodId}"]`);
  if (!sectionEl) return;
  const fields = collectFields(sectionEl);

  button.disabled = true;
  setLocalStatus(statusEl, 'Enregistrement…');
  try {
    await updateBookletSection({ bookletId: selectedId, target: { kind: 'period', periodId }, fields });
    selectedBooklet = await loadBooklet({ db, bookletId: selectedId });
    setLocalStatus(statusEl, 'Période enregistrée.', 'success');
    render();
  } catch (error) {
    console.error('[SBI Livret admin] sauvegarde période impossible :', error);
    setLocalStatus(statusEl, error?.message || 'Enregistrement impossible.', 'error');
    button.disabled = false;
  }
}

async function handleValidatePeriod(periodId, decision, button) {
  const r = root();
  const statusEl = r.querySelector(`[data-period-status="${periodId}"]`);
  button.disabled = true;
  setLocalStatus(statusEl, 'Traitement…');
  try {
    await validateBookletPeriod({ bookletId: selectedId, periodId, decision });
    selectedBooklet = await loadBooklet({ db, bookletId: selectedId });
    render();
  } catch (error) {
    console.error('[SBI Livret admin] validation période impossible :', error);
    setLocalStatus(statusEl, error?.message || 'Action impossible.', 'error');
    button.disabled = false;
  }
}

async function handleLockPeriod(periodId, locked, button) {
  const r = root();
  const statusEl = r.querySelector(`[data-period-status="${periodId}"]`);
  button.disabled = true;
  setLocalStatus(statusEl, 'Traitement…');
  try {
    await lockBookletPeriod({ bookletId: selectedId, periodId, locked });
    selectedBooklet = await loadBooklet({ db, bookletId: selectedId });
    render();
  } catch (error) {
    console.error('[SBI Livret admin] verrouillage période impossible :', error);
    setLocalStatus(statusEl, error?.message || 'Action impossible.', 'error');
    button.disabled = false;
  }
}

async function handleAssignTutor(button) {
  const r = root();
  const statusEl = r.querySelector('[data-assign-status]');
  const tutorId = r.querySelector('#bk-assign-tutor')?.value || '';
  const tutor = tutorId ? tutorById(tutorId) : null;
  const tutorName = tutor ? fullName(tutor) : '';
  button.disabled = true;
  setLocalStatus(statusEl, 'Assignation…');
  try {
    await assignBookletTutor({ bookletId: selectedId, tutorId, tutorName });
    selectedBooklet = await loadBooklet({ db, bookletId: selectedId });
    setLocalStatus(statusEl, 'Maître d\'apprentissage assigné.', 'success');
    render();
  } catch (error) {
    console.error('[SBI Livret admin] assignation tuteur impossible :', error);
    setLocalStatus(statusEl, error?.message || 'Assignation impossible.', 'error');
    button.disabled = false;
  }
}

/* ============================================================
 * Montage
 * ============================================================ */
export function mountAdminBooklets() {
  const view = document.getElementById('view-booklets');
  if (!view) return () => {};
  if (mounted && mountedView === view) {
    return window.SBI_ADMIN_BOOKLETS_UNMOUNT || (() => {});
  }
  unsubscribeAuth?.();
  mounted = true;
  mountedView = view;
  setStatus('Chargement…');
  bindDelegation();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadReferentials();
      await loadBookletList();
      mode = 'list';
      render();
    } catch (error) {
      console.warn('[SBI Livret admin] accès refusé :', error);
      setStatus(error?.message || 'Accès réservé aux administrateurs.', 'error');
    }
  });

  const cleanup = () => {
    mounted = false;
    mountedView = null;
    delegationBound = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };
  window.SBI_ADMIN_BOOKLETS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminBooklets(), { once: true });
} else {
  mountAdminBooklets();
}
