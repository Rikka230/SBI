/**
 * =======================================================================
 * SBI — Livret d'apprentissage (Animateur E-Sport) : socle de données
 * -----------------------------------------------------------------------
 * Helpers purs (labels, dates, échappement, complétion), fabriques de
 * Cloud Functions callables (région europe-west1) et chargements Firestore
 * mutualisés (lecture directe autorisée par rôle ; écritures = callables).
 *
 * Collection : apprenticeshipBooklets/{bookletId}  (bookletId === studentId)
 * Vocabulaire 100% SBI / Animateur E-Sport (jamais sanitaire).
 * =======================================================================
 */

import { app } from '/js/firebase-init.js';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

export const FUNCTIONS_REGION = 'europe-west1';

/* =====================================================================
 * 1. Statuts
 * ===================================================================== */
export const STATUS_META = {
  draft:              { label: 'Brouillon',                 color: '#6b7280' },
  to_complete_student:{ label: 'À compléter (apprenti)',    color: '#2563eb' },
  pending_tutor:      { label: 'En attente du tuteur',      color: '#d97706' },
  pending_sbi:        { label: 'En attente de validation SBI', color: '#7c3aed' },
  validated:          { label: 'Validé SBI',                color: '#16a34a' },
  locked:             { label: 'Verrouillé',                color: '#111827' }
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.draft;
}

/* =====================================================================
 * 2. Vocabulaire SBI / Animateur E-Sport
 * ===================================================================== */
export const LABELS = {
  // Sections du livret
  sections: {
    identity:          "Identité de l'apprenti",
    employer:          "Structure / employeur",
    tutor:             "Maître d'apprentissage",
    contract:          "Contrat d'apprentissage",
    formation:         "Établissement & formation",
    planningAlternance:"Planning de l'alternance",
    absencesCfmfs:     "Absences au centre de formation",
    absencesEntreprise:"Absences en structure",
    documents:         "Documents associés",
    signatures:        "Signatures & validation",
    periods:           "Périodes de suivi",
    project:           "Recueil de données / projet d'animation"
  },
  // Champs de la section « Établissement & formation » (éditables admin).
  formationFields: {
    establishmentName:    "Établissement de formation",
    establishmentAddress: "Adresse de l'établissement",
    director:             "Directeur / responsable d'établissement",
    pedagogicalManager:   "Responsable pédagogique",
    handicapReferent:     "Référent handicap",
    formationTitle:       "Intitulé de la formation",
    rncp:                 "Code RNCP / certification",
    certifier:            "Certificateur",
    rncpLevel:            "Niveau de qualification",
    rncpDate:             "Date d'enregistrement RNCP"
  },
  // Champs « Identité » détaillés (éditables apprenti + admin).
  identityFields: {
    studentName:   "Nom et prénom de l'apprenti",
    birthDate:     "Date de naissance",
    birthPlace:    "Lieu de naissance",
    email:         "Email",
    phone:         "Téléphone",
    address:       "Adresse",
    postalCode:    "Code postal",
    city:          "Ville",
    legalGuardian: "Représentant légal (si mineur)"
  },
  // Champs des sections d'en-tête
  fields: {
    studentName:    "Nom de l'apprenti",
    formationTitle: "Intitulé de la formation",
    promotionLabel: "Promotion",
    employerName:   "Nom de la structure",
    tutorName:      "Maître d'apprentissage",
    contractStart:  "Début du contrat",
    contractEnd:    "Fin du contrat"
  },
  // Champs d'une période (vocabulaire E-Sport)
  period: {
    label:                "Intitulé de la période",
    startDate:            "Date de début",
    endDate:              "Date de fin",
    studentObjectives:    "Objectifs personnels",
    resources:            "Ressources / moyens envisagés",
    plannedMeans:         "Moyens prévus",
    objectivesEvaluation: "Évaluation des objectifs",
    projectDescription:   "Décrivez le projet ou la situation d'animation",
    projectContext:       "Contexte",
    projectLocation:      "Lieu",
    projectGoals:         "Objectifs du projet",
    projectMeans:         "Moyens",
    targetAudience:       "Public concerné",
    satisfyingPoints:     "Points satisfaisants",
    difficulties:         "Difficultés rencontrées",
    improvementTopics:    "Points à approfondir",
    theoryLinks:          "Liens avec les connaissances théoriques/pratiques",
    studentReport:        "Bilan de l'apprenti",
    tutorPositivePoints:  "Bilan du maître d'apprentissage — Points positifs",
    tutorImprovementAxes: "Axes d'amélioration",
    tutorReport:          "Bilan du maître d'apprentissage",
    studentSignedAt:      "Signature élève",
    tutorSignedAt:        "Signature tuteur",
    sbiValidatedAt:       "Validation SBI",
    lockedAt:             "Verrouillage"
  },
  // Acteurs / rôles (vocabulaire SBI)
  roles: {
    student: "Apprenti",
    tutor:   "Maître d'apprentissage",
    sbi:     "Visa SBI / responsable pédagogique"
  },
  annexTitle: "Référentiel Animateur E-Sport"
};

