/**
 * SBI 8.0P.167.91 / P2I.5-C
 * Promotions / cohortes admin + overlay planning pédagogique V1.
 *
 * Périmètre volontairement borné :
 * - CRUD léger des promotions côté admin ;
 * - lecture des élèves par promotion sélectionnée ;
 * - affectation élève -> promotion déplacée dans le profil élève ;
 * - planning pédagogique non destructif Promotion -> Cursus -> cours ;
 * - overlay V1 : cours disponibles / timeline / réglages ;
 * - aucun calcul progression/checkpoint bloquant dans cette brique.
 */

import { auth, db } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let mounted = false;
let unsubscribeAuth = null;
let unsubscribePromotions = null;
let currentAdmin = null;
let promotions = [];
let rosterStudents = [];
let formations = [];
let courses = [];
let activeCoursePlan = [];
let selectedPlanningItemKey = '';
let draggedPlanningItemKey = '';
let activeRosterPromotionId = '';

const dom = {};

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

function slugify(value = '') {
  return clean(value, 140)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
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
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(ms));
  } catch (_) {
    return fallback;
  }
}

function getStudentName(student = {}) {
  return clean(`${student.prenom || ''} ${student.nom || ''}`) || student.email || 'Élève sans nom';
}

function getPromotionLabel(promotion = {}) {
  return promotion?.name || promotion?.promotionName || 'Promotion sans nom';
}

function isStudent(profile = {}) {
  const role = String(profile.role || '').toLowerCase();
  return ['student', 'eleve', 'élève', 'etudiant', 'étudiant'].includes(role);
}

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function setStatus(el, message = '', tone = 'muted') {
  if (!el) return;
  el.textContent = message;
  el.style.color = tone === 'success'
    ? '#2ed573'
    : tone === 'error'
      ? '#ff4a4a'
      : 'var(--text-muted, #9ca3af)';
}

function ensurePlanningOverlayPortal() {
  const overlay = $('promotion-planning-overlay');
  if (!overlay) return null;

  if (overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  }

  return overlay;
}

function cacheDom() {
  dom.form = $('promotion-form');
  dom.formTitle = $('promotion-form-title');
  dom.id = $('promotion-id');
  dom.name = $('promotion-name');
  dom.formation = $('promotion-formation');
  dom.startDate = $('promotion-start-date');
  dom.endDate = $('promotion-end-date');
  dom.status = $('promotion-status');
  dom.curriculumTitle = $('promotion-curriculum-title');
  dom.coursePlanStatus = $('promotion-course-plan-status');
  dom.planningSummaryTitle = $('promotion-planning-summary-title');
  dom.planningSummaryMeta = $('promotion-planning-summary-meta');
  dom.planningOpen = $('promotion-planning-open-btn');
  dom.planningOverlay = ensurePlanningOverlayPortal();
  dom.planningSubtitle = $('promotion-planning-subtitle');
  dom.planningAvailableCourses = $('promotion-planning-available-courses');
  dom.planningTimelineList = $('promotion-planning-timeline-list');
  dom.planningInspector = $('promotion-planning-inspector');
  dom.planningAutoDates = $('promotion-planning-auto-dates-btn');
  dom.planningApply = $('promotion-planning-apply-btn');
  dom.planningFooterStatus = $('promotion-planning-footer-status');
  dom.submit = $('promotion-submit-btn');
  dom.reset = $('promotion-reset-btn');
  dom.formStatus = $('promotion-form-status');
  dom.refresh = $('promotions-refresh-btn');
  dom.list = $('promotions-list');
  dom.count = $('promotions-count');
  dom.rosterSelect = $('promotion-roster-select');
  dom.rosterSearch = $('promotion-roster-search');
  dom.rosterRefresh = $('promotion-roster-refresh-btn');
  dom.rosterStatus = $('promotion-roster-status');
  dom.rosterList = $('promotion-roster-list');
}

function getSelectedFormation() {
  const value = dom.formation?.value || '';
  if (!value) return { formationId: '', formationName: '' };

  const found = formations.find((formation) => formation.id === value) || null;
  return {
    formationId: found?.id || value,
    formationName: found?.titre || found?.title || found?.nom || found?.name || found?.slug || value
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 160)).filter(Boolean);
  if (typeof value === 'string') return clean(value, 160) ? [clean(value, 160)] : [];
  return [];
}

function getCourseTitle(course = {}) {
  return clean(course.titre || course.title || course.nom || course.name || 'Cours sans titre', 180);
}

function getCourseBlockLabel(course = {}) {
  return clean(course.bloc || course.blockTitle || course.blockName || course.moduleTitle || '', 100);
}

function getCourseStatusLabel(course = {}) {
  if (course.actif === true || course.lmsStatus === 'published' || course.statutValidation === 'approved') return 'Publié';
  if (course.lmsStatus === 'pending_review' || course.statutValidation === 'pending') return 'En attente';
  return 'Brouillon';
}

function getCourseFormationRefs(course = {}) {
  return Array.from(new Set([
    ...normalizeArray(course.formationIds),
    ...normalizeArray(course.formationsIds),
    ...normalizeArray(course.targetFormationIds),
    ...normalizeArray(course.formations),
    ...normalizeArray(course.targetFormationTitles)
  ].map((item) => normalizeSearch(item)).filter(Boolean)));
}

function courseMatchesFormation(course = {}, formation = {}) {
  if (!formation.formationId && !formation.formationName) return false;
  const refs = getCourseFormationRefs(course);
  const formationRefs = [formation.formationId, formation.formationName]
    .map((item) => normalizeSearch(item))
    .filter(Boolean);
  return formationRefs.some((ref) => refs.includes(ref));
}

