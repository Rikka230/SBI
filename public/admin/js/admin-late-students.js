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

import { auth, db } from '/js/firebase-init.js';
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

let mounted = false;
let mountedView = null;
let currentAdmin = null;
let promotions = [];
let templates = [];
let studentsByPromotion = new Map();
let latenessByPromotion = new Map();
let qualiopiByPromotion = new Map();
let selectedPromotionId = '';
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
 * Calcule les cours en retard d'un élève pour un coursePlan donné.
 * Retard = cours réel obligatoire, échéance passée (< aujourd'hui),
 * statut élève != 'done'.
 */
function computeStudentLateness(student = {}, plan = [], today = todayIso()) {
  const lateCourses = [];
  plan.forEach((item) => {
    if (!isRealCourse(item)) return;
    if (!isRequiredItem(item)) return;
    const courseId = item.courseId;
    if (!courseId) return;
    const deadline = getDeadlineDate(item);
    if (!isIsoDate(deadline)) return;
    if (deadline >= today) return; // échéance pas encore dépassée
    const status = getCourseStatus(student, courseId);
    if (status === 'done') return; // cours terminé : pas en retard
    const daysLate = Math.max(1, diffDaysInclusive(deadline, today) - 1);
    lateCourses.push({
      courseId,
      title: getItemTitle(item),
      deadline,
      status,
      daysLate
    });
  });
  lateCourses.sort((a, b) => b.daysLate - a.daysLate);
  const maxDaysLate = lateCourses.reduce((max, course) => Math.max(max, course.daysLate), 0);
  return {
    lateCourses,
    lateCount: lateCourses.length,
    maxDaysLate,
    isLate: lateCourses.length > 0
  };
}

function computePromotionLateness(promotion = {}) {
  const plan = getPlanForPromotion(promotion);
  const datedRequiredCount = plan.filter((item) => isRealCourse(item) && isRequiredItem(item) && isIsoDate(getDeadlineDate(item))).length;
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

  return {
    plan,
    datedRequiredCount,
    studentCount: students.length,
    lateRows,
    lateStudentCount: lateRows.length
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
    const missing = [];
    let covered = 0;
    evidenceCourses.forEach((item) => {
      if (getCourseStatus(student, item.courseId) === 'done') covered += 1;
      else missing.push({ courseId: item.courseId, title: getItemTitle(item) });
    });
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
    @media (max-width: 1100px) { .sbi-late-grid { grid-template-columns:1fr; } .sbi-late-list { max-height:none; } .sbi-late-summary { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width: 720px) { .sbi-late-hero { flex-direction:column; } .sbi-late-hero-metric { text-align:left; } .sbi-late-summary { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}

function showUnauthorized(message = 'Accès réservé aux administrateurs.') {
  const root = $('view-late-students');
  if (!root) return;
  root.innerHTML = `<div class="sbi-late-shell"><div class="sbi-late-empty is-large">${escapeHtml(message)}</div></div>`;
}

function renderHeroMetric() {
  const node = $('late-hero-total');
  if (!node) return;
  let totalLate = 0;
  let promosWithLate = 0;
  promotions.forEach((promotion) => {
    const result = getPromotionLatenessCached(promotion);
    totalLate += result.lateStudentCount;
    if (result.lateStudentCount > 0) promosWithLate += 1;
  });
  node.innerHTML = `<strong>${totalLate}</strong><span>élève${totalLate > 1 ? 's' : ''} en retard · ${promosWithLate} promotion${promosWithLate > 1 ? 's' : ''}</span>`;
}

function renderPromotionList() {
  const list = $('late-promotions-list');
  const count = $('late-promotions-count');
  if (!list || !count) return;

  const search = normalizeSearch($('late-search')?.value || '');
  const rows = [...promotions]
    .sort((a, b) => {
      const lateA = getPromotionLatenessCached(a).lateStudentCount;
      const lateB = getPromotionLatenessCached(b).lateStudentCount;
      if (lateA !== lateB) return lateB - lateA;
      const activeA = (a.status || 'active') === 'active' ? 0 : 1;
      const activeB = (b.status || 'active') === 'active' ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
    })
    .filter((promotion) => {
      if (!search) return true;
      const haystack = normalizeSearch(`${getPromotionLabel(promotion)} ${promotion.formationName || ''} ${promotion.curriculumTitle || ''}`);
      return haystack.includes(search);
    });

  count.textContent = `${rows.length} promotion${rows.length > 1 ? 's' : ''}`;

  if (!rows.length) {
    list.innerHTML = '<div class="sbi-late-empty">Aucune promotion trouvée.</div>';
    return;
  }

  list.innerHTML = rows.map((promotion) => {
    const result = getPromotionLatenessCached(promotion);
    const active = promotion.id === selectedPromotionId;
    const lateCount = result.lateStudentCount;
    const pill = lateCount > 0
      ? `<span class="sbi-late-count-pill is-late">${lateCount} en retard</span>`
      : '<span class="sbi-late-count-pill is-ok">À jour</span>';
    return `
      <button type="button" class="sbi-late-promo ${active ? 'is-active' : ''} ${lateCount > 0 ? 'has-late' : ''}" data-promotion-id="${escapeHtml(promotion.id)}">
        <strong>${escapeHtml(getPromotionLabel(promotion))}</strong>
        <small>
          <span>${escapeHtml(promotion.formationName || 'Formation non renseignée')}</span>
          <span>${pill} · ${result.studentCount} élève${result.studentCount > 1 ? 's' : ''}</span>
          <span>${formatDate(promotion.startDate)} → ${formatDate(promotion.endDate)}</span>
        </small>
      </button>
    `;
  }).join('');
}

function renderStudentRow(row = {}) {
  const student = row.student || {};
  const lateness = row.lateness || {};
  const courses = lateness.lateCourses || [];
  return `
    <article class="sbi-late-student">
      <div class="sbi-late-student-head">
        <div>
          <strong>${escapeHtml(getStudentName(student))}</strong>
          <small>${escapeHtml(student.email || 'Email non renseigné')}</small>
        </div>
        <div class="sbi-late-badges">
          <span class="sbi-late-badge">${lateness.lateCount} cours en retard</span>
          <span class="sbi-late-badge is-soft">Retard max : ${lateness.maxDaysLate} j</span>
        </div>
      </div>
      <ul class="sbi-late-courses">
        ${courses.map((course) => `
          <li>
            <span class="late-course-title">${escapeHtml(course.title)}</span>
            <span class="late-course-meta">échéance ${formatDate(course.deadline)} · ${course.status === 'in_progress' ? 'en cours' : 'non commencé'}</span>
            <span class="late-course-days">+${course.daysLate} j</span>
          </li>
        `).join('')}
      </ul>
    </article>
  `;
}

function renderQualiopiGapRow(row = {}) {
  const student = row.student || {};
  const missing = row.missing || [];
  return `
    <article class="sbi-late-gap">
      <div class="sbi-late-gap-head">
        <div>
          <strong>${escapeHtml(getStudentName(student))}</strong>
          <small>${escapeHtml(student.email || 'Email non renseigné')}</small>
        </div>
        <div class="sbi-late-badges">
          <span class="sbi-late-badge is-q">${row.covered}/${row.total} preuves</span>
          <span class="sbi-late-badge is-soft">${missing.length} manquante${missing.length > 1 ? 's' : ''}</span>
        </div>
      </div>
      <ul class="sbi-late-q-missing">
        ${missing.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}
      </ul>
    </article>
  `;
}

function renderQualiopiSection(promotion = {}) {
  const q = getPromotionQualiopiCached(promotion);
  if (!q.evidenceTotal) {
    return `
      <div class="sbi-late-qualiopi">
        <h4>Couverture Qualiopi <span class="sbi-late-q-kicker">Preuves</span></h4>
        <div class="sbi-late-warning">Aucune preuve Qualiopi (<code>isQualiopiEvidence</code>) dans le cursus de cette promotion.</div>
      </div>
    `;
  }
  const rate = q.coverageRate;
  const rateLabel = rate === null ? 'N/A' : `${rate} %`;
  const barWidth = rate === null ? 0 : rate;
  const warnings = [];
  if (!q.evidenceCourses) warnings.push('Aucune preuve de type cours : couverture non mesurable automatiquement en v1.');
  if (q.evidenceNonCourse) warnings.push(`${q.evidenceNonCourse} preuve(s) hors-cours (devoir / examen / live) non mesurée(s) automatiquement en v1.`);

  return `
    <div class="sbi-late-qualiopi">
      <h4>Couverture Qualiopi <span class="sbi-late-q-kicker">Preuves</span></h4>
      <p>Part des preuves de type cours réellement validées par les élèves rattachés.</p>
      <div class="sbi-late-qbar"><span style="width:${barWidth}%"></span></div>
      <div class="sbi-late-summary">
        <div class="sbi-late-metric is-q"><strong>${rateLabel}</strong><span>couverture preuves cours</span></div>
        <div class="sbi-late-metric"><strong>${q.evidenceCourses}</strong><span>preuves mesurables (cours)</span></div>
        <div class="sbi-late-metric"><strong>${q.evidenceNonCourse}</strong><span>preuves hors-cours (v1 : non mesurées)</span></div>
        <div class="sbi-late-metric"><strong>${q.studentsWithGaps.length}</strong><span>élèves avec preuves manquantes</span></div>
      </div>
      ${warnings.map((warning) => `<div class="sbi-late-warning">${escapeHtml(warning)}</div>`).join('')}
      ${q.studentsWithGaps.length
        ? `<div class="sbi-late-students-list">${q.studentsWithGaps.map(renderQualiopiGapRow).join('')}</div>`
        : (q.evidenceCourses ? '<div class="sbi-late-empty">Toutes les preuves Qualiopi de type cours sont couvertes par les élèves. ✅</div>' : '')}
    </div>
  `;
}

function renderDetail() {
  const detail = $('late-detail');
  if (!detail) return;
  const promotion = promotions.find((item) => item.id === selectedPromotionId) || null;
  if (!promotion) {
    detail.innerHTML = '<div class="sbi-late-empty is-large">Sélectionnez une promotion pour voir les élèves en retard sur leur cursus.</div>';
    return;
  }

  const result = getPromotionLatenessCached(promotion);
  const warnings = [];
  if (!Array.isArray(promotion.coursePlan) || !promotion.coursePlan.length) {
    warnings.push('coursePlan absent dans la promotion : dates estimées depuis le cursus modèle.');
  }
  if (!result.datedRequiredCount) {
    warnings.push('Aucun cours obligatoire daté avec échéance : impossible de détecter un retard.');
  }
  if (!result.studentCount) {
    warnings.push('Aucun élève rattaché à cette promotion (users.promotionId).');
  }

  detail.innerHTML = `
    <div class="sbi-late-panel-head">
      <div>
        <h3>${escapeHtml(getPromotionLabel(promotion))}</h3>
        <p>${escapeHtml(promotion.formationName || 'Formation non renseignée')} · ${escapeHtml(promotion.curriculumTitle || 'Cursus non renseigné')}</p>
      </div>
      <a class="sbi-late-btn" href="/admin/admin-cursus-dates-qa.html">Voir les dates du cursus</a>
    </div>

    <div class="sbi-late-summary">
      <div class="sbi-late-metric"><strong>${result.lateStudentCount}</strong><span>élèves en retard</span></div>
      <div class="sbi-late-metric"><strong>${result.studentCount}</strong><span>élèves rattachés</span></div>
      <div class="sbi-late-metric"><strong>${result.datedRequiredCount}</strong><span>cours obligatoires datés</span></div>
      <div class="sbi-late-metric"><strong>${formatDate(todayIso())}</strong><span>date de référence</span></div>
    </div>

    ${warnings.map((warning) => `<div class="sbi-late-warning">${escapeHtml(warning)}</div>`).join('')}

    ${result.lateStudentCount
      ? `<div class="sbi-late-students-list">${result.lateRows.map(renderStudentRow).join('')}</div>`
      : '<div class="sbi-late-empty is-large">Aucun élève en retard sur les cours obligatoires datés de cette promotion. 🎉</div>'}

    ${renderQualiopiSection(promotion)}
  `;
}

function renderAll() {
  renderHeroMetric();
  renderPromotionList();
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

    if (!selectedPromotionId && promotions.length) {
      // Sélectionne par défaut la promotion avec le plus d'élèves en retard.
      const sorted = [...promotions].sort((a, b) => getPromotionLatenessCached(b).lateStudentCount - getPromotionLatenessCached(a).lateStudentCount);
      selectedPromotionId = sorted[0]?.id || promotions[0].id;
    }
    renderAll();
  } catch (error) {
    console.warn('[SBI Retards] Chargement impossible :', error);
    const list = $('late-promotions-list');
    if (list) list.innerHTML = '<div class="sbi-late-empty">Chargement impossible.</div>';
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
    loadData();
  });
  $('late-search')?.addEventListener('input', () => {
    renderPromotionList();
  });
  $('late-promotions-list')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-promotion-id]');
    if (!button) return;
    selectedPromotionId = button.dataset.promotionId || '';
    renderPromotionList();
    renderDetail();
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
