/**
 * SBI 8.0P.167.262
 * Écran admin "Élèves en retard sur leur cursus" (Plan B - suivi / Qualiopi, lot v1).
 *
 * Périmètre v1 :
 * - lecture seule ; aucune écriture Firestore ;
 * - croise promotions.coursePlan (planning daté) avec users.learningProgress
 *   (progression réelle) pour détecter les cours en retard ;
 * - retard = cours OBLIGATOIRE dont l'échéance est passée ET dont le statut
 *   élève n'est pas 'done'.
 *
 * Calqué sur admin-cursus-dates-qa.js (même chargement promotions + élèves,
 * mêmes utilitaires dates dupliqués localement pour rester auto-contenu).
 * Hors périmètre v1 : relances, couverture Qualiopi, assiduité Live.
 */

import { app, auth, db } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const sbiFunctions = getFunctions(app, 'europe-west1');
const callGetLiveAttendance = httpsCallable(sbiFunctions, 'getPromotionLiveAttendanceBatch');
const callSendLateReminder = httpsCallable(sbiFunctions, 'sendLateStudentReminder');

let mounted = false;
let mountedView = null;
let currentAdmin = null;
let promotions = [];
let templates = [];
let studentsByPromotion = new Map();
let latenessByPromotion = new Map();
let qualiopiByPromotion = new Map();
let rowsByPromotion = new Map();
let liveByPromotion = new Map();
let selectedPromotionId = '';
let selectedStudentId = '';
let studentFilter = 'all';
let studentSearch = '';
let studentSort = 'difficulty';
let loading = false;
let unsubscribeAuth = null;