function findPlanItem(coursePlan = [], courseId = '') {
  if (!Array.isArray(coursePlan) || !courseId) return null;
  return coursePlan.find((item) => item?.courseId === courseId) || null;
}

function getCourseById(courseId = '') {
  return courses.find((course) => course.id === courseId) || null;
}

function getPlanItemKey(item = {}) {
  return item.courseId || item.itemId || '';
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getDefaultDurationDays(course = {}, item = {}) {
  return Math.max(1, Math.round(toNumber(
    item.durationDays ||
    course.estimatedDurationDays ||
    course.estimatedDurationMinDays ||
    course.durationDays ||
    7,
    7
  )));
}

function normalizePlanItem(item = {}, index = 0) {
  const course = getCourseById(item.courseId || '') || {};
  const title = clean(item.courseTitle || getCourseTitle(course), 180);
  const block = clean(item.blockTitle || getCourseBlockLabel(course), 120);
  const status = clean(item.courseStatus || getCourseStatusLabel(course), 80);
  const durationDays = getDefaultDurationDays(course, item);

  return {
    courseId: item.courseId || '',
    courseTitle: title,
    courseStatus: status,
    blockTitle: block,
    durationDays,
    recommendedStartAt: item.recommendedStartAt || '',
    recommendedEndAt: item.recommendedEndAt || '',
    deadlineAt: item.deadlineAt || '',
    priorityLevel: ['normal', 'high', 'urgent'].includes(item.priorityLevel) ? item.priorityLevel : 'normal',
    isRequired: item.isRequired !== false,
    isLocked: item.isLocked === true,
    isBlockingPrerequisite: item.isBlockingPrerequisite === true,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    source: item.source || 'promotion-course-plan-overlay-v1'
  };
}

function normalizeCoursePlan(coursePlan = []) {
  if (!Array.isArray(coursePlan)) return [];
  return coursePlan
    .map((item, index) => normalizePlanItem(item, index))
    .filter((item) => item.courseId)
    .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
    .map((item, index) => ({ ...item, order: index }));
}

function getActiveCoursePlanFromDom() {
  return normalizeCoursePlan(activeCoursePlan);
}

function getMatchingCoursesForSelectedFormation() {
  const formation = getSelectedFormation();
  if (!formation.formationId) return [];
  return courses
    .filter((course) => courseMatchesFormation(course, formation))
    .sort((a, b) => getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' }));
}

function getPlanDurationDays(plan = activeCoursePlan) {
  return plan.reduce((total, item) => total + Math.max(1, toNumber(item.durationDays, 7)), 0);
}

function renderPlanningSummary() {
  if (!dom.planningSummaryTitle || !dom.planningSummaryMeta) return;

  const formation = getSelectedFormation();
  const planCount = activeCoursePlan.length;
  const durationDays = getPlanDurationDays(activeCoursePlan);
  const curriculumTitle = clean(dom.curriculumTitle?.value || '', 140);

  if (!formation.formationId) {
    dom.planningSummaryTitle.textContent = 'Aucune formation liée';
    dom.planningSummaryMeta.textContent = 'Sélectionnez une formation privée pour préparer le planning pédagogique.';
    return;
  }

  if (!planCount) {
    dom.planningSummaryTitle.textContent = curriculumTitle || 'Planning non défini';
    dom.planningSummaryMeta.textContent = `${formation.formationName || 'Formation liée'} · aucun cours placé dans la timeline.`;
    return;
  }

  dom.planningSummaryTitle.textContent = curriculumTitle || `Planning ${formation.formationName || ''}`.trim();
  dom.planningSummaryMeta.textContent = `${planCount} cours · ${durationDays} jour${durationDays > 1 ? 's' : ''} estimé${durationDays > 1 ? 's' : ''} · accès libre conservé.`;
}

function setActiveCoursePlan(coursePlan = []) {
  activeCoursePlan = normalizeCoursePlan(coursePlan);
  if (selectedPlanningItemKey && !activeCoursePlan.some((item) => getPlanItemKey(item) === selectedPlanningItemKey)) {
    selectedPlanningItemKey = activeCoursePlan[0] ? getPlanItemKey(activeCoursePlan[0]) : '';
  }
  renderPlanningSummary();
  renderPlanningOverlay();
}

function renderCoursePlanOptions(coursePlan = activeCoursePlan) {
  setActiveCoursePlan(Array.isArray(coursePlan) ? coursePlan : activeCoursePlan);
}

function isPlanningOverlayOpen() {
  return Boolean(dom.planningOverlay?.classList.contains('is-open'));
}

function openPlanningOverlay() {
  if (!dom.planningOverlay) return;
  const formation = getSelectedFormation();
  if (!formation.formationId && dom.formStatus) {
    setStatus(dom.formStatus, 'Sélectionnez d’abord une formation liée.', 'error');
  }
  if (dom.planningSubtitle) {
    dom.planningSubtitle.textContent = formation.formationId
      ? `${formation.formationName || 'Formation'} · organisez les cours de cette promotion.`
      : 'Sélectionnez une formation liée pour charger les cours disponibles.';
  }
  dom.planningOverlay.classList.add('is-open');
  dom.planningOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sbi-planning-open');
  renderPlanningOverlay();
}

function closePlanningOverlay() {
  if (!dom.planningOverlay) return;
  dom.planningOverlay.classList.remove('is-open');
  dom.planningOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sbi-planning-open');
  renderPlanningSummary();
}

function getPriorityLabel(priority = 'normal') {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'high') return 'Haute';
  return 'Normale';
}

function renderPlanningAvailableCourses() {
  if (!dom.planningAvailableCourses || !dom.coursePlanStatus) return;
  const formation = getSelectedFormation();
  if (!formation.formationId) {
    dom.coursePlanStatus.textContent = 'Choisissez une formation liée pour charger les cours.';
    dom.planningAvailableCourses.innerHTML = '<div class="sbi-promotions-empty">Aucune formation liée.</div>';
    return;
  }

  const placedIds = new Set(activeCoursePlan.map((item) => item.courseId));
  const matchingCourses = getMatchingCoursesForSelectedFormation();
  const available = matchingCourses.filter((course) => !placedIds.has(course.id));

  dom.coursePlanStatus.textContent = `${matchingCourses.length} cours disponible${matchingCourses.length > 1 ? 's' : ''} · ${activeCoursePlan.length} placé${activeCoursePlan.length > 1 ? 's' : ''}.`;

  if (!matchingCourses.length) {
    dom.planningAvailableCourses.innerHTML = '<div class="sbi-promotions-empty">Aucun cours rattaché à cette formation pour l’instant.</div>';
    return;
  }

  if (!available.length) {
    dom.planningAvailableCourses.innerHTML = '<div class="sbi-promotions-empty">Tous les cours de cette formation sont déjà dans la timeline.</div>';
    return;
  }

  dom.planningAvailableCourses.innerHTML = available.map((course) => {
    const title = getCourseTitle(course);
    const block = getCourseBlockLabel(course);
    const status = getCourseStatusLabel(course);
    const duration = getDefaultDurationDays(course);
    return `
      <article class="sbi-planning-course-card" data-course-id="${escapeHtml(course.id)}">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(status)}${block ? ` · Bloc : ${escapeHtml(block)}` : ''} · ${duration} j estimés</small>
        </div>
        <button type="button" data-planning-add-course="${escapeHtml(course.id)}">Ajouter</button>
      </article>
    `;
  }).join('');
}

function renderPlanningTimeline() {
  if (!dom.planningTimelineList) return;

  if (!activeCoursePlan.length) {
    dom.planningTimelineList.innerHTML = '<div class="sbi-promotions-empty">Ajoutez des cours depuis la colonne de gauche pour construire la timeline.</div>';
    return;
  }

  dom.planningTimelineList.innerHTML = activeCoursePlan.map((item, index) => {
    const key = getPlanItemKey(item);
    const selected = key === selectedPlanningItemKey;
    const block = item.blockTitle ? `<span>Bloc : ${escapeHtml(item.blockTitle)}</span>` : '';
    const dates = item.recommendedStartAt || item.recommendedEndAt
      ? `<span>${escapeHtml(formatDate(item.recommendedStartAt, 'Début ?'))} → ${escapeHtml(formatDate(item.recommendedEndAt, 'Fin ?'))}</span>`
      : '<span>Dates à calculer</span>';

    return `
      <article class="sbi-planning-timeline-row ${selected ? 'is-selected' : ''}" draggable="true" data-plan-row data-plan-key="${escapeHtml(key)}">
        <button type="button" class="sbi-planning-order-badge" data-plan-select="${escapeHtml(key)}">${index + 1}</button>
        <div class="sbi-planning-timeline-content" data-plan-select="${escapeHtml(key)}">
          <strong>${escapeHtml(item.courseTitle || 'Cours sans titre')}</strong>
          <small>
            ${dates}
            <span>${Math.max(1, toNumber(item.durationDays, 7))} j</span>
            <span>${escapeHtml(getPriorityLabel(item.priorityLevel))}</span>
            ${block}
            ${item.isLocked ? '<span>Dates verrouillées</span>' : ''}
          </small>
        </div>
        <div class="sbi-planning-timeline-actions">
          <button type="button" data-plan-move="up" data-plan-key="${escapeHtml(key)}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-plan-move="down" data-plan-key="${escapeHtml(key)}" ${index === activeCoursePlan.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-plan-remove="${escapeHtml(key)}" class="is-danger">Retirer</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderPlanningInspector() {
  if (!dom.planningInspector) return;
  const item = activeCoursePlan.find((entry) => getPlanItemKey(entry) === selectedPlanningItemKey) || null;

  if (!item) {
    dom.planningInspector.innerHTML = '<div class="sbi-promotions-empty">Sélectionnez un cours dans la timeline.</div>';
    return;
  }

  dom.planningInspector.innerHTML = `
    <div class="sbi-planning-inspector-card" data-inspector-key="${escapeHtml(getPlanItemKey(item))}">
      <h5>${escapeHtml(item.courseTitle || 'Cours sans titre')}</h5>
      <p>${escapeHtml(item.blockTitle || 'Aucun bloc assigné')}</p>

      <label>Durée estimée en jours</label>
      <input type="number" min="1" max="365" data-plan-field="durationDays" value="${escapeHtml(item.durationDays || 7)}">

      <label>Début conseillé</label>
      <input type="date" data-plan-field="recommendedStartAt" value="${escapeHtml(item.recommendedStartAt || '')}">

      <label>Fin conseillée</label>
      <input type="date" data-plan-field="recommendedEndAt" value="${escapeHtml(item.recommendedEndAt || '')}">

      <label>Deadline</label>
      <input type="date" data-plan-field="deadlineAt" value="${escapeHtml(item.deadlineAt || '')}">

      <label>Priorité</label>
      <select data-plan-field="priorityLevel">
        ${['normal', 'high', 'urgent'].map((level) => `<option value="${level}" ${item.priorityLevel === level ? 'selected' : ''}>${getPriorityLabel(level)}</option>`).join('')}
      </select>

      <label class="sbi-planning-checkline">
        <input type="checkbox" data-plan-field="isRequired" ${item.isRequired !== false ? 'checked' : ''}>
        <span>Cours obligatoire dans le planning</span>
      </label>

      <label class="sbi-planning-checkline">
        <input type="checkbox" data-plan-field="isLocked" ${item.isLocked ? 'checked' : ''}>
        <span>Verrouiller les dates au recalcul</span>
      </label>

      <label class="sbi-planning-checkline">
        <input type="checkbox" data-plan-field="isBlockingPrerequisite" ${item.isBlockingPrerequisite ? 'checked' : ''}>
        <span>Prérequis bloquant</span>
      </label>
    </div>
  `;
}

function renderPlanningOverlay() {
  renderPlanningSummary();
  if (!isPlanningOverlayOpen()) return;
  renderPlanningAvailableCourses();
  renderPlanningTimeline();
  renderPlanningInspector();
  if (dom.planningFooterStatus) {
    const duration = getPlanDurationDays(activeCoursePlan);
    dom.planningFooterStatus.textContent = activeCoursePlan.length
      ? `${activeCoursePlan.length} cours · ${duration} jour${duration > 1 ? 's' : ''} estimé${duration > 1 ? 's' : ''}. Le planning sera sauvegardé avec la promotion.`
      : 'Ajoutez des cours à la timeline. Le planning sera sauvegardé avec la promotion.';
  }
}

function addCourseToActivePlan(courseId = '') {
  const course = getCourseById(courseId);
  if (!course || activeCoursePlan.some((item) => item.courseId === courseId)) return;
  const item = normalizePlanItem({
    courseId,
    courseTitle: getCourseTitle(course),
    courseStatus: getCourseStatusLabel(course),
    blockTitle: getCourseBlockLabel(course),
    durationDays: getDefaultDurationDays(course),
    priorityLevel: course.priorityLevel || 'normal',
    order: activeCoursePlan.length,
    source: 'promotion-course-plan-overlay-v1'
  }, activeCoursePlan.length);
  activeCoursePlan = [...activeCoursePlan, item].map((entry, index) => ({ ...entry, order: index }));
  selectedPlanningItemKey = getPlanItemKey(item);
  renderPlanningOverlay();
}

function removeCourseFromActivePlan(key = '') {
  activeCoursePlan = activeCoursePlan.filter((item) => getPlanItemKey(item) !== key)
    .map((item, index) => ({ ...item, order: index }));
  if (selectedPlanningItemKey === key) selectedPlanningItemKey = activeCoursePlan[0] ? getPlanItemKey(activeCoursePlan[0]) : '';
  renderPlanningOverlay();
}

function movePlanItem(key = '', direction = 'up') {
  const index = activeCoursePlan.findIndex((item) => getPlanItemKey(item) === key);
  if (index < 0) return;
  const target = direction === 'down' ? index + 1 : index - 1;
  if (target < 0 || target >= activeCoursePlan.length) return;
  const next = [...activeCoursePlan];
  [next[index], next[target]] = [next[target], next[index]];
  activeCoursePlan = next.map((item, itemIndex) => ({ ...item, order: itemIndex }));
  selectedPlanningItemKey = key;
  renderPlanningOverlay();
}

function movePlanItemTo(key = '', targetKey = '') {
  if (!key || !targetKey || key === targetKey) return;
  const from = activeCoursePlan.findIndex((item) => getPlanItemKey(item) === key);
  const to = activeCoursePlan.findIndex((item) => getPlanItemKey(item) === targetKey);
  if (from < 0 || to < 0) return;
  const next = [...activeCoursePlan];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  activeCoursePlan = next.map((entry, index) => ({ ...entry, order: index }));
  selectedPlanningItemKey = key;
  renderPlanningOverlay();
}

function updateSelectedPlanItem(field = '', value) {
  if (!selectedPlanningItemKey || !field) return;
  activeCoursePlan = activeCoursePlan.map((item) => {
    if (getPlanItemKey(item) !== selectedPlanningItemKey) return item;
    const next = { ...item };
    if (['isRequired', 'isLocked', 'isBlockingPrerequisite'].includes(field)) {
      next[field] = Boolean(value);
    } else if (field === 'durationDays') {
      next.durationDays = Math.max(1, Math.round(toNumber(value, item.durationDays || 7)));
    } else {
      next[field] = clean(value, 180);
    }
    return next;
  });
  renderPlanningOverlay();
}

function addDaysToDateString(dateString = '', days = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return '';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function recalculatePlanningDates() {
  const baseDate = dom.startDate?.value || '';
  if (!baseDate) {
    if (dom.planningFooterStatus) dom.planningFooterStatus.textContent = 'Ajoutez une date de début à la promotion avant le recalcul.';
    return;
  }

  let cursor = baseDate;
  activeCoursePlan = activeCoursePlan.map((item) => {
    if (item.isLocked && item.recommendedStartAt && item.recommendedEndAt) {
      cursor = addDaysToDateString(item.recommendedEndAt, 1) || cursor;
      return item;
    }

    const duration = Math.max(1, toNumber(item.durationDays, 7));
    const start = cursor;
    const end = addDaysToDateString(start, duration - 1) || start;
    cursor = addDaysToDateString(end, 1) || cursor;

    return {
      ...item,
      recommendedStartAt: start,
      recommendedEndAt: end,
      deadlineAt: item.deadlineAt || end
    };
  });

  renderPlanningOverlay();
}

function resetForm() {
  if (!dom.form) return;
  dom.id.value = '';
  dom.name.value = '';
  dom.formation.value = '';
  dom.startDate.value = '';
  dom.endDate.value = '';
  dom.status.value = 'active';
  if (dom.curriculumTitle) dom.curriculumTitle.value = '';
  selectedPlanningItemKey = '';
  setActiveCoursePlan([]);
  if (dom.formTitle) dom.formTitle.textContent = 'Créer une promotion';
  if (dom.submit) dom.submit.textContent = 'Créer la promotion';
  setStatus(dom.formStatus, '');
}

function fillForm(promotion) {
  if (!promotion || !dom.form) return;
  dom.id.value = promotion.id || '';
  dom.name.value = promotion.name || '';
  dom.formation.value = promotion.formationId || '';
  dom.startDate.value = promotion.startDate || '';
  dom.endDate.value = promotion.endDate || '';
  dom.status.value = promotion.status || 'active';
  if (dom.curriculumTitle) dom.curriculumTitle.value = promotion.curriculumTitle || '';
  selectedPlanningItemKey = '';
  setActiveCoursePlan(Array.isArray(promotion.coursePlan) ? promotion.coursePlan : []);
  if (dom.formTitle) dom.formTitle.textContent = 'Modifier la promotion';
  if (dom.submit) dom.submit.textContent = 'Sauvegarder';
  setStatus(dom.formStatus, 'Mode édition actif.');
}

function buildPromotionPayload() {
  const name = clean(dom.name?.value || '', 120);
  if (!name) throw new Error('Le nom de la promotion est obligatoire.');

  const status = dom.status?.value === 'archived' ? 'archived' : 'active';
  const formation = getSelectedFormation();

  const curriculumTitle = clean(dom.curriculumTitle?.value || formation.formationName || name, 140);
  const coursePlan = getActiveCoursePlanFromDom();

  return {
    name,
    slug: slugify(name),
    status,
    formationId: formation.formationId,
    formationName: formation.formationName,
    startDate: dom.startDate?.value || '',
    endDate: dom.endDate?.value || '',
    curriculumId: slugify(curriculumTitle || name),
    curriculumTitle,
    coursePlan,
    coursePlanVersion: 'promotion-course-plan-overlay-v1',
    coursePlanCount: coursePlan.length,
    updatedAt: serverTimestamp(),
    updatedBy: currentAdmin?.uid || '',
    updatedByEmail: currentAdmin?.email || ''
  };
}

async function savePromotion(event) {
  event?.preventDefault?.();
  if (!currentAdmin) return;

  if (dom.submit) {
    dom.submit.disabled = true;
    dom.submit.style.opacity = '0.65';
  }

  setStatus(dom.formStatus, 'Sauvegarde...');

  try {
    const payload = buildPromotionPayload();
    const editingId = dom.id?.value || '';

    if (editingId) {
      await setDoc(doc(db, 'promotions', editingId), payload, { merge: true });
      setStatus(dom.formStatus, 'Promotion mise à jour.', 'success');
    } else {
      await addDoc(collection(db, 'promotions'), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: currentAdmin.uid,
        createdByEmail: currentAdmin.email || ''
      });
      setStatus(dom.formStatus, 'Promotion créée.', 'success');
      resetForm();
    }
  } catch (error) {
    console.warn('[SBI Promotions] Sauvegarde impossible :', error);
    setStatus(dom.formStatus, error?.message || 'Sauvegarde impossible.', 'error');
  } finally {
    if (dom.submit) {
      dom.submit.disabled = false;
      dom.submit.style.opacity = '';
    }
  }
}

async function toggleArchivePromotion(id) {
  const promotion = promotions.find((item) => item.id === id);
  if (!promotion) return;

  const nextStatus = promotion.status === 'archived' ? 'active' : 'archived';

  try {
    await updateDoc(doc(db, 'promotions', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: currentAdmin?.uid || '',
      updatedByEmail: currentAdmin?.email || ''
    });
    setStatus(dom.formStatus, nextStatus === 'archived' ? 'Promotion archivée.' : 'Promotion réactivée.', 'success');
  } catch (error) {
    console.warn('[SBI Promotions] Archivage impossible :', error);
    setStatus(dom.formStatus, 'Archivage impossible.', 'error');
  }
}

async function countPromotionStudents(id) {
  if (!id) return 0;

  try {
    const snap = await getDocs(query(collection(db, 'users'), where('promotionId', '==', id)));
    return snap.docs.filter((docSnap) => isStudent(docSnap.data() || {})).length;
  } catch (error) {
    console.warn('[SBI Promotions] Comptage élèves avant suppression impossible :', error);
    return 0;
  }
}

async function deletePromotion(id) {
  const promotion = promotions.find((item) => item.id === id);
  if (!promotion) return;

  const label = getPromotionLabel(promotion);
  const studentCount = await countPromotionStudents(id);
  const warning = studentCount > 0
    ? `

Attention : ${studentCount} élève${studentCount > 1 ? 's sont' : ' est'} encore rattaché${studentCount > 1 ? 's' : ''} à cette promotion. Supprimer la promotion ne retirera pas automatiquement leur rattachement.`
    : '';

  const firstConfirm = window.confirm(`Supprimer définitivement la promotion « ${label} » ?${warning}

Cette action est irréversible.`);
  if (!firstConfirm) return;

  const secondConfirm = window.confirm(`Confirmez la suppression définitive de « ${label} ».

Pour une promotion réelle avec élèves, préférez archiver.`);
  if (!secondConfirm) return;

  try {
    await deleteDoc(doc(db, 'promotions', id));
    if (dom.id?.value === id) resetForm();
    if (activeRosterPromotionId === id) {
      activeRosterPromotionId = '';
      rosterStudents = [];
      renderRosterStudents();
    }
    setStatus(dom.formStatus, 'Promotion supprimée définitivement.', 'success');
  } catch (error) {
    console.warn('[SBI Promotions] Suppression impossible :', error);
    setStatus(dom.formStatus, 'Suppression impossible.', 'error');
  }
}

function sortedPromotions() {
  return [...promotions].sort((a, b) => {
    if ((a.status || 'active') !== (b.status || 'active')) return (a.status || 'active') === 'active' ? -1 : 1;
    return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
  });
}

function renderRosterSelect() {
  if (!dom.rosterSelect) return;

  const current = dom.rosterSelect.value || activeRosterPromotionId || '';
  const rows = sortedPromotions();

  dom.rosterSelect.innerHTML = `
    <option value="">Sélectionner une promotion</option>
    ${rows.map((promotion) => `
      <option value="${escapeHtml(promotion.id)}">${escapeHtml(getPromotionLabel(promotion))}${promotion.status === 'archived' ? ' · archivée' : ''}</option>
    `).join('')}
  `;

  if (current && rows.some((promotion) => promotion.id === current)) {
    dom.rosterSelect.value = current;
    activeRosterPromotionId = current;
  } else {
    activeRosterPromotionId = '';
  }
}

function renderPromotions() {
  if (!dom.list) return;

  const sorted = sortedPromotions();

  if (dom.count) {
    const activeCount = sorted.filter((promotion) => promotion.status !== 'archived').length;
    dom.count.textContent = `${sorted.length} promotion${sorted.length > 1 ? 's' : ''} · ${activeCount} active${activeCount > 1 ? 's' : ''}`;
  }

  if (!sorted.length) {
    dom.list.innerHTML = '<div class="sbi-promotions-empty">Aucune promotion créée pour l’instant.</div>';
    renderRosterSelect();
    return;
  }

  dom.list.innerHTML = sorted.map((promotion) => {
    const status = promotion.status === 'archived' ? 'archived' : 'active';
    const dates = [
      promotion.startDate ? `Début ${formatDate(promotion.startDate)}` : '',
      promotion.endDate ? `Fin ${formatDate(promotion.endDate)}` : ''
    ].filter(Boolean).join(' · ');

    return `
      <article class="sbi-promotions-row ${status === 'archived' ? 'is-archived' : ''}" data-promotion-id="${escapeHtml(promotion.id)}">
        <div>
          <strong>${escapeHtml(getPromotionLabel(promotion))}</strong>
          <p>${escapeHtml(promotion.formationName || 'Formation non liée')}</p>
          <div class="sbi-promotions-meta">
            <span class="sbi-promotions-pill ${status === 'archived' ? 'is-archived' : 'is-active'}">${status === 'archived' ? 'Archivée' : 'Active'}</span>
            ${dates ? `<span class="sbi-promotions-pill">${escapeHtml(dates)}</span>` : ''}
            ${promotion.curriculumTitle ? `<span class="sbi-promotions-pill is-curriculum">Cursus : ${escapeHtml(promotion.curriculumTitle)}</span>` : ''}
            ${Number(promotion.coursePlanCount || 0) > 0 ? `<span class="sbi-promotions-pill">${Number(promotion.coursePlanCount || 0)} cours prioritaire${Number(promotion.coursePlanCount || 0) > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        <div class="sbi-promotions-actions">
          <button type="button" data-action="roster" data-id="${escapeHtml(promotion.id)}" class="is-primary">Voir élèves</button>
          <button type="button" data-action="edit" data-id="${escapeHtml(promotion.id)}">Modifier</button>
          <button type="button" data-action="archive" data-id="${escapeHtml(promotion.id)}" class="${status === 'archived' ? '' : 'is-danger'}">${status === 'archived' ? 'Réactiver' : 'Archiver'}</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(promotion.id)}" class="is-danger is-delete">Supprimer</button>
        </div>
      </article>
    `;
  }).join('');

  renderRosterSelect();
}

function renderFormationSelect() {
  if (!dom.formation) return;

  const current = dom.formation.value;
  dom.formation.innerHTML = `
    <option value="">Aucune formation liée pour l’instant</option>
    ${formations.map((formation) => {
      const label = formation.titre || formation.title || formation.nom || formation.name || formation.slug || formation.id;
      return `<option value="${escapeHtml(formation.id)}">${escapeHtml(label)}</option>`;
    }).join('')}
  `;

  if (current && formations.some((formation) => formation.id === current)) dom.formation.value = current;
}

function renderRosterStudents() {
  if (!dom.rosterList) return;

  if (!activeRosterPromotionId) {
    dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Sélectionnez une promotion pour afficher ses élèves.</div>';
    setStatus(dom.rosterStatus, '');
    return;
  }

  const search = normalizeSearch(dom.rosterSearch?.value || '');
  const selectedPromotion = promotions.find((promotion) => promotion.id === activeRosterPromotionId);
  const filtered = rosterStudents
    .filter((student) => {
      if (!search) return true;
      const haystack = normalizeSearch(`${getStudentName(student)} ${student.email || ''}`);
      return haystack.includes(search);
    })
    .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b), 'fr', { sensitivity: 'base' }));

  if (dom.rosterStatus) {
    dom.rosterStatus.textContent = selectedPromotion
      ? `${filtered.length}/${rosterStudents.length} élève${rosterStudents.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''} · ${getPromotionLabel(selectedPromotion)}`
      : `${filtered.length} élève${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}`;
    dom.rosterStatus.style.color = 'var(--text-muted, #9ca3af)';
  }

  if (!rosterStudents.length) {
    dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Aucun élève rattaché à cette promotion pour l’instant.</div>';
    return;
  }

  if (!filtered.length) {
    dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Aucun élève ne correspond à cette recherche dans la promotion sélectionnée.</div>';
    return;
  }

  dom.rosterList.innerHTML = filtered.map((student) => `
    <article class="sbi-promotions-student-row" data-student-id="${escapeHtml(student.id)}">
      <div>
        <strong>${escapeHtml(getStudentName(student))}</strong>
        <p>${escapeHtml(student.email || 'Email manquant')}</p>
      </div>
      <div class="sbi-promotions-actions">
        <button type="button" data-action="profile" data-id="${escapeHtml(student.id)}" class="is-primary">Ouvrir profil</button>
      </div>
    </article>
  `).join('');
}