/* =====================================================================
 * 2 bis. Textes statiques du livret (rôles + guides de période)
 * ===================================================================== */
// Textes « Rôle du livret » / « Rôle de chacun » repris en PDF et en en-tête.
export const ROLE_TEXTS = {
  bookletRole:
    "Le livret d'apprentissage est l'outil de liaison entre l'apprenti, le maître " +
    "d'apprentissage en structure et le centre de formation SBI. Il retrace le parcours " +
    "de l'apprenti Animateur E-Sport : objectifs, situations d'animation, projets conduits, " +
    "bilans croisés et validations à chaque période. Il sert de preuve de suivi pédagogique.",
  actors: [
    { role: "L'apprenti", text: "complète ses objectifs, décrit ses projets et situations d'animation, et rédige ses bilans de période." },
    { role: "Le maître d'apprentissage", text: "suit l'apprenti en structure, évalue l'atteinte des objectifs et rédige le bilan côté entreprise." },
    { role: "Le responsable pédagogique SBI", text: "accompagne l'apprenti, valide chaque période et veille à la cohérence du parcours." }
  ]
};

// Guides de questions par période (1→6) — affichés en aide à la rédaction.
export const PERIOD_GUIDES = [
  { title: "Période 1 — Découverte & intégration",
    hints: ["Comment s'est passée ton intégration dans la structure ?", "Quels outils et publics as-tu découverts ?", "Quels premiers objectifs te fixes-tu ?"] },
  { title: "Période 2 — Prise en main de l'animation",
    hints: ["Quelles animations as-tu observées ou co-animées ?", "Quelles compétences techniques as-tu mobilisées ?", "Quelles difficultés as-tu rencontrées ?"] },
  { title: "Période 3 — Conception d'animations",
    hints: ["Décris une animation que tu as conçue.", "Quel public visais-tu et quels objectifs ?", "Quels moyens as-tu mis en œuvre ?"] },
  { title: "Période 4 — Conduite de projet",
    hints: ["Décris le projet d'animation conduit.", "Comment as-tu organisé et animé ?", "Quels résultats et points d'amélioration ?"] },
  { title: "Période 5 — Autonomie & événementiel",
    hints: ["Quelle action as-tu menée en autonomie ?", "Comment as-tu géré l'imprévu ?", "Quels liens avec les apports théoriques ?"] },
  { title: "Période 6 — Bilan & professionnalisation",
    hints: ["Quel bilan global de ton alternance ?", "Quelles compétences as-tu consolidées ?", "Quel est ton projet professionnel ?"] }
];

export function periodGuide(index) {
  return PERIOD_GUIDES[index] || null;
}

export function periodFieldLabel(key) {
  return LABELS.period[key] || key;
}

/* =====================================================================
 * 3. Champs de période (ordonnés)
 * ===================================================================== */