const STRUCTURAL_TYPES = ['real_course', 'course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'];
const REAL_COURSE_TYPES = ['real_course', 'course'];
const STUDENT_ROLES = ['student', 'eleve', 'élève', 'etudiant', 'étudiant'];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clean(value = '', max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function formatDate(value, fallback = 'Non renseigné') {
  if (!value) return fallback;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const ms = toMillis(value);
  if (!ms) return fallback;
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));
  } catch (_) {
    return fallback;
  }
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isIsoDate(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function addDaysToDateString(dateString = '', days = 0) {
  if (!isIsoDate(dateString)) return '';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(startDate = '', endDate = '') {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function getPromotionLabel(promotion = {}) {
  return clean(promotion.name || promotion.promotionName || 'Promotion sans nom', 160);
}

function getType(item = {}) {
  const rawType = item.type || item.itemType || '';
  if (rawType === 'course') return item.courseId ? 'real_course' : 'placeholder_course';
  if (rawType) return rawType;
  return item.courseId ? 'real_course' : 'placeholder_course';
}

function isStructural(item = {}) {
  return STRUCTURAL_TYPES.includes(getType(item));
}

function isRealCourse(item = {}) {
  return REAL_COURSE_TYPES.includes(getType(item)) && !!item.courseId;
}

function isRequiredItem(item = {}) {
  // Obligatoire par défaut, sauf isRequired explicitement à false.
  return item.isRequired !== false;
}

function getDurationDays(item = {}) {
  return Math.max(1, Math.round(toNumber(
    item.targetDurationDays || item.durationDays || item.relativeDurationDays || item.modelDurationDays || item.estimatedDurationDays || 7,
    7
  )));
}

function getStartDate(item = {}) {
  return item.recommendedStartAt || item.plannedStartAt || item.startAt || item.startDate || '';
}

function getEndDate(item = {}) {
  return item.recommendedEndAt || item.plannedEndAt || item.endAt || item.endDate || '';
}

function getDeadlineDate(item = {}) {
  return item.deadlineAt || item.dueAt || item.recommendedEndAt || item.plannedEndAt || '';
}

function getItemTitle(item = {}) {
  return clean(item.courseTitle || item.title || item.label || 'Cours', 180);
}

function normalizeTemplateItems(template = {}) {
  const items = Array.isArray(template.items) ? template.items : [];
  return items.map((item, index) => ({
    ...item,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    durationDays: getDurationDays(item),
    source: item.source || 'late-template-fallback'
  })).sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0));
}

function getFallbackPlanFromTemplate(promotion = {}) {
  const templateId = promotion.curriculumTemplateId || '';
  if (!templateId) return [];
  const template = templates.find((item) => item.id === templateId) || null;
  if (!template) return [];
  const items = normalizeTemplateItems(template);
  if (!items.length || !promotion.startDate) return items;

  const modelDuration = Math.max(1, Number(template.effectiveDurationDays || template.durationDays || 0) || items.reduce((sum, item) => sum + (isStructural(item) ? getDurationDays(item) : 0), 0) || 1);
  const rawTarget = promotion.endDate ? diffDaysInclusive(promotion.startDate, promotion.endDate) : 0;
  const targetDuration = rawTarget > 0 ? rawTarget : modelDuration;
  const scale = targetDuration / modelDuration;

  return items.map((item) => {
    const rawStart = Math.max(0, Number(item.relativeStartOffsetDays ?? item.modelStartOffsetDays ?? item.startOffsetDays ?? 0) || 0);
    const rawDuration = getDurationDays(item);
    const startOffset = Math.max(0, Math.round(rawStart * scale));
    const duration = Math.max(1, Math.round(rawDuration * scale));
    const start = addDaysToDateString(promotion.startDate, startOffset);
    const end = addDaysToDateString(start, duration - 1);
    return {
      ...item,
      recommendedStartAt: start,
      recommendedEndAt: end,
      deadlineAt: item.deadlineAt || item.dueAt || end,
      source: 'late-template-prorata-fallback'
    };
  });
}

function getPlanForPromotion(promotion = {}) {
  const stored = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
  const plan = stored.length ? stored : getFallbackPlanFromTemplate(promotion);
  return plan
    .map((item, index) => ({ ...item, order: Number.isFinite(Number(item.order)) ? Number(item.order) : index }))
    .sort((a, b) => {
      const dateA = getStartDate(a) || '9999-12-31';
      const dateB = getStartDate(b) || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return toNumber(a.order, 0) - toNumber(b.order, 0);
    });
}

function getStudentName(student = {}) {
  return clean(`${student.prenom || ''} ${student.nom || ''}`) || student.displayName || student.email || 'Élève sans nom';
}

function getStudentsForPromotion(promotionId = '') {
  return studentsByPromotion.get(promotionId) || [];
}

function getCourseStatus(student = {}, courseId = '') {
  const courses = student.learningProgress?.courses || {};
  const entry = courses[courseId] || null;
  if (!entry) return 'todo';
  return String(entry.status || 'todo');
}

/**
 * Calcule, pour un élève et un coursePlan, deux signaux distincts sur les cours
 * réels obligatoires (sans recouvrement entre eux) :
 *  - RETARD     : échéance (deadline) dépassée ET statut != 'done'.
 *  - DÉCROCHAGE : date de début recommandée dépassée ET statut == 'todo'
 *                 (pas même commencé), tant que le cours n'est PAS déjà en retard
 *                 → signal préventif, avant que l'échéance ne tombe.
 */
function computeStudentLateness(student = {}, plan = [], today = todayIso()) {
  const lateCourses = [];
  const dropoutCourses = [];
  plan.forEach((item) => {
    if (!isRealCourse(item)) return;
    if (!isRequiredItem(item)) return;
    const courseId = item.courseId;
    if (!courseId) return;
    const status = getCourseStatus(student, courseId);
    const deadline = getDeadlineDate(item);
    const start = getStartDate(item);
    const deadlinePassed = isIsoDate(deadline) && deadline < today;

    if (deadlinePassed && status !== 'done') {
      // RETARD (échéance dépassée, pas terminé)
      lateCourses.push({
        courseId,
        title: getItemTitle(item),
        deadline,
        status,
        daysLate: Math.max(1, diffDaysInclusive(deadline, today) - 1)
      });
    } else if (isIsoDate(start) && start < today && status === 'todo') {
      // DÉCROCHAGE (début dépassé, pas commencé, pas déjà en retard)
      dropoutCourses.push({
        courseId,
        title: getItemTitle(item),
        start,
        daysSinceStart: Math.max(1, diffDaysInclusive(start, today) - 1)
      });
    }
  });

  lateCourses.sort((a, b) => b.daysLate - a.daysLate);
  dropoutCourses.sort((a, b) => b.daysSinceStart - a.daysSinceStart);
  const maxDaysLate = lateCourses.reduce((max, course) => Math.max(max, course.daysLate), 0);
  const maxDaysSinceStart = dropoutCourses.reduce((max, course) => Math.max(max, course.daysSinceStart), 0);

  return {
    lateCourses,
    lateCount: lateCourses.length,
    maxDaysLate,
    isLate: lateCourses.length > 0,
    dropoutCourses,
    dropoutCount: dropoutCourses.length,
    maxDaysSinceStart,
    isDropout: dropoutCourses.length > 0
  };
}

function computePromotionLateness(promotion = {}) {
  const plan = getPlanForPromotion(promotion);
  const datedRequiredCount = plan.filter((item) => isRealCourse(item) && isRequiredItem(item) && isIsoDate(getDeadlineDate(item))).length;
  const datedStartCount = plan.filter((item) => isRealCourse(item) && isRequiredItem(item) && isIsoDate(getStartDate(item))).length;
  const students = getStudentsForPromotion(promotion.id);
  const today = todayIso();

  const rows = students.map((student) => ({
    student,
    lateness: computeStudentLateness(student, plan, today)
  }));

  const lateRows = rows
    .filter((row) => row.lateness.isLate)
    .sort((a, b) => {
      if (b.lateness.maxDaysLate !== a.lateness.maxDaysLate) return b.lateness.maxDaysLate - a.lateness.maxDaysLate;
      if (b.lateness.lateCount !== a.lateness.lateCount) return b.lateness.lateCount - a.lateness.lateCount;
      return getStudentName(a.student).localeCompare(getStudentName(b.student), 'fr', { sensitivity: 'base' });
    });

  const dropoutRows = rows
    .filter((row) => row.lateness.isDropout)
    .sort((a, b) => {
      if (b.lateness.maxDaysSinceStart !== a.lateness.maxDaysSinceStart) return b.lateness.maxDaysSinceStart - a.lateness.maxDaysSinceStart;
      if (b.lateness.dropoutCount !== a.lateness.dropoutCount) return b.lateness.dropoutCount - a.lateness.dropoutCount;
      return getStudentName(a.student).localeCompare(getStudentName(b.student), 'fr', { sensitivity: 'base' });
    });

  return {
    plan,
    datedRequiredCount,
    datedStartCount,
    studentCount: students.length,
    lateRows,
    lateStudentCount: lateRows.length,
    dropoutRows,
    dropoutStudentCount: dropoutRows.length
  };
}

function getPromotionLatenessCached(promotion = {}) {
  if (latenessByPromotion.has(promotion.id)) return latenessByPromotion.get(promotion.id);
  const result = computePromotionLateness(promotion);
  latenessByPromotion.set(promotion.id, result);
  return result;
}

// Détection canonique d'une preuve Qualiopi (alignée sur
// admin-cursus-qualiopi-evidence-bridge.js : plusieurs formes de flag tolérées).
function isQualiopiEvidenceItem(item = {}) {
  return Boolean(
    item.isQualiopiEvidence === true
    || item.qualiopiEvidence === true
    || item.isEvidenceForQualiopi === true
    || item.evidenceScope === 'qualiopi'
    || (Array.isArray(item.evidenceTags) && item.evidenceTags.includes('qualiopi'))
  );
}

// Couverture Qualiopi d'UN élève sur la liste des preuves-cours mesurables.
function computeStudentQualiopi(student = {}, evidenceCourses = []) {
  const missing = [];
  let covered = 0;
  evidenceCourses.forEach((item) => {
    if (getCourseStatus(student, item.courseId) === 'done') covered += 1;
    else missing.push({ courseId: item.courseId, title: getItemTitle(item) });
  });
  return { covered, total: evidenceCourses.length, missing };
}

/**
 * Couverture Qualiopi d'une promotion (v1, lecture seule).
 * Preuves attendues = items du coursePlan marqués Qualiopi. Parmi elles, seules
 * les preuves de type COURS (avec courseId) sont mesurables automatiquement via
 * learningProgress (status 'done'). Les preuves hors-cours (devoir/examen/live)
 * sont comptées mais non mesurables en v1 (lots ultérieurs : rendus, assiduité).
 */
function computePromotionQualiopi(promotion = {}) {
  const plan = getPlanForPromotion(promotion);
  const evidenceItems = plan.filter(isQualiopiEvidenceItem);
  const evidenceCourses = evidenceItems.filter(isRealCourse);
  const measurable = evidenceCourses.length;
  const students = getStudentsForPromotion(promotion.id);

  let totalCovered = 0;
  const studentRows = students.map((student) => {
    const { covered, missing } = computeStudentQualiopi(student, evidenceCourses);
    totalCovered += covered;
    return { student, covered, total: measurable, missing };
  });

  const denom = students.length * measurable;
  const coverageRate = denom > 0 ? Math.round((totalCovered / denom) * 100) : null;
  const studentsWithGaps = studentRows
    .filter((row) => row.missing.length > 0)
    .sort((a, b) => {
      if (b.missing.length !== a.missing.length) return b.missing.length - a.missing.length;
      return getStudentName(a.student).localeCompare(getStudentName(b.student), 'fr', { sensitivity: 'base' });
    });

  return {
    evidenceTotal: evidenceItems.length,
    evidenceCourses: measurable,
    evidenceNonCourse: evidenceItems.length - measurable,
    studentCount: students.length,
    coverageRate,
    studentsWithGaps
  };
}

function getPromotionQualiopiCached(promotion = {}) {
  if (qualiopiByPromotion.has(promotion.id)) return qualiopiByPromotion.get(promotion.id);
  const result = computePromotionQualiopi(promotion);
  qualiopiByPromotion.set(promotion.id, result);
  return result;
}

// ── Export Qualiopi (CSV, lecture seule) ───────────────────────────────────
function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function slugify(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'promotion';
}

/**
 * Construit le CSV de synthèse Qualiopi d'une promotion : bloc de métadonnées
 * (promotion + indicateurs globaux) puis une ligne par élève (retard, décrochage,
 * couverture Qualiopi, preuves manquantes). Séparateur ';' pour Excel FR.
 */
function buildPromotionQualiopiCsv(promotion = {}, adminEmail = '') {
  const plan = getPlanForPromotion(promotion);
  const lateness = computePromotionLateness(promotion);
  const qualiopi = computePromotionQualiopi(promotion);
  const evidenceCourses = plan.filter((item) => isQualiopiEvidenceItem(item) && isRealCourse(item));
  const students = getStudentsForPromotion(promotion.id);
  const today = todayIso();

  const meta = [
    ['Export Qualiopi'],
    ['Promotion', getPromotionLabel(promotion)],
    ['Formation', promotion.formationName || ''],
    ['Cursus', promotion.curriculumTitle || ''],
    ['Periode', `${formatDate(promotion.startDate)} -> ${formatDate(promotion.endDate)}`],
    ["Date d'export", formatDate(today)],
    ['Genere par', adminEmail || ''],
    ['Eleves rattaches', students.length],
    ['Cours obligatoires dates', lateness.datedRequiredCount],
    ['Eleves en retard', lateness.lateStudentCount],
    ['Eleves en decrochage', lateness.dropoutStudentCount],
    ['Preuves Qualiopi (cours mesurables)', qualiopi.evidenceCourses],
    ['Preuves Qualiopi hors-cours (non mesurees)', qualiopi.evidenceNonCourse],
    ['Couverture Qualiopi (%)', qualiopi.coverageRate === null ? 'N/A' : qualiopi.coverageRate],
    []
  ];

  const header = ['Eleve', 'Email', 'En retard (nb)', 'Cours en retard', 'Non commences (nb)', 'Cours non commences', 'Preuves couvertes', 'Preuves attendues', 'Preuves manquantes', 'Couverture eleve (%)', 'Heures connexion'];

  const rows = students
    .map((student) => {
      const l = computeStudentLateness(student, plan, today);
      const q = computeStudentQualiopi(student, evidenceCourses);
      const cov = q.total > 0 ? Math.round((q.covered / q.total) * 100) : '';
      return { student, l, q, cov, sortKey: (l.lateCount * 1000) + (l.dropoutCount * 10) + q.missing.length };
    })
    .sort((a, b) => {
      if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
      return getStudentName(a.student).localeCompare(getStudentName(b.student), 'fr', { sensitivity: 'base' });
    })
    .map(({ student, l, q, cov }) => [
      getStudentName(student),
      student.email || '',
      l.lateCount,
      l.lateCourses.map((course) => course.title).join(' | '),
      l.dropoutCount,
      l.dropoutCourses.map((course) => course.title).join(' | '),
      q.covered,
      q.total,
      q.missing.map((item) => item.title).join(' | '),
      cov,
      typeof student.connectionHours === 'number' ? student.connectionHours : ''
    ]);

  return [
    ...meta.map((cells) => cells.map(csvCell).join(';')),
    header.map(csvCell).join(';'),
    ...rows.map((cells) => cells.map(csvCell).join(';'))
  ].join('\r\n');
}

function triggerCsvDownload(filename, content) {
  const bom = String.fromCharCode(0xFEFF); // BOM UTF-8 pour Excel FR
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportSelectedPromotionQualiopi() {
  const promotion = promotions.find((item) => item.id === selectedPromotionId) || null;
  if (!promotion) return;
  const csv = buildPromotionQualiopiCsv(promotion, currentAdmin?.email || '');
  triggerCsvDownload(`qualiopi-${slugify(getPromotionLabel(promotion))}-${todayIso()}.csv`, csv);
}

// ── Export PDF / registre qualité (client-side, impression navigateur) ──────
function registryStyles() {
  return `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter','Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.45; color:#0a1020; background:#fff; }
    .reg { max-width:210mm; margin:0 auto; padding:16mm 14mm; }
    .reg-head { display:flex; justify-content:space-between; align-items:center; gap:18px; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #0051ff; }
    .reg-head img { height:46px; width:auto; }
    .reg-head .reg-title { text-align:center; flex:1; }
    .reg-head h1 { font-size:17px; font-weight:900; color:#0051ff; letter-spacing:.02em; }
    .reg-head p { font-size:12px; color:#5a6478; margin-top:3px; }
    h2 { font-size:12px; font-weight:800; color:#0051ff; text-transform:uppercase; letter-spacing:.04em; margin:16px 0 8px; }
    table { width:100%; border-collapse:collapse; }
    .reg-meta td { padding:3px 0; vertical-align:top; }
    .reg-meta td:first-child { font-weight:800; width:130px; color:#3a4459; }
    .reg-table { border:1px solid #cdd6e6; }
    .reg-table th { background:#eef3ff; font-weight:800; text-align:left; padding:6px 8px; border:1px solid #cdd6e6; }
    .reg-table td { padding:5px 8px; border:1px solid #cdd6e6; }
    .reg-table tbody tr:nth-child(even) { background:#f7faff; }
    .reg-table .num { text-align:center; }
    .reg-table .warn { color:#c0392b; font-weight:700; }
    .reg-foot { margin-top:24px; padding-top:10px; border-top:1px solid #cdd6e6; text-align:center; color:#7a8499; font-size:9px; }
    @media print { .reg { padding:10mm; } @page { size:A4; margin:8mm; } }
  `;
}

function buildPromotionRegistryHtml(promotion = {}, adminEmail = '') {
  const { global, rows } = computePromotionRows(promotion);
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
  const today = todayIso();

  const studentRows = [...rows]
    .sort((a, b) => {
      if (b.lateness.lateCount !== a.lateness.lateCount) return b.lateness.lateCount - a.lateness.lateCount;
      if (b.lateness.dropoutCount !== a.lateness.dropoutCount) return b.lateness.dropoutCount - a.lateness.dropoutCount;
      return getStudentName(a.student).localeCompare(getStudentName(b.student), 'fr', { sensitivity: 'base' });
    })
    .map((row, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(getStudentName(row.student))}</td>
        <td>${escapeHtml(row.student.email || '—')}</td>
        <td class="num ${row.lateness.lateCount ? 'warn' : ''}">${row.lateness.lateCount}</td>
        <td class="num">${row.lateness.dropoutCount}</td>
        <td class="num">${row.qualiopi.total ? `${row.qualiopi.covered}/${row.qualiopi.total}` : '—'}</td>
        <td class="num">${row.coverage === null ? '—' : row.coverage + '%'}</td>
        <td class="num">${typeof row.student.connectionHours === 'number' ? row.student.connectionHours : '—'}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Registre suivi — ${escapeHtml(getPromotionLabel(promotion))}</title>
<style>${registryStyles()}</style></head>
<body><div class="reg">
  <div class="reg-head">
    <img src="${origin}/assets/Logo_SBI_Tome.png" alt="SBI">
    <div class="reg-title"><h1>REGISTRE DE SUIVI PÉDAGOGIQUE</h1><p>${escapeHtml(promotion.formationName || 'Formation')}</p></div>
    <img src="${origin}/assets/logo-qualiopi-cfa.png" alt="Qualiopi">
  </div>

  <table class="reg-meta">
    <tr><td>Promotion</td><td>${escapeHtml(getPromotionLabel(promotion))}</td></tr>
    <tr><td>Cursus</td><td>${escapeHtml(promotion.curriculumTitle || '—')}</td></tr>
    <tr><td>Période</td><td>${formatDate(promotion.startDate)} → ${formatDate(promotion.endDate)}</td></tr>
    <tr><td>Date d'édition</td><td>${formatDate(today)}</td></tr>
    <tr><td>Édité par</td><td>${escapeHtml(adminEmail || '—')}</td></tr>
  </table>

  <h2>Synthèse</h2>
  <table class="reg-table">
    <thead><tr><th>Élèves</th><th>En retard</th><th>En décrochage</th><th>Preuves manquantes</th><th>Couverture Qualiopi</th><th>Cours oblig. datés</th></tr></thead>
    <tbody><tr class="num">
      <td class="num">${global.studentCount}</td>
      <td class="num">${global.lateStudentCount}</td>
      <td class="num">${global.dropoutStudentCount}</td>
      <td class="num">${global.gapStudentCount}</td>
      <td class="num">${global.coverageRate === null ? 'N/A' : global.coverageRate + '%'}</td>
      <td class="num">${global.datedRequiredCount}</td>
    </tr></tbody>
  </table>

  <h2>Détail par élève</h2>
  <table class="reg-table">
    <thead><tr><th class="num">#</th><th>Élève</th><th>Email</th><th>Retard</th><th>Décroch.</th><th>Preuves</th><th>Couv.</th><th class="num">Conn. (h)</th></tr></thead>
    <tbody>${studentRows || '<tr><td colspan="8">Aucun élève rattaché.</td></tr>'}</tbody>
  </table>

  <div class="reg-foot">Document de suivi pédagogique — Sport Business Institute / CFMFS · Confidentiel · Édité le ${formatDate(today)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;
}

function exportSelectedPromotionRegistry() {
  const promotion = promotions.find((item) => item.id === selectedPromotionId) || null;
  if (!promotion) return;
  const html = buildPromotionRegistryHtml(promotion, currentAdmin?.email || '');
  const win = window.open('', `registre-${promotion.id}`, 'width=920,height=680,menubar=yes,toolbar=yes');
  if (!win) {
    alert('La fenêtre du registre a été bloquée par le navigateur. Autorise les pop-ups pour ce site, puis réessaie.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ── Assiduité Live (Cloud Function batch, chargement async non bloquant) ────
async function ensureLiveAttendance(promotionId = '') {
  if (!promotionId || liveByPromotion.has(promotionId)) return;
  liveByPromotion.set(promotionId, { status: 'loading' });
  try {
    const res = await callGetLiveAttendance({ promotionId });
    const data = res?.data || {};
    liveByPromotion.set(promotionId, { status: 'ready', liveCount: data.liveCount || 0, byStudent: data.byStudent || {} });
  } catch (error) {
    console.warn('[SBI Retards] Assiduité live indisponible :', error?.message || error);
    liveByPromotion.set(promotionId, { status: 'error' });
  }
  if (promotionId === selectedPromotionId) {
    renderStudentFiche();
  }
}

function renderLiveSection(studentId = '') {
  const entry = liveByPromotion.get(selectedPromotionId);
  if (!entry || entry.status === 'loading') {
    return '<div class="sbi-late-fiche-section"><h4>Assiduité Live</h4><div class="sbi-late-empty">Chargement de l\'assiduité…</div></div>';
  }
  if (entry.status === 'error') {
    return '<div class="sbi-late-fiche-section"><h4>Assiduité Live</h4><div class="sbi-late-empty">Assiduité live indisponible (function non déployée ou accès refusé).</div></div>';
  }
  const rec = entry.byStudent[studentId] || { liveCount: entry.liveCount || 0, attendedCount: 0 };
  if (!rec.liveCount) {
    return '<div class="sbi-late-fiche-section"><h4>Assiduité Live</h4><div class="sbi-late-empty">Aucun live cursus pour cette promotion.</div></div>';
  }
  const rate = Math.round((rec.attendedCount / rec.liveCount) * 100);
  return `
    <div class="sbi-late-fiche-section">
      <h4>Assiduité Live <span class="sbi-late-q-kicker">${rec.attendedCount}/${rec.liveCount}</span></h4>
      <div class="sbi-late-qbar"><span style="width:${rate}%"></span></div>
      <div class="sbi-late-empty">${rate}% suivi (présence en direct ou replay) sur ${rec.liveCount} live${rec.liveCount > 1 ? 's' : ''} cursus.</div>
    </div>`;
}

// ── Relance email d'un élève en retard (Cloud Function Brevo, confirmation) ──
async function handleSendReminder(studentId = '') {
  const promotion = promotions.find((item) => item.id === selectedPromotionId);
  if (!promotion) return;
  const row = getPromotionRowsCached(promotion).rows.find((item) => item.student.id === studentId);
  if (!row) return;
  const student = row.student;
  const lateCourses = row.lateness.lateCourses || [];
  const confirmed = window.confirm(
    `Envoyer une relance par email à ${getStudentName(student)} (${student.email || 'sans email'}) ?\n\n`
    + `${row.lateness.lateCount} cours en retard. L'élève recevra un email l'invitant à les rattraper.\n`
    + `(1 relance max par 24h et par élève.)`
  );
  if (!confirmed) return;

  const btn = document.querySelector('[data-action="send-reminder"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
  try {
    const res = await callSendLateReminder({
      studentUid: studentId,
      promotionId: promotion.id,
      lateCount: row.lateness.lateCount,
      lateCourses: lateCourses.map((course) => ({ title: course.title, deadline: course.deadline }))
    });
    window.alert(res?.data?.message || 'Relance envoyée.');
  } catch (error) {
    window.alert('Échec de la relance : ' + (error?.message || error));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Relancer par email'; }
  }
}

function ensureStyles() {
  if (document.getElementById('sbi-late-students-style')) return;
  const style = document.createElement('style');
  style.id = 'sbi-late-students-style';
  style.textContent = `
    .sbi-late-shell { display:grid; gap:1rem; padding:1rem; min-height:calc(100vh - 90px); color:#eaf0ff; }
    .sbi-late-hero, .sbi-late-panel { border:1px solid rgba(255,255,255,.10); border-radius:22px; background:rgba(5,9,20,.74); box-shadow:0 18px 42px rgba(0,0,0,.22); }
    .sbi-late-hero { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; padding:1.15rem; }
    .sbi-late-hero h2 { margin:.15rem 0 .35rem; color:#fff; font-size:1.35rem; }
    .sbi-late-hero p { margin:0; color:#9fb0cf; max-width:760px; line-height:1.45; }
    .sbi-late-kicker { color:#ffb4a2 !important; text-transform:uppercase; letter-spacing:.12em; font-size:.72rem; font-weight:800; }
    .sbi-late-actions { display:flex; gap:.5rem; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
    .sbi-late-hero-metric { text-align:right; }
    .sbi-late-hero-metric strong { display:block; color:#fff; font-size:1.9rem; line-height:1; }
    .sbi-late-hero-metric span { display:block; margin-top:.25rem; color:#9fb0cf; font-size:.76rem; }
    .sbi-late-btn { display:inline-flex; align-items:center; justify-content:center; min-height:2.35rem; padding:0 .85rem; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#fff; text-decoration:none; cursor:pointer; font-weight:700; font-size:.84rem; }
    .sbi-late-btn.is-primary { border-color:rgba(42,87,255,.4); background:linear-gradient(135deg,rgba(42,87,255,.9),rgba(0,210,255,.55)); }
    .sbi-late-grid { display:grid; grid-template-columns: minmax(280px, 360px) minmax(0,1fr); gap:1rem; align-items:start; }
    .sbi-late-panel { padding:1rem; }
    .sbi-late-panel-head { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:.85rem; }
    .sbi-late-panel-head h3 { margin:0 0 .2rem; color:#fff; font-size:1rem; }
    .sbi-late-panel-head p { margin:0; color:#9fb0cf; font-size:.8rem; }
    #late-search { width:100%; box-sizing:border-box; padding:.8rem .9rem; margin-bottom:.75rem; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.055); color:#fff; outline:none; }
    .sbi-late-list { display:grid; gap:.55rem; max-height:calc(100vh - 280px); overflow:auto; padding-right:.15rem; }
    .sbi-late-promo { width:100%; text-align:left; border:1px solid rgba(255,255,255,.09); border-radius:16px; background:rgba(255,255,255,.045); color:#eaf0ff; padding:.78rem; cursor:pointer; transition:transform .16s ease, border-color .16s ease, background .16s ease; }
    .sbi-late-promo:hover, .sbi-late-promo.is-active { transform:translateY(-1px); border-color:rgba(255,180,162,.42); background:rgba(255,180,162,.08); }
    .sbi-late-promo.has-late { border-color:rgba(255,138,128,.35); }
    .sbi-late-promo strong { display:block; color:#fff; margin-bottom:.25rem; }
    .sbi-late-promo small { display:grid; gap:.12rem; color:#9fb0cf; line-height:1.35; }
    .sbi-late-count-pill { display:inline-flex; align-items:center; gap:.3rem; min-height:1.35rem; padding:0 .5rem; border-radius:999px; font-size:.72rem; font-weight:800; }
    .sbi-late-count-pill.is-late { background:rgba(255,99,71,.16); color:#ffb4a2; border:1px solid rgba(255,99,71,.3); }
    .sbi-late-count-pill.is-ok { background:rgba(80,220,160,.12); color:#9af5c8; border:1px solid rgba(80,220,160,.26); }
    .sbi-late-empty { border:1px dashed rgba(255,255,255,.14); border-radius:18px; padding:1rem; color:#9fb0cf; background:rgba(255,255,255,.035); }
    .sbi-late-empty.is-large { padding:2rem; text-align:center; }
    .sbi-late-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.7rem; margin:.9rem 0; }
    .sbi-late-metric { border:1px solid rgba(255,255,255,.09); border-radius:16px; background:rgba(255,255,255,.045); padding:.8rem; }
    .sbi-late-metric strong { display:block; color:#fff; font-size:1.25rem; line-height:1; }
    .sbi-late-metric span { display:block; margin-top:.35rem; color:#9fb0cf; font-size:.76rem; }
    .sbi-late-warning { border:1px solid rgba(255,209,102,.18); border-radius:12px; padding:.6rem .7rem; margin:.6rem 0; background:rgba(255,209,102,.07); color:#ffe9ad; font-size:.82rem; }
    .sbi-late-students-list { display:grid; gap:.7rem; }
    .sbi-late-student { border:1px solid rgba(255,99,71,.18); border-radius:16px; background:rgba(255,99,71,.045); padding:.85rem; }
    .sbi-late-student-head { display:flex; justify-content:space-between; gap:.75rem; align-items:flex-start; flex-wrap:wrap; }
    .sbi-late-student-head strong { display:block; color:#fff; }
    .sbi-late-student-head small { color:#9fb0cf; font-size:.78rem; }
    .sbi-late-badges { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; }
    .sbi-late-badge { display:inline-flex; align-items:center; min-height:1.5rem; padding:0 .55rem; border-radius:999px; font-size:.74rem; font-weight:800; border:1px solid rgba(255,99,71,.3); background:rgba(255,99,71,.14); color:#ffb4a2; }
    .sbi-late-badge.is-soft { border-color:rgba(255,255,255,.16); background:rgba(255,255,255,.06); color:#dfe7ff; font-weight:700; }
    .sbi-late-courses { list-style:none; margin:.7rem 0 0; padding:0; display:grid; gap:.4rem; }
    .sbi-late-courses li { display:flex; justify-content:space-between; gap:.6rem; flex-wrap:wrap; border-top:1px solid rgba(255,255,255,.07); padding-top:.4rem; color:#cdd8f3; font-size:.82rem; }
    .sbi-late-courses li .late-course-title { color:#fff; font-weight:600; }
    .sbi-late-courses li .late-course-meta { color:#9fb0cf; }
    .sbi-late-courses li .late-course-days { color:#ffb4a2; font-weight:800; white-space:nowrap; }
    .sbi-late-courses li .late-course-days.is-amber { color:#ffd98a; }
    .sbi-late-student.is-dropout { border-color:rgba(255,193,94,.22); background:rgba(255,193,94,.05); }
    .sbi-late-badge.is-amber { border-color:rgba(255,193,94,.35); background:rgba(255,193,94,.14); color:#ffd98a; }
    .sbi-late-dropout { margin-top:1.4rem; padding-top:1.1rem; border-top:1px solid rgba(255,255,255,.10); }
    .sbi-late-dropout h4 { margin:0 0 .15rem; color:#fff; font-size:1rem; display:flex; align-items:center; gap:.5rem; }
    .sbi-late-dropout h4 .sbi-late-d-kicker { font-size:.66rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#ffd98a; border:1px solid rgba(255,193,94,.3); border-radius:999px; padding:.1rem .45rem; }
    .sbi-late-dropout > p { margin:.1rem 0 .6rem; color:#9fb0cf; font-size:.8rem; }
    .sbi-late-qualiopi { margin-top:1.4rem; padding-top:1.1rem; border-top:1px solid rgba(255,255,255,.10); }
    .sbi-late-qualiopi h4 { margin:0 0 .15rem; color:#fff; font-size:1rem; display:flex; align-items:center; gap:.5rem; }
    .sbi-late-qualiopi h4 .sbi-late-q-kicker { font-size:.66rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#67e8f9; border:1px solid rgba(103,232,249,.3); border-radius:999px; padding:.1rem .45rem; }
    .sbi-late-qualiopi > p { margin:.1rem 0 .4rem; color:#9fb0cf; font-size:.8rem; }
    .sbi-late-metric.is-q strong { color:#9af5c8; }
    .sbi-late-qbar { height:.5rem; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; margin:.2rem 0 .9rem; }
    .sbi-late-qbar > span { display:block; height:100%; background:linear-gradient(90deg,#34d399,#67e8f9); }
    .sbi-late-gap { border:1px solid rgba(103,232,249,.18); border-radius:16px; background:rgba(103,232,249,.045); padding:.8rem; }
    .sbi-late-gap-head { display:flex; justify-content:space-between; gap:.75rem; align-items:flex-start; flex-wrap:wrap; }
    .sbi-late-gap-head strong { color:#fff; }
    .sbi-late-gap-head small { color:#9fb0cf; font-size:.78rem; }
    .sbi-late-badge.is-q { border-color:rgba(103,232,249,.35); background:rgba(103,232,249,.12); color:#bdf3ff; }
    .sbi-late-q-missing { list-style:none; margin:.55rem 0 0; padding:0; display:grid; gap:.3rem; }
    .sbi-late-q-missing li { border-top:1px solid rgba(255,255,255,.07); padding-top:.35rem; color:#dfe7ff; font-size:.82rem; }
    .sbi-late-detail-head { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:.7rem; }
    .sbi-late-promo-pick { display:grid; gap:.3rem; min-width:0; flex:1 1 320px; }
    .sbi-late-promo-pick label { color:#9fb0cf; font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; font-weight:800; }
    .sbi-late-promo-pick select, .sbi-late-sort { background:rgba(10,15,30,.6); border:1px solid rgba(255,255,255,.14); color:#fff; border-radius:12px; padding:.55rem .7rem; font-size:.9rem; outline:none; max-width:100%; cursor:pointer; }
    .sbi-late-promo-pick p { margin:0; color:#9fb0cf; font-size:.78rem; }
    .sbi-late-md { display:grid; grid-template-columns: minmax(240px, 320px) minmax(0,1fr); gap:1rem; align-items:start; margin-top:.5rem; }
    .sbi-late-md-list { display:grid; gap:.5rem; align-content:start; }
    #late-student-search { width:100%; box-sizing:border-box; padding:.6rem .75rem; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.055); color:#fff; outline:none; }
    .sbi-late-filters { display:flex; flex-wrap:wrap; gap:.35rem; }
    .sbi-late-fchip { display:inline-flex; align-items:center; gap:.3rem; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05); color:#dfe7ff; border-radius:999px; padding:.25rem .6rem; font-size:.76rem; font-weight:700; cursor:pointer; }
    .sbi-late-fchip span { opacity:.7; font-weight:800; }
    .sbi-late-fchip.is-active { border-color:rgba(42,87,255,.5); background:rgba(42,87,255,.2); color:#fff; }
    .sbi-late-sort { width:100%; }
    .sbi-late-srows { display:grid; gap:.3rem; max-height:calc(100vh - 420px); min-height:120px; overflow:auto; padding-right:.1rem; }
    .sbi-late-srow { display:flex; justify-content:space-between; align-items:center; gap:.5rem; width:100%; text-align:left; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.035); color:#eaf0ff; border-radius:12px; padding:.5rem .6rem; cursor:pointer; transition:border-color .14s ease, background .14s ease; }
    .sbi-late-srow:hover { border-color:rgba(255,255,255,.22); background:rgba(255,255,255,.06); }
    .sbi-late-srow.is-active { border-color:rgba(42,87,255,.55); background:rgba(42,87,255,.16); }
    .sbi-late-srow-name { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sbi-late-srow-badges { display:flex; gap:.25rem; flex-shrink:0; }
    .sbi-late-chip { display:inline-flex; align-items:center; min-height:1.25rem; padding:0 .42rem; border-radius:999px; font-size:.7rem; font-weight:800; background:rgba(255,255,255,.08); color:#dfe7ff; }
    .sbi-late-chip.is-late { background:rgba(255,99,71,.16); color:#ffb4a2; }
    .sbi-late-chip.is-amber { background:rgba(255,193,94,.16); color:#ffd98a; }
    .sbi-late-chip.is-q { background:rgba(103,232,249,.14); color:#bdf3ff; }
    .sbi-late-md-fiche { border:1px solid rgba(255,255,255,.08); border-radius:16px; background:rgba(255,255,255,.025); padding:1rem; min-height:200px; }
    .sbi-late-fiche-head { display:flex; justify-content:space-between; gap:.75rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:.2rem; }
    .sbi-late-fiche-head h3 { margin:0; color:#fff; font-size:1.1rem; }
    .sbi-late-fiche-head p { margin:.1rem 0 0; color:#9fb0cf; font-size:.82rem; }
    .sbi-late-fiche-section { margin-top:1rem; padding-top:.8rem; border-top:1px solid rgba(255,255,255,.08); }
    .sbi-late-fiche-section h4 { margin:0 0 .4rem; color:#fff; font-size:.92rem; display:flex; align-items:center; gap:.5rem; }
    .sbi-late-d-kicker.is-red { color:#ffb4a2; border-color:rgba(255,99,71,.3); }
    .sbi-late-btn.sbi-late-mini { min-height:1.9rem; padding:0 .65rem; font-size:.76rem; }
    @media (max-width: 1100px) { .sbi-late-md { grid-template-columns:1fr; } .sbi-late-srows { max-height:none; } .sbi-late-summary { grid-template-columns:repeat(2,minmax(0,1fr)); } .sbi-late-detail-head { flex-direction:column; } }
    @media (max-width: 720px) { .sbi-late-hero { flex-direction:column; } .sbi-late-hero-metric { text-align:left; } .sbi-late-summary { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}

function showUnauthorized(message = 'Accès réservé aux administrateurs.') {
  const root = $('view-late-students');
  if (!root) return;
  root.innerHTML = `<div class="sbi-late-shell"><div class="sbi-late-empty is-large">${escapeHtml(message)}</div></div>`;
}

// ── Données par élève (maître-détail) ──────────────────────────────────────
function getEvidenceCourses(plan = []) {
  return plan.filter((item) => isQualiopiEvidenceItem(item) && isRealCourse(item));
}

function computePromotionRows(promotion = {}) {
  const plan = getPlanForPromotion(promotion);
  const evidenceCourses = getEvidenceCourses(plan);
  const evidenceItems = plan.filter(isQualiopiEvidenceItem);
  const students = getStudentsForPromotion(promotion.id);
  const today = todayIso();

  let totalCovered = 0;
  const rows = students.map((student) => {
    const lateness = computeStudentLateness(student, plan, today);
    const qualiopi = computeStudentQualiopi(student, evidenceCourses);
    totalCovered += qualiopi.covered;
    const coverage = qualiopi.total > 0 ? Math.round((qualiopi.covered / qualiopi.total) * 100) : null;
    const difficulty = (lateness.lateCount * 10000) + (lateness.maxDaysLate * 100) + (lateness.dropoutCount * 50) + qualiopi.missing.length;
    return { student, lateness, qualiopi, coverage, difficulty };
  });

  const measurable = evidenceCourses.length;
  const denom = students.length * measurable;
  const global = {
    studentCount: students.length,
    lateStudentCount: rows.filter((r) => r.lateness.isLate).length,
    dropoutStudentCount: rows.filter((r) => r.lateness.isDropout).length,
    gapStudentCount: rows.filter((r) => r.qualiopi.missing.length > 0).length,
    datedRequiredCount: plan.filter((item) => isRealCourse(item) && isRequiredItem(item) && isIsoDate(getDeadlineDate(item))).length,
    datedStartCount: plan.filter((item) => isRealCourse(item) && isRequiredItem(item) && isIsoDate(getStartDate(item))).length,
    evidenceTotal: evidenceItems.length,
    evidenceCourses: measurable,
    evidenceNonCourse: evidenceItems.length - measurable,
    coverageRate: denom > 0 ? Math.round((totalCovered / denom) * 100) : null
  };
  return { plan, evidenceCourses, rows, global };
}

function getPromotionRowsCached(promotion = {}) {
  if (rowsByPromotion.has(promotion.id)) return rowsByPromotion.get(promotion.id);
  const result = computePromotionRows(promotion);
  rowsByPromotion.set(promotion.id, result);
  return result;
}

function filterStudentRows(rows = []) {
  let out = rows;
  if (studentFilter === 'late') out = out.filter((r) => r.lateness.isLate);
  else if (studentFilter === 'dropout') out = out.filter((r) => r.lateness.isDropout);
  else if (studentFilter === 'gap') out = out.filter((r) => r.qualiopi.missing.length > 0);
  const search = normalizeSearch(studentSearch);
  if (search) out = out.filter((r) => normalizeSearch(`${getStudentName(r.student)} ${r.student.email || ''}`).includes(search));
  return out;
}

function sortStudentRows(rows = []) {
  const byName = (a, b) => getStudentName(a.student).localeCompare(getStudentName(b.student), 'fr', { sensitivity: 'base' });
  const arr = [...rows];
  if (studentSort === 'name') arr.sort(byName);
  else if (studentSort === 'late') arr.sort((a, b) => (b.lateness.lateCount - a.lateness.lateCount) || (b.lateness.maxDaysLate - a.lateness.maxDaysLate) || byName(a, b));
  else if (studentSort === 'dropout') arr.sort((a, b) => (b.lateness.dropoutCount - a.lateness.dropoutCount) || (b.lateness.maxDaysSinceStart - a.lateness.maxDaysSinceStart) || byName(a, b));
  else if (studentSort === 'coverage') arr.sort((a, b) => ((a.coverage === null ? 999 : a.coverage) - (b.coverage === null ? 999 : b.coverage)) || byName(a, b));
  else arr.sort((a, b) => (b.difficulty - a.difficulty) || byName(a, b));
  return arr;
}

// ── Rendu maître-détail ────────────────────────────────────────────────────
function renderHeroMetric() {
  const node = $('late-hero-total');
  if (!node) return;
  let totalLate = 0;
  let promosWithLate = 0;
  promotions.forEach((promotion) => {
    const count = getPromotionRowsCached(promotion).global.lateStudentCount;
    totalLate += count;
    if (count > 0) promosWithLate += 1;
  });
  node.innerHTML = `<strong>${totalLate}</strong><span>élève${totalLate > 1 ? 's' : ''} en retard · ${promosWithLate} promotion${promosWithLate > 1 ? 's' : ''}</span>`;
}

function renderPromotionSelectOptions() {
  return [...promotions]
    .sort((a, b) => {
      const lateA = getPromotionRowsCached(a).global.lateStudentCount;
      const lateB = getPromotionRowsCached(b).global.lateStudentCount;
      if (lateA !== lateB) return lateB - lateA;
      return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
    })
    .map((promotion) => {
      const g = getPromotionRowsCached(promotion).global;
      const sel = promotion.id === selectedPromotionId ? 'selected' : '';
      return `<option value="${escapeHtml(promotion.id)}" ${sel}>${escapeHtml(getPromotionLabel(promotion))} — ${g.lateStudentCount} en retard / ${g.studentCount} élèves</option>`;
    }).join('');
}

function renderStudentListItem(row = {}) {
  const student = row.student || {};
  const lateness = row.lateness || {};
  const active = student.id === selectedStudentId;
  const badges = [];
  if (lateness.lateCount) badges.push(`<span class="sbi-late-chip is-late" title="cours en retard">⚠ ${lateness.lateCount}</span>`);
  if (lateness.dropoutCount) badges.push(`<span class="sbi-late-chip is-amber" title="cours non commencés">${lateness.dropoutCount}</span>`);
  badges.push(`<span class="sbi-late-chip is-q" title="couverture Qualiopi">${row.coverage === null ? '—' : row.coverage + '%'}</span>`);
  return `
    <button type="button" class="sbi-late-srow ${active ? 'is-active' : ''}" data-student-id="${escapeHtml(student.id)}">
      <span class="sbi-late-srow-name">${escapeHtml(getStudentName(student))}</span>
      <span class="sbi-late-srow-badges">${badges.join('')}</span>
    </button>
  `;
}

function renderStudentList() {
  const listEl = $('late-student-list');
  if (!listEl) return;
  const promotion = promotions.find((item) => item.id === selectedPromotionId);
  if (!promotion) { listEl.innerHTML = ''; return; }
  const visible = sortStudentRows(filterStudentRows(getPromotionRowsCached(promotion).rows));
  if (!visible.some((r) => r.student.id === selectedStudentId)) {
    selectedStudentId = visible[0]?.student.id || '';
  }
  listEl.innerHTML = visible.length
    ? visible.map(renderStudentListItem).join('')
    : '<div class="sbi-late-empty">Aucun élève pour ce filtre.</div>';
}

function renderCourseList(courses = [], kind = 'late') {
  return `<ul class="sbi-late-courses">${courses.map((course) => kind === 'late'
    ? `<li>
        <span class="late-course-title">${escapeHtml(course.title)}</span>
        <span class="late-course-meta">échéance ${formatDate(course.deadline)} · ${course.status === 'in_progress' ? 'en cours' : 'non commencé'}</span>
        <span class="late-course-days">+${course.daysLate} j</span>
      </li>`
    : `<li>
        <span class="late-course-title">${escapeHtml(course.title)}</span>
        <span class="late-course-meta">début prévu ${formatDate(course.start)} · non commencé</span>
        <span class="late-course-days is-amber">+${course.daysSinceStart} j</span>
      </li>`).join('')}</ul>`;
}

function renderStudentFiche() {
  const ficheEl = $('late-student-fiche');
  if (!ficheEl) return;
  const promotion = promotions.find((item) => item.id === selectedPromotionId);
  if (!promotion) { ficheEl.innerHTML = ''; return; }
  const row = getPromotionRowsCached(promotion).rows.find((r) => r.student.id === selectedStudentId);
  if (!row) {
    ficheEl.innerHTML = '<div class="sbi-late-empty is-large">Sélectionnez un élève dans la liste.</div>';
    return;
  }
  const student = row.student;
  const l = row.lateness;
  const q = row.qualiopi;

  ficheEl.innerHTML = `
    <div class="sbi-late-fiche-head">
      <div>
        <h3>${escapeHtml(getStudentName(student))}</h3>
        <p>${escapeHtml(student.email || 'Email non renseigné')}</p>
      </div>
      <div class="sbi-late-badges">
        ${l.lateCount ? `<span class="sbi-late-badge">${l.lateCount} en retard</span>` : ''}
        ${l.dropoutCount ? `<span class="sbi-late-badge is-amber">${l.dropoutCount} décrochage</span>` : ''}
        <span class="sbi-late-badge is-q">${row.coverage === null ? 'Qualiopi N/A' : `Qualiopi ${row.coverage} %`}</span>
        ${typeof student.connectionHours === 'number' ? `<span class="sbi-late-badge is-soft">${student.connectionHours} h connexion</span>` : ''}
        ${l.lateCount ? `<button type="button" class="sbi-late-btn is-primary sbi-late-mini" data-action="send-reminder" data-student-id="${escapeHtml(student.id)}">Relancer par email</button>` : ''}
      </div>
    </div>

    <div class="sbi-late-fiche-section">
      <h4>En retard <span class="sbi-late-d-kicker is-red">${l.lateCount}</span></h4>
      ${l.lateCount ? renderCourseList(l.lateCourses, 'late') : '<div class="sbi-late-empty">Aucun cours en retard.</div>'}
    </div>

    <div class="sbi-late-fiche-section">
      <h4>En décrochage <span class="sbi-late-d-kicker">${l.dropoutCount}</span></h4>
      ${l.dropoutCount ? renderCourseList(l.dropoutCourses, 'dropout') : '<div class="sbi-late-empty">Aucun cours non commencé (hors retard).</div>'}
    </div>

    <div class="sbi-late-fiche-section">
      <h4>Preuves Qualiopi <span class="sbi-late-q-kicker">${q.total ? `${q.covered}/${q.total}` : '—'}</span></h4>
      ${q.total
        ? (q.missing.length
            ? `<ul class="sbi-late-q-missing">${q.missing.map((item) => `<li>${escapeHtml(item.title)} <span class="late-course-meta">— non validée</span></li>`).join('')}</ul>`
            : '<div class="sbi-late-empty">Toutes les preuves cours validées. ✅</div>')
        : '<div class="sbi-late-empty">Aucune preuve Qualiopi de type cours dans le cursus.</div>'}
    </div>

    ${renderLiveSection(student.id)}
  `;
}

function renderDetail() {
  const detail = $('late-detail');
  if (!detail) return;
  if (!promotions.length) {
    detail.innerHTML = '<div class="sbi-late-empty is-large">Aucune promotion à afficher.</div>';
    return;
  }
  const promotion = promotions.find((item) => item.id === selectedPromotionId) || promotions[0];
  selectedPromotionId = promotion.id;
  const { global } = getPromotionRowsCached(promotion);

  const warnings = [];
  if (!Array.isArray(promotion.coursePlan) || !promotion.coursePlan.length) warnings.push('coursePlan absent : dates estimées depuis le cursus modèle.');
  if (!global.datedRequiredCount) warnings.push('Aucun cours obligatoire daté avec échéance : retard non détectable.');
  if (!global.studentCount) warnings.push('Aucun élève rattaché à cette promotion (users.promotionId).');

  const chip = (key, label, count) => `<button type="button" class="sbi-late-fchip ${studentFilter === key ? 'is-active' : ''}" data-filter="${key}">${label} <span>${count}</span></button>`;

  detail.innerHTML = `
    <div class="sbi-late-detail-head">
      <div class="sbi-late-promo-pick">
        <label for="late-promo-select">Promotion</label>
        <select id="late-promo-select">${renderPromotionSelectOptions()}</select>
        <p>${escapeHtml(promotion.formationName || 'Formation non renseignée')} · ${escapeHtml(promotion.curriculumTitle || 'Cursus non renseigné')} · ${formatDate(promotion.startDate)} → ${formatDate(promotion.endDate)}</p>
      </div>
      <div class="sbi-late-actions">
        <button type="button" class="sbi-late-btn is-primary" data-action="export-registry">Registre (PDF)</button>
        <button type="button" class="sbi-late-btn" data-action="export-qualiopi">Export CSV</button>
        <a class="sbi-late-btn" href="/admin/admin-cursus-dates-qa.html">Dates du cursus</a>
      </div>
    </div>

    <div class="sbi-late-summary">
      <div class="sbi-late-metric"><strong>${global.lateStudentCount}</strong><span>en retard</span></div>
      <div class="sbi-late-metric"><strong>${global.dropoutStudentCount}</strong><span>en décrochage</span></div>
      <div class="sbi-late-metric is-q"><strong>${global.coverageRate === null ? 'N/A' : global.coverageRate + ' %'}</strong><span>couverture Qualiopi</span></div>
      <div class="sbi-late-metric"><strong>${global.studentCount}</strong><span>élèves rattachés</span></div>
    </div>

    ${warnings.map((warning) => `<div class="sbi-late-warning">${escapeHtml(warning)}</div>`).join('')}

    <div class="sbi-late-md">
      <aside class="sbi-late-md-list">
        <input id="late-student-search" type="search" placeholder="Rechercher un élève..." value="${escapeHtml(studentSearch)}">
        <div class="sbi-late-filters">
          ${chip('all', 'Tous', global.studentCount)}
          ${chip('late', 'Retard', global.lateStudentCount)}
          ${chip('dropout', 'Décrochage', global.dropoutStudentCount)}
          ${chip('gap', 'Preuves manq.', global.gapStudentCount)}
        </div>
        <select id="late-sort" class="sbi-late-sort">
          <option value="difficulty">Trier : difficulté</option>
          <option value="late">Trier : retard</option>
          <option value="dropout">Trier : décrochage</option>
          <option value="coverage">Trier : couverture ↑</option>
          <option value="name">Trier : nom</option>
        </select>
        <div id="late-student-list" class="sbi-late-srows"></div>
      </aside>
      <section class="sbi-late-md-fiche">
        <div id="late-student-fiche"></div>
      </section>
    </div>
  `;
  const sortEl = $('late-sort');
  if (sortEl) sortEl.value = studentSort;
  renderStudentList();
  renderStudentFiche();
  ensureLiveAttendance(promotion.id);
}

function renderAll() {
  renderHeroMetric();
  renderDetail();
}

async function loadStudentsForPromotions() {
  studentsByPromotion = new Map();
  await Promise.all(promotions.map(async (promotion) => {
    if (!promotion.id) return;
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('promotionId', '==', promotion.id)));
      const students = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const role = String(data.role || '').toLowerCase();
        if (STUDENT_ROLES.includes(role)) students.push({ id: docSnap.id, ...data });
      });
      studentsByPromotion.set(promotion.id, students);
    } catch (error) {
      console.warn('[SBI Retards] Élèves non chargés pour promotion', promotion.id, error);
      studentsByPromotion.set(promotion.id, []);
    }
  }));
}

async function loadData() {
  if (loading) return;
  loading = true;
  const refreshBtn = $('late-refresh-btn');
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const [promotionsSnap, templatesSnap] = await Promise.all([
      getDocs(collection(db, 'promotions')),
      getDocs(collection(db, 'curriculumTemplates'))
    ]);

    promotions = [];
    promotionsSnap.forEach((docSnap) => promotions.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
    templates = [];
    templatesSnap.forEach((docSnap) => templates.push({ id: docSnap.id, ...(docSnap.data() || {}) }));

    await loadStudentsForPromotions();
    latenessByPromotion = new Map();
    qualiopiByPromotion = new Map();
    rowsByPromotion = new Map();
    liveByPromotion = new Map();

    if (!selectedPromotionId && promotions.length) {
      // Sélectionne par défaut la promotion avec le plus d'élèves en retard.
      const sorted = [...promotions].sort((a, b) => getPromotionRowsCached(b).global.lateStudentCount - getPromotionRowsCached(a).global.lateStudentCount);
      selectedPromotionId = sorted[0]?.id || promotions[0].id;
    }
    renderAll();
  } catch (error) {
    console.warn('[SBI Retards] Chargement impossible :', error);
    const detail = $('late-detail');
    if (detail) detail.innerHTML = '<div class="sbi-late-empty is-large">Chargement impossible.</div>';
  } finally {
    loading = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Authentification requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Profil admin introuvable.');
  const profile = snap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');
  currentAdmin = { uid: user.uid, email: user.email || profile.email || '', profile };
}

function bindEvents() {
  $('late-refresh-btn')?.addEventListener('click', () => {
    latenessByPromotion = new Map();
    qualiopiByPromotion = new Map();
    rowsByPromotion = new Map();
    liveByPromotion = new Map();
    loadData();
  });

  // Délégation sur le conteneur détail (son innerHTML est ré-rendu en continu).
  const detail = $('late-detail');
  detail?.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action="export-qualiopi"]')) {
      exportSelectedPromotionQualiopi();
      return;
    }
    if (event.target.closest?.('[data-action="export-registry"]')) {
      exportSelectedPromotionRegistry();
      return;
    }
    const remind = event.target.closest?.('[data-action="send-reminder"]');
    if (remind) {
      handleSendReminder(remind.dataset.studentId || '');
      return;
    }
    const fchip = event.target.closest?.('[data-filter]');
    if (fchip) {
      studentFilter = fchip.dataset.filter || 'all';
      detail.querySelectorAll('.sbi-late-fchip').forEach((el) => el.classList.toggle('is-active', el === fchip));
      renderStudentList();
      return;
    }
    const srow = event.target.closest?.('[data-student-id]');
    if (srow) {
      selectedStudentId = srow.dataset.studentId || '';
      renderStudentList();
      renderStudentFiche();
    }
  });
  detail?.addEventListener('input', (event) => {
    if (event.target.id === 'late-student-search') {
      studentSearch = event.target.value || '';
      renderStudentList();
    }
  });
  detail?.addEventListener('change', (event) => {
    if (event.target.id === 'late-promo-select') {
      selectedPromotionId = event.target.value || '';
      selectedStudentId = '';
      renderDetail();
    } else if (event.target.id === 'late-sort') {
      studentSort = event.target.value || 'difficulty';
      renderStudentList();
    }
  });
}

export function mountAdminLateStudents() {
  const view = document.getElementById('view-late-students');
  if (!view) return () => {};

  // Déjà monté sur CE noeud DOM : cas du double appel (auto-montage à l'import
  // du module + appel explicite par la route PJAX sur une vue fraîche). On ne
  // re-binde pas pour éviter les listeners en double.
  if (mounted && mountedView === view) {
    return window.SBI_ADMIN_LATE_STUDENTS_UNMOUNT || (() => {});
  }

  // Nouveau noeud (retour via PJAX après un chargement standalone / F5, où aucun
  // cleanup shell n'avait été enregistré) ou premier montage : on repart propre,
  // en coupant un éventuel listener auth resté actif d'un montage précédent.
  unsubscribeAuth?.();

  mounted = true;
  mountedView = view;
  ensureStyles();
  bindEvents();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadData();
    } catch (error) {
      console.warn('[SBI Retards] Accès refusé :', error);
      showUnauthorized(error?.message || 'Accès réservé aux administrateurs.');
    }
  });

  const cleanup = () => {
    mounted = false;
    mountedView = null;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };

  window.SBI_ADMIN_LATE_STUDENTS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminLateStudents(), { once: true });
} else {
  mountAdminLateStudents();
}