async function loadFormations() {
  try {
    const snap = await getDocs(collection(db, 'formations'));
    formations = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      formations.push({ id: docSnap.id, ...data });
    });
    formations.sort((a, b) => String(a.titre || a.title || a.nom || a.name || '').localeCompare(String(b.titre || b.title || b.nom || b.name || ''), 'fr', { sensitivity: 'base' }));
  } catch (error) {
    console.warn('[SBI Promotions] Catégories & Accès non chargées :', error);
    formations = [];
  }

  renderFormationSelect();
}

async function loadCoursesForPlan() {
  try {
    const snap = await getDocs(collection(db, 'courses'));
    courses = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      courses.push({ id: docSnap.id, ...data });
    });
  } catch (error) {
    console.warn('[SBI Promotions] Cours non chargés pour le plan de promotion :', error);
    courses = [];
    if (dom.coursePlanStatus) dom.coursePlanStatus.textContent = 'Chargement des cours impossible.';
  }

  renderCoursePlanOptions();
}

async function loadPromotionStudents(promotionId = activeRosterPromotionId) {
  activeRosterPromotionId = promotionId || '';
  rosterStudents = [];

  if (dom.rosterSelect && dom.rosterSelect.value !== activeRosterPromotionId) {
    dom.rosterSelect.value = activeRosterPromotionId;
  }

  if (!activeRosterPromotionId) {
    renderRosterStudents();
    return;
  }

  if (dom.rosterRefresh) {
    dom.rosterRefresh.disabled = true;
    dom.rosterRefresh.style.opacity = '0.65';
  }

  setStatus(dom.rosterStatus, 'Chargement des élèves de la promotion...');

  try {
    const snap = await getDocs(query(collection(db, 'users'), where('promotionId', '==', activeRosterPromotionId)));
    rosterStudents = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (isStudent(data)) rosterStudents.push({ id: docSnap.id, ...data });
    });
    renderRosterStudents();
  } catch (error) {
    console.warn('[SBI Promotions] Élèves de la promotion non chargés :', error);
    setStatus(dom.rosterStatus, 'Chargement des élèves impossible.', 'error');
    if (dom.rosterList) dom.rosterList.innerHTML = '<div class="sbi-promotions-empty">Lecture élèves impossible.</div>';
  } finally {
    if (dom.rosterRefresh) {
      dom.rosterRefresh.disabled = false;
      dom.rosterRefresh.style.opacity = '';
    }
  }
}