// Clés "texte" d'une période, dans l'ordre d'affichage.
export const PERIOD_FIELDS = [
  'studentObjectives',
  'resources',
  'plannedMeans',
  'objectivesEvaluation',
  'projectDescription',
  'projectContext',
  'projectLocation',
  'projectGoals',
  'projectMeans',
  'targetAudience',
  'satisfyingPoints',
  'difficulties',
  'improvementTopics',
  'theoryLinks',
  'studentReport',
  'tutorPositivePoints',
  'tutorImprovementAxes',
  'tutorReport'
];

/* =====================================================================
 * 4. Permissions (IDENTIQUE à la Cloud Function — ne pas dévier)
 * ===================================================================== */
export const FIELD_PERMISSIONS = {
  period: {
    student: [
      'studentObjectives', 'resources', 'plannedMeans',
      'projectDescription', 'projectContext', 'projectLocation',
      'projectGoals', 'projectMeans', 'targetAudience',
      'satisfyingPoints', 'difficulties', 'improvementTopics',
      'theoryLinks', 'studentReport', 'studentSignedAt'
    ],
    tutor: [
      'objectivesEvaluation', 'tutorPositivePoints',
      'tutorImprovementAxes', 'tutorReport', 'tutorSignedAt'
    ],
    // admin = TOUT : toutes les clés période + méta de pilotage
    admin: [
      ...PERIOD_FIELDS,
      'studentSignedAt', 'tutorSignedAt',
      'label', 'startDate', 'endDate', 'status',
      'sbiValidatedAt', 'lockedAt'
    ]
  },
  section: {
    student: { identity: true },
    tutor:   { employer: true, tutor: true, absencesEntreprise: true },
    admin:   {
      identity: true, employer: true, tutor: true, contract: true,
      formation: true, planningAlternance: true,
      absencesCfmfs: true, absencesEntreprise: true, meta: true
    }
  }
};

/**
 * Indique si `role` peut éditer le champ `key`.
 * @param {string} role  'student' | 'tutor' | 'admin'
 * @param {string} target 'period' | 'section'
 * @param {string} key
 */
export function canEditField(role, target, key) {
  const scope = FIELD_PERMISSIONS[target];
  if (!scope) return false;
  const allowed = scope[role];
  if (!allowed) return false;
  if (Array.isArray(allowed)) return allowed.includes(key);
  return allowed[key] === true;
}

/**
 * Liste des champs éditables par `role` pour une cible donnée.
 * Renvoie un tableau de clés (period) ou un tableau de noms de section.
 */
export function editableFieldsFor(role, target) {
  const scope = FIELD_PERMISSIONS[target];
  if (!scope) return [];
  const allowed = scope[role];
  if (!allowed) return [];
  if (Array.isArray(allowed)) return [...allowed];
  return Object.keys(allowed).filter((k) => allowed[k] === true);
}

/* =====================================================================
 * 5. Helpers purs
 * ===================================================================== */
export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));
  } catch (_) {
    return '';
  }
}

