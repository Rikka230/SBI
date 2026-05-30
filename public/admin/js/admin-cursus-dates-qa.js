/**
 * SBI 8.0P.167.113
 * Page QA temporaire dates côté étudiant.
 *
 * Périmètre :
 * - lecture seule ;
 * - aucune écriture Firestore ;
 * - vérifie les dates présentes dans promotions.coursePlan ;
 * - simule une lecture étudiant sans toucher aux vraies pages élève.
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

let currentAdmin = null;
let promotions = [];
let templates = [];
let studentsByPromotion = new Map();
let selectedPromotionId = '';
let loading = false;

const STRUCTURAL_TYPES = ['real_course', 'course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'];
const PARALLEL_TYPES = ['assignment', 'exam', 'evaluation', 'live_session', 'workshop'];

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
    .replace(/[\u0300-\u036f]/g, '')
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

function addDaysToDateString(dateString = '', days = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return '';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(startDate = '', endDate = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return 0;
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

function getTypeLabel(type = '') {
  const map = {
    real_course: 'Cours',
    course: 'Cours',
    placeholder_course: 'Cours futur',
    buffer_period: 'Marge',
    revision_period: 'Révisions',
    catchup_period: 'Rattrapage',
    assignment: 'Devoir',
    exam: 'Examen',
    evaluation: 'Évaluation',
    live_session: 'Live',
    workshop: 'Atelier'
  };
  return map[type] || type || 'Élément';
}

function getItemKey(item = {}) {
  return item.courseId || item.itemId || item.id || item.uid || '';
}

function isStructural(item = {}) {
  return STRUCTURAL_TYPES.includes(getType(item));
}

function isParallel(item = {}) {
  return PARALLEL_TYPES.includes(getType(item));
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
  return clean(item.courseTitle || item.title || item.label || getTypeLabel(getType(item)), 180);
}

function normalizeTemplateItems(template = {}) {
  const items = Array.isArray(template.items) ? template.items : [];
  return items.map((item, index) => ({
    ...item,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    durationDays: getDurationDays(item),
    source: item.source || 'qa-template-fallback'
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
  // 8.0P.167 (T2) : diffDaysInclusive renvoie 0 si endDate < startDate (plage inversée/invalide).
  // Dans ce cas, on retombe sur modelDuration (scale = 1) au lieu de Math.max(1, 0) = 1 jour,
  // qui produisait un scale quasi nul et aplatissait tous les cours sur J0.
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
      targetStartOffsetDays: startOffset,
      targetDurationDays: duration,
      prorataScale: Number(scale.toFixed(6)),
      source: 'qa-template-prorata-fallback'
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

function isOutsidePromotion(item = {}, promotion = {}) {
  const start = getStartDate(item);
  const end = getEndDate(item);
  if (!promotion.startDate || !promotion.endDate || !start || !end) return false;
  return start < promotion.startDate || end > promotion.endDate;
}

function getStudentsForPromotion(promotionId = '') {
  return studentsByPromotion.get(promotionId) || [];
}

function buildWarnings(promotion = {}, plan = []) {
  const warnings = [];
  if (!promotion.startDate) warnings.push('Date de début absente');
  if (!promotion.endDate) warnings.push('Date de fin absente');
  if (!promotion.curriculumTemplateId) warnings.push('Aucun cursus modèle lié');
  if (!Array.isArray(promotion.coursePlan) || !promotion.coursePlan.length) warnings.push('coursePlan absent ou vide dans la promotion');
  if (!plan.length) warnings.push('Aucun élément daté à afficher');
  if (plan.some((item) => !getStartDate(item) || !getEndDate(item))) warnings.push('Certains éléments n’ont pas de dates complètes');
  if (plan.some((item) => getType(item) === 'placeholder_course')) warnings.push('Des blocs Cours futur restent visibles');
  if (plan.some((item) => isOutsidePromotion(item, promotion))) warnings.push('Des dates sortent de la période de promotion');
  return warnings;
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-dates-qa-style')) return;
  const style = document.createElement('style');
  style.id = 'sbi-cursus-dates-qa-style';
  style.textContent = `
    .sbi-dates-qa-shell { display:grid; gap:1rem; padding:1rem; min-height:calc(100vh - 90px); color:#eaf0ff; }
    .sbi-dates-qa-hero, .sbi-dates-qa-panel { border:1px solid rgba(255,255,255,.10); border-radius:22px; background:rgba(5,9,20,.74); box-shadow:0 18px 42px rgba(0,0,0,.22); }
    .sbi-dates-qa-hero { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; padding:1.15rem; }
    .sbi-dates-qa-hero h2 { margin:.15rem 0 .35rem; color:#fff; font-size:1.35rem; }
    .sbi-dates-qa-hero p { margin:0; color:#9fb0cf; max-width:760px; line-height:1.45; }
    .sbi-dates-qa-kicker { color:#67e8f9 !important; text-transform:uppercase; letter-spacing:.12em; font-size:.72rem; font-weight:800; }
    .sbi-dates-qa-actions { display:flex; gap:.5rem; flex-wrap:wrap; justify-content:flex-end; }
    .sbi-dates-qa-btn { display:inline-flex; align-items:center; justify-content:center; min-height:2.35rem; padding:0 .85rem; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#fff; text-decoration:none; cursor:pointer; font-weight:700; font-size:.84rem; }
    .sbi-dates-qa-btn.is-primary { border-color:rgba(42,87,255,.4); background:linear-gradient(135deg,rgba(42,87,255,.9),rgba(0,210,255,.55)); }
    .sbi-dates-qa-grid { display:grid; grid-template-columns: minmax(280px, 360px) minmax(0,1fr); gap:1rem; align-items:start; }
    .sbi-dates-qa-panel { padding:1rem; }
    .sbi-dates-qa-panel-head { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:.85rem; }
    .sbi-dates-qa-panel-head h3 { margin:0 0 .2rem; color:#fff; font-size:1rem; }
    .sbi-dates-qa-panel-head p { margin:0; color:#9fb0cf; font-size:.8rem; }
    #qa-search { width:100%; box-sizing:border-box; padding:.8rem .9rem; margin-bottom:.75rem; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.055); color:#fff; outline:none; }
    .sbi-dates-qa-list { display:grid; gap:.55rem; max-height:calc(100vh - 280px); overflow:auto; padding-right:.15rem; }
    .sbi-dates-qa-promo { width:100%; text-align:left; border:1px solid rgba(255,255,255,.09); border-radius:16px; background:rgba(255,255,255,.045); color:#eaf0ff; padding:.78rem; cursor:pointer; transition:transform .16s ease, border-color .16s ease, background .16s ease; }
    .sbi-dates-qa-promo:hover, .sbi-dates-qa-promo.is-active { transform:translateY(-1px); border-color:rgba(103,232,249,.42); background:rgba(103,232,249,.08); }
    .sbi-dates-qa-promo strong { display:block; color:#fff; margin-bottom:.25rem; }
    .sbi-dates-qa-promo small { display:grid; gap:.12rem; color:#9fb0cf; line-height:1.35; }
    .sbi-dates-qa-empty { border:1px dashed rgba(255,255,255,.14); border-radius:18px; padding:1rem; color:#9fb0cf; background:rgba(255,255,255,.035); }
    .sbi-dates-qa-empty.is-large { padding:2rem; text-align:center; }
    .sbi-dates-qa-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.7rem; margin:.9rem 0; }
    .sbi-dates-qa-metric { border:1px solid rgba(255,255,255,.09); border-radius:16px; background:rgba(255,255,255,.045); padding:.8rem; }
    .sbi-dates-qa-metric strong { display:block; color:#fff; font-size:1.25rem; line-height:1; }
    .sbi-dates-qa-metric span { display:block; margin-top:.35rem; color:#9fb0cf; font-size:.76rem; }
    .sbi-dates-qa-warning-list { display:grid; gap:.35rem; margin:.8rem 0; }
    .sbi-dates-qa-warning { border:1px solid rgba(255,209,102,.18); border-radius:12px; padding:.6rem .7rem; background:rgba(255,209,102,.07); color:#ffe9ad; font-size:.82rem; }
    .sbi-dates-qa-students { margin:.6rem 0 1rem; color:#9fb0cf; font-size:.82rem; }
    .sbi-dates-qa-course-list { display:grid; gap:.7rem; }
    .sbi-dates-qa-course { display:grid; grid-template-columns: minmax(0,1fr) auto; gap:.75rem; align-items:start; border:1px solid rgba(255,255,255,.09); border-radius:16px; background:rgba(255,255,255,.045); padding:.8rem; }
    .sbi-dates-qa-course.is-parallel { border-color:rgba(170,140,255,.18); }
    .sbi-dates-qa-course.is-warning { border-color:rgba(255,209,102,.22); }
    .sbi-dates-qa-course strong { display:block; color:#fff; margin-bottom:.25rem; }
    .sbi-dates-qa-course small { display:flex; flex-wrap:wrap; gap:.35rem; color:#9fb0cf; }
    .sbi-dates-qa-pill { display:inline-flex; align-items:center; min-height:1.35rem; padding:0 .5rem; border-radius:999px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#dfe7ff; font-size:.72rem; }
    .sbi-dates-qa-pill.is-date { color:#c6f6ff; border-color:rgba(103,232,249,.2); }
    .sbi-dates-qa-pill.is-warning { color:#ffe9ad; border-color:rgba(255,209,102,.22); }
    .sbi-dates-qa-timeline-marker { font-size:.78rem; color:#9fb0cf; text-align:right; white-space:nowrap; }
    @media (max-width: 1100px) { .sbi-dates-qa-grid { grid-template-columns:1fr; } .sbi-dates-qa-list { max-height:none; } .sbi-dates-qa-summary { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width: 720px) { .sbi-dates-qa-hero { flex-direction:column; } .sbi-dates-qa-summary { grid-template-columns:1fr; } .sbi-dates-qa-course { grid-template-columns:1fr; } .sbi-dates-qa-timeline-marker { text-align:left; } }
  `;
  document.head.appendChild(style);
}

function showUnauthorized(message = 'Accès réservé aux administrateurs.') {
  const root = $('view-cursus-dates-qa');
  if (!root) return;
  root.innerHTML = `<div class="sbi-dates-qa-shell"><div class="sbi-dates-qa-empty is-large">${escapeHtml(message)}</div></div>`;
}

function renderPromotionList() {
  const list = $('qa-promotions-list');
  const count = $('qa-promotions-count');
  if (!list || !count) return;

  const search = normalizeSearch($('qa-search')?.value || '');
  const rows = [...promotions]
    .sort((a, b) => {
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
    list.innerHTML = '<div class="sbi-dates-qa-empty">Aucune promotion trouvée.</div>';
    return;
  }

  list.innerHTML = rows.map((promotion) => {
    const planCount = Array.isArray(promotion.coursePlan) ? promotion.coursePlan.length : 0;
    const students = getStudentsForPromotion(promotion.id).length;
    const active = promotion.id === selectedPromotionId;
    return `
      <button type="button" class="sbi-dates-qa-promo ${active ? 'is-active' : ''}" data-promotion-id="${escapeHtml(promotion.id)}">
        <strong>${escapeHtml(getPromotionLabel(promotion))}</strong>
        <small>
          <span>${escapeHtml(promotion.formationName || 'Formation non renseignée')}</span>
          <span>${escapeHtml(promotion.curriculumTitle || 'Cursus non renseigné')} · ${planCount} élément${planCount > 1 ? 's' : ''}</span>
          <span>${formatDate(promotion.startDate)} → ${formatDate(promotion.endDate)} · ${students} élève${students > 1 ? 's' : ''}</span>
        </small>
      </button>
    `;
  }).join('');
}

function renderDetail() {
  const detail = $('qa-detail');
  if (!detail) return;
  const promotion = promotions.find((item) => item.id === selectedPromotionId) || null;
  if (!promotion) {
    detail.innerHTML = '<div class="sbi-dates-qa-empty is-large">Sélectionnez une promotion pour afficher les cours datés comme un étudiant les verrait.</div>';
    return;
  }

  const plan = getPlanForPromotion(promotion);
  const warnings = buildWarnings(promotion, plan);
  const students = getStudentsForPromotion(promotion.id);
  const realCourses = plan.filter((item) => ['real_course', 'course'].includes(getType(item))).length;
  const placeholders = plan.filter((item) => getType(item) === 'placeholder_course').length;
  const parallel = plan.filter(isParallel).length;
  const evidence = plan.filter((item) => item.isQualiopiEvidence === true).length;

  detail.innerHTML = `
    <div class="sbi-dates-qa-panel-head">
      <div>
        <h3>${escapeHtml(getPromotionLabel(promotion))}</h3>
        <p>Vue QA temporaire · ${escapeHtml(promotion.formationName || 'Formation non renseignée')} · ${escapeHtml(promotion.curriculumTitle || 'Cursus non renseigné')}</p>
      </div>
      <a class="sbi-dates-qa-btn" href="/admin/admin-promotions.html">Modifier la promotion</a>
    </div>

    <div class="sbi-dates-qa-summary">
      <div class="sbi-dates-qa-metric"><strong>${plan.length}</strong><span>éléments visibles</span></div>
      <div class="sbi-dates-qa-metric"><strong>${realCourses}</strong><span>cours réels</span></div>
      <div class="sbi-dates-qa-metric"><strong>${parallel}</strong><span>devoirs / examens / lives</span></div>
      <div class="sbi-dates-qa-metric"><strong>${evidence}</strong><span>preuves Qualiopi</span></div>
    </div>

    <div class="sbi-dates-qa-students">
      Période promotion : <b>${formatDate(promotion.startDate)}</b> → <b>${formatDate(promotion.endDate)}</b> ·
      Élèves rattachés : <b>${students.length}</b>${students.length ? ` · ${escapeHtml(students.slice(0, 4).map(getStudentName).join(', '))}${students.length > 4 ? '…' : ''}` : ''}
    </div>

    ${warnings.length ? `<div class="sbi-dates-qa-warning-list">${warnings.map((warning) => `<div class="sbi-dates-qa-warning">${escapeHtml(warning)}</div>`).join('')}</div>` : ''}

    ${plan.length ? `<div class="sbi-dates-qa-course-list">${plan.map((item, index) => renderPlanItem(item, promotion, index)).join('')}</div>` : '<div class="sbi-dates-qa-empty">Aucun coursePlan disponible pour cette promotion.</div>'}
  `;
}

function getStudentName(student = {}) {
  return clean(`${student.prenom || ''} ${student.nom || ''}`) || student.displayName || student.email || 'Élève sans nom';
}

function renderPlanItem(item = {}, promotion = {}, index = 0) {
  const type = getType(item);
  const start = getStartDate(item);
  const end = getEndDate(item);
  const deadline = getDeadlineDate(item);
  const missingDates = !start || !end;
  const outside = isOutsidePromotion(item, promotion);
  const badges = [
    getTypeLabel(type),
    item.isRequired === false ? 'Optionnel' : 'Obligatoire',
    item.isBlocking || item.isBlockingPrerequisite ? 'Bloquant' : '',
    item.isQualiopiEvidence ? 'Preuve Qualiopi' : '',
    item.isSharedCourse ? 'Cours transversal' : '',
    item.prorataScale ? `Prorata ×${Number(item.prorataScale).toFixed(2)}` : '',
    item.relatedCourseTitle ? `Lié à : ${item.relatedCourseTitle}` : ''
  ].filter(Boolean);

  return `
    <article class="sbi-dates-qa-course ${isParallel(item) ? 'is-parallel' : ''} ${missingDates || outside ? 'is-warning' : ''}">
      <div>
        <strong>${index + 1}. ${escapeHtml(getItemTitle(item))}</strong>
        <small>
          ${badges.map((badge) => `<span class="sbi-dates-qa-pill">${escapeHtml(badge)}</span>`).join('')}
          <span class="sbi-dates-qa-pill is-date">${formatDate(start, 'Début ?')} → ${formatDate(end, 'Fin ?')}</span>
          <span class="sbi-dates-qa-pill is-date">Échéance : ${formatDate(deadline, 'Non renseignée')}</span>
          <span class="sbi-dates-qa-pill">${getDurationDays(item)} j</span>
          ${missingDates ? '<span class="sbi-dates-qa-pill is-warning">Dates incomplètes</span>' : ''}
          ${outside ? '<span class="sbi-dates-qa-pill is-warning">Hors période promotion</span>' : ''}
        </small>
      </div>
      <div class="sbi-dates-qa-timeline-marker">
        ${escapeHtml(item.source || 'coursePlan')}
      </div>
    </article>
  `;
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
        if (['student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(role)) students.push({ id: docSnap.id, ...data });
      });
      studentsByPromotion.set(promotion.id, students);
    } catch (error) {
      console.warn('[SBI QA Dates] Élèves non chargés pour promotion', promotion.id, error);
      studentsByPromotion.set(promotion.id, []);
    }
  }));
}

async function loadData() {
  if (loading) return;
  loading = true;
  const refreshBtn = $('qa-refresh-btn');
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

    if (!selectedPromotionId && promotions.length) {
      selectedPromotionId = promotions.find((item) => (item.status || 'active') === 'active')?.id || promotions[0].id;
    }
    renderPromotionList();
    renderDetail();
  } catch (error) {
    console.warn('[SBI QA Dates] Chargement impossible :', error);
    const list = $('qa-promotions-list');
    if (list) list.innerHTML = '<div class="sbi-dates-qa-empty">Chargement impossible.</div>';
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
  $('qa-refresh-btn')?.addEventListener('click', loadData);
  $('qa-search')?.addEventListener('input', () => {
    renderPromotionList();
  });
  $('qa-promotions-list')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-promotion-id]');
    if (!button) return;
    selectedPromotionId = button.dataset.promotionId || '';
    renderPromotionList();
    renderDetail();
  });
}

function mount() {
  if (!document.getElementById('view-cursus-dates-qa')) return;
  ensureStyles();
  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadData();
    } catch (error) {
      console.warn('[SBI QA Dates] Accès refusé :', error);
      showUnauthorized(error?.message || 'Accès réservé aux administrateurs.');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