function startPromotionsSnapshot() {
  unsubscribePromotions?.();

  unsubscribePromotions = onSnapshot(query(collection(db, 'promotions')), (snapshot) => {
    promotions = [];
    snapshot.forEach((docSnap) => {
      promotions.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });
    renderPromotions();

    if (activeRosterPromotionId && promotions.some((promotion) => promotion.id === activeRosterPromotionId)) {
      loadPromotionStudents(activeRosterPromotionId);
    } else {
      rosterStudents = [];
      renderRosterStudents();
    }
  }, (error) => {
    console.warn('[SBI Promotions] Snapshot promotions impossible :', error);
    if (dom.list) dom.list.innerHTML = '<div class="sbi-promotions-empty">Lecture promotions impossible. Vérifiez les règles Firestore.</div>';
  });
}

async function openProfile(uid) {
  if (!uid) return;
  const href = `/admin/admin-profile.html?id=${encodeURIComponent(uid)}`;
  const url = new URL(href, window.location.origin);

  try {
    window.__SBI_ADMIN_PROFILE_TARGET_UID = uid;
    window.__SBI_ADMIN_PROFILE_TARGET_URL = url.href;
    sessionStorage.setItem('sbiAdminProfileTargetUid', uid);
    sessionStorage.setItem('sbiAdminProfileTargetUrl', url.href);
  } catch {}

  try {
    if (window.SBI_APP_SHELL && typeof window.SBI_APP_SHELL.navigate === 'function') {
      const handled = await window.SBI_APP_SHELL.navigate(url, {
        historyMode: 'push',
        source: 'promotions-profile-button'
      });
      if (handled) return;
    }

    if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(url.href, {
        historyMode: 'push',
        source: 'promotions-profile-button'
      });
      if (handled) return;
    }
  } catch (error) {
    console.warn('[SBI Promotions] Navigation profil PJAX indisponible, fallback reload :', error);
  }

  window.location.assign(url.pathname + url.search);
}