// Formatte un timestamp (ms) en chaîne 'yyyy-mm-dd' (UTC, stable).
function toIsoDay(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Découpe l'intervalle [start, end] en `count` tranches consécutives (prorata).
 * Accepte des chaînes 'yyyy-mm-dd', des ms ou des objets Timestamp-like.
 * La fin d'une tranche = veille du début de la suivante ; la dernière finit à `end`.
 * @returns {Array<{startDate:string,endDate:string}>} (vide si dates invalides).
 */
export function computeProratedPeriodDates(start, end, count = 6) {
  const slices = Math.max(1, Math.floor(count) || 0);
  const startMs = toMillis(start);
  const endMs = toMillis(end);
  if (!startMs || !endMs || endMs <= startMs) return [];

  const DAY = 24 * 60 * 60 * 1000;
  const span = endMs - startMs;
  const out = [];
  for (let i = 0; i < slices; i += 1) {
    const sliceStart = startMs + Math.round((span * i) / slices);
    const isLast = i === slices - 1;
    const nextStart = startMs + Math.round((span * (i + 1)) / slices);
    const sliceEnd = isLast ? endMs : Math.max(sliceStart, nextStart - DAY);
    out.push({ startDate: toIsoDay(sliceStart), endDate: toIsoDay(sliceEnd) });
  }
  return out;
}

/**
 * Période vierge prête à l'édition.
 */
export function EMPTY_PERIOD(label = '', index = 0) {
  const period = {
    id: `p${index + 1}`,
    label: label || `Période ${index + 1}`,
    startDate: '',
    endDate: '',
    status: 'draft'
  };
  PERIOD_FIELDS.forEach((k) => { period[k] = ''; });
  period.studentSignedAt = null;
  period.tutorSignedAt = null;
  period.sbiValidatedAt = null;
  period.lockedAt = null;
  period.updatedAt = null;
  return period;
}

/* =====================================================================
 * 6. Complétion
 * ===================================================================== */
// Champs "attendus" par période pour mesurer la complétion (recueil + bilans).
const EXPECTED_PERIOD_FIELDS = [
  'studentObjectives',
  'projectDescription',
  'projectGoals',
  'targetAudience',
  'studentReport',
  'objectivesEvaluation',
  'tutorReport'
];

// Sections d'en-tête attendues (présence d'au moins une valeur clé).
const EXPECTED_SECTIONS = [
  { key: 'identity', label: LABELS.sections.identity, check: (b) => b.studentName || (b.identity && Object.values(b.identity).some(Boolean)) },
  { key: 'employer', label: LABELS.sections.employer, check: (b) => b.employerName || (b.employer && Object.values(b.employer).some(Boolean)) },
  { key: 'tutor',    label: LABELS.sections.tutor,    check: (b) => b.tutorName || (b.tutor && Object.values(b.tutor).some(Boolean)) },
  { key: 'contract', label: LABELS.sections.contract, check: (b) => b.contractStart || b.contractEnd || (b.contract && Object.values(b.contract).some(Boolean)) }
];

function hasValue(v) {
  return v != null && String(v).trim() !== '';
}

/**
 * Calcule le taux de complétion (%) et la liste des champs manquants.
 * Couvre les champs attendus des 6 périodes + les sections clés.
 * @returns {{ rate:number, missing:string[], filled:number, total:number }}
 */
export function computeCompletion(booklet = {}) {
  const missing = [];
  let filled = 0;
  let total = 0;

  // Sections d'en-tête
  EXPECTED_SECTIONS.forEach((s) => {
    total += 1;
    if (s.check(booklet)) filled += 1;
    else missing.push(s.label);
  });

  // Périodes
  const periods = Array.isArray(booklet.periods) ? booklet.periods : [];
  periods.forEach((period, idx) => {
    const plabel = (period && period.label) || `Période ${idx + 1}`;
    EXPECTED_PERIOD_FIELDS.forEach((key) => {
      total += 1;
      if (period && hasValue(period[key])) filled += 1;
      else missing.push(`${plabel} — ${periodFieldLabel(key)}`);
    });
  });

  const rate = total > 0 ? Math.round((filled / total) * 100) : 0;
  return { rate, missing, filled, total };
}

/* =====================================================================
 * 7. Cloud Functions callables
 * ===================================================================== */
let functionsInstance = null;
export function bookletFunctions() {
  if (!functionsInstance) functionsInstance = getFunctions(app, FUNCTIONS_REGION);
  return functionsInstance;
}

const callableCache = new Map();
function bookletCallable(name) {
  if (!callableCache.has(name)) {
    callableCache.set(name, httpsCallable(bookletFunctions(), name));
  }
  return callableCache.get(name);
}

export function generateBooklet(payload) {
  return bookletCallable('generateApprenticeshipBooklet')(payload);
}
export function updateBookletSection(payload) {
  return bookletCallable('updateBookletSection')(payload);
}
export function validateBookletPeriod(payload) {
  return bookletCallable('validateBookletPeriod')(payload);
}
export function lockBookletPeriod(payload) {
  return bookletCallable('lockBookletPeriod')(payload);
}
export function assignBookletTutor(payload) {
  return bookletCallable('assignBookletTutor')(payload);
}
// SBI — recalcule au prorata les dates des périodes non verrouillées (admin).
export function recomputeBookletPeriodDates(payload) {
  return bookletCallable('recomputeApprenticeshipBookletPeriodDates')(payload);
}

// SBI 8.0P.167.298 — Génération serveur du dossier PDF (corps rendu via
// Puppeteer + paged.js, sommaire à pages réelles), puis fusion des annexes PDF
// de la formation. Renvoie { success, url, fileName, bodyPages, annexCount, missing }.
export function buildBookletPdf(payload) {
  return bookletCallable('buildApprenticeshipBookletPdf')(payload);
}

/* =====================================================================
 * 8. Loaders Firestore (lecture directe autorisée par rôle)
 * ===================================================================== */
const COLLECTION = 'apprenticeshipBooklets';

function snapToBooklet(snap) {
  if (!snap || !snap.exists()) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

export async function loadBooklet({ db, bookletId } = {}) {
  const id = String(bookletId || '').trim();
  if (!db || !id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snapToBooklet(snap);
}

// bookletId === studentId : raccourci documenté.
export async function loadBookletByStudent({ db, studentId } = {}) {
  return loadBooklet({ db, bookletId: studentId });
}

export async function loadBookletsForTutor({ db, tutorId } = {}) {
  const id = String(tutorId || '').trim();
  if (!db || !id) return [];
  const q = query(collection(db, COLLECTION), where('tutorId', '==', id));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
  return list;
}

export async function loadBookletsForAdmin({ db, filters = {} } = {}) {
  if (!db) return [];
  const constraints = [];
  if (filters.formationId) constraints.push(where('formationId', '==', String(filters.formationId)));
  if (filters.promotionId) constraints.push(where('promotionId', '==', String(filters.promotionId)));
  if (filters.status) constraints.push(where('status', '==', String(filters.status)));
  const ref = collection(db, COLLECTION);
  const q = constraints.length ? query(ref, ...constraints) : ref;
  const snap = await getDocs(q);
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
  return list;
}

export async function loadBookletsForTeacherPromotions({ db, promotionIds = [] } = {}) {
  const ids = [...new Set((promotionIds || []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (!db || !ids.length) return [];
  const ref = collection(db, COLLECTION);
  const results = new Map();
  // Firestore `in` accepte au plus 30 valeurs : on découpe par lots.
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(query(ref, where('promotionId', 'in', chunk)));
    snap.forEach((d) => results.set(d.id, { id: d.id, ...(d.data() || {}) }));
  }
  return [...results.values()];
}

// SBI 8.0P.167.288 — un livret peut être rattaché par formation (promotion
// optionnelle). Le prof de la formation y a droit (règle formationDocHasCurrentUser),
// mais il faut aussi le requêter par formationId, sinon invisible.
export async function loadBookletsForTeacherFormations({ db, formationIds = [] } = {}) {
  const ids = [...new Set((formationIds || []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (!db || !ids.length) return [];
  const ref = collection(db, COLLECTION);
  const results = new Map();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(query(ref, where('formationId', 'in', chunk)));
    snap.forEach((d) => results.set(d.id, { id: d.id, ...(d.data() || {}) }));
  }
  return [...results.values()];
}

// Union dédupliquée : livrets visibles par un prof via ses promotions ET ses formations.
export async function loadBookletsForTeacher({ db, promotionIds = [], formationIds = [] } = {}) {
  const byId = new Map();
  try {
    (await loadBookletsForTeacherPromotions({ db, promotionIds })).forEach((b) => byId.set(b.id, b));
  } catch (error) {
    console.warn('[SBI Booklet] lecture par promotions échouée :', error?.message || error);
  }
  try {
    (await loadBookletsForTeacherFormations({ db, formationIds })).forEach((b) => byId.set(b.id, b));
  } catch (error) {
    console.warn('[SBI Booklet] lecture par formations échouée :', error?.message || error);
  }
  return [...byId.values()];
}