function bindEvents() {
  dom.form?.addEventListener('submit', savePromotion);
  dom.reset?.addEventListener('click', resetForm);
  dom.refresh?.addEventListener('click', () => {
    loadFormations().then(loadCoursesForPlan);
    startPromotionsSnapshot();
    if (activeRosterPromotionId) loadPromotionStudents(activeRosterPromotionId);
  });
  dom.rosterRefresh?.addEventListener('click', () => loadPromotionStudents(dom.rosterSelect?.value || activeRosterPromotionId));
  dom.rosterSelect?.addEventListener('change', () => loadPromotionStudents(dom.rosterSelect.value));
  dom.rosterSearch?.addEventListener('input', renderRosterStudents);
  dom.formation?.addEventListener('change', () => {
    selectedPlanningItemKey = '';
    setActiveCoursePlan([]);
  });
  dom.planningOpen?.addEventListener('click', openPlanningOverlay);
  dom.planningApply?.addEventListener('click', closePlanningOverlay);
  dom.planningOverlay?.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-planning-close]')) closePlanningOverlay();
  });
  dom.planningAutoDates?.addEventListener('click', recalculatePlanningDates);
  dom.planningAvailableCourses?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-planning-add-course]');
    if (!button) return;
    addCourseToActivePlan(button.dataset.planningAddCourse || '');
  });
  dom.planningTimelineList?.addEventListener('click', (event) => {
    const select = event.target.closest?.('[data-plan-select]');
    const move = event.target.closest?.('[data-plan-move]');
    const remove = event.target.closest?.('[data-plan-remove]');

    if (remove) {
      removeCourseFromActivePlan(remove.dataset.planRemove || '');
      return;
    }

    if (move) {
      movePlanItem(move.dataset.planKey || '', move.dataset.planMove || 'up');
      return;
    }

    if (select) {
      selectedPlanningItemKey = select.dataset.planSelect || '';
      renderPlanningOverlay();
    }
  });
  dom.planningTimelineList?.addEventListener('dragstart', (event) => {
    const row = event.target.closest?.('[data-plan-row]');
    if (!row) return;
    draggedPlanningItemKey = row.dataset.planKey || '';
    row.classList.add('is-dragging');
  });
  dom.planningTimelineList?.addEventListener('dragend', () => {
    draggedPlanningItemKey = '';
    dom.planningTimelineList?.querySelectorAll('.is-dragging').forEach((row) => row.classList.remove('is-dragging'));
  });
  dom.planningTimelineList?.addEventListener('dragover', (event) => {
    if (!draggedPlanningItemKey) return;
    event.preventDefault();
  });
  dom.planningTimelineList?.addEventListener('drop', (event) => {
    if (!draggedPlanningItemKey) return;
    const row = event.target.closest?.('[data-plan-row]');
    if (!row) return;
    event.preventDefault();
    movePlanItemTo(draggedPlanningItemKey, row.dataset.planKey || '');
  });
  dom.planningInspector?.addEventListener('change', (event) => {
    const field = event.target?.dataset?.planField || '';
    if (!field) return;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    updateSelectedPlanItem(field, value);
  });

  dom.list?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action][data-id]');
    if (!button) return;

    const promotion = promotions.find((item) => item.id === button.dataset.id);
    if (!promotion) return;

    if (button.dataset.action === 'edit') fillForm(promotion);
    if (button.dataset.action === 'archive') toggleArchivePromotion(promotion.id);
    if (button.dataset.action === 'delete') deletePromotion(promotion.id);
    if (button.dataset.action === 'roster') loadPromotionStudents(promotion.id);
  });

  dom.rosterList?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action="profile"][data-id]');
    if (!button) return;
    openProfile(button.dataset.id);
  });
}

async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Authentification requise.');
  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists()) throw new Error('Profil admin introuvable.');

  const profile = profileSnap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');

  currentAdmin = {
    uid: user.uid,
    email: user.email || profile.email || '',
    profile
  };
}

function showUnauthorized(message) {
  const root = $('view-promotions');
  if (!root) return;
  root.innerHTML = `
    <div class="sbi-promotions-card">
      <h3>Accès impossible</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

export function mountAdminPromotions() {
  if (mounted && document.getElementById('view-promotions')) return window.SBI_ADMIN_PROMOTIONS_UNMOUNT || (() => {});
  if (!document.getElementById('view-promotions')) return () => {};

  mounted = true;
  cacheDom();
  bindEvents();
  resetForm();
  renderRosterStudents();

  unsubscribeAuth?.();
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadFormations();
      await loadCoursesForPlan();
      startPromotionsSnapshot();
    } catch (error) {
      console.warn('[SBI Promotions] Accès refusé :', error);
      showUnauthorized(error?.message || 'Accès réservé aux administrateurs.');
    }
  });

  const cleanup = () => {
    mounted = false;
    closePlanningOverlay();
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    unsubscribePromotions?.();
    unsubscribePromotions = null;
    if (dom.planningOverlay?.parentElement === document.body) {
      dom.planningOverlay.remove();
    }
    dom.planningOverlay = null;
  };

  window.SBI_ADMIN_PROMOTIONS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminPromotions(), { once: true });
} else {
  mountAdminPromotions();
}
