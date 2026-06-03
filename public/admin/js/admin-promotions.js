/**
 * SBI 8.0P.167.98.2 / P2I.5-H
 * Promotions / cohortes admin + sélection de cursus existant.
 *
 * Périmètre volontairement borné :
 * - CRUD léger des promotions côté admin ;
 * - lecture des élèves par promotion sélectionnée ;
 * - affectation élève -> promotion déplacée dans le profil élève ;
 * - planning pédagogique non destructif Promotion -> Cursus -> cours ;
 * - la création/édition des cursus se fait désormais dans /admin/admin-cursus.html ;
 * - cette page ne doit plus ouvrir l’ancien overlay de construction ;
 * - Promotions sélectionne un cursus existant, le copie dans la promotion, puis recalcule ses dates ;
 * - compatibilité conservée avec curriculumTemplates, cours mutualisés et coursePlan ;
 * - aucun calcul progression/checkpoint bloquant dans cette brique.
 */

import { auth, db } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { renderCompletenessBadge, injectCompletenessBadgeStyles } from '/js/account-completeness.js?v=8.0P.167.303';
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
let mountedView = null;
let unsubscribeAuth = null;
let unsubscribePromotions = null;
let currentAdmin = null;
let promotions = [];
let rosterStudents = [];
let formations = [];
let courses = [];
let curriculumTemplates = [];
let activeCoursePlan = [];
let selectedPlanningItemKey = '';
let draggedPlanningItemKey = '';
let replacePlaceholderItemKey = '';
let activeCurriculumTemplateId = '';
let courseSourceFilter = 'linked';
let activeRosterPromotionId = '';

const dom = {};

const PLANNING_STRUCTURAL_TYPES = ['real_course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'];
const PLANNING_PARALLEL_TYPES = ['assignment', 'exam', 'evaluation', 'live_session', 'workshop'];
const PLANNING_LAYERS = [
  { key: 'courses', label: 'Cours', hint: 'Cours réels et cours futurs qui structurent le parcours.', types: ['real_course', 'placeholder_course'] },
  { key: 'assignments', label: 'Devoirs / livrables', hint: 'Travaux à rendre en parallèle d’un cours ou d’une période.', types: ['assignment'] },
  { key: 'assessments', label: 'Examens / évaluations', hint: 'Évaluations, examens et validations placés sur une piste dédiée.', types: ['exam', 'evaluation'] },
  { key: 'lives', label: 'Lives / ateliers', hint: 'Interventions, ateliers, lives et sessions synchrones.', types: ['live_session', 'workshop'] },
  { key: 'buffers', label: 'Marges / révisions', hint: 'Marge, révisions et rattrapage qui consomment du temps pédagogique.', types: ['buffer_period', 'revision_period', 'catchup_period'] }
];

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

function ensureCurriculumTemplateModalPortal() {
  const modal = $('promotion-curriculum-template-modal');
  if (!modal) return null;

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  return modal;
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
  dom.curriculumLoad = $('promotion-curriculum-load-btn');
  dom.curriculumSave = $('promotion-curriculum-save-btn');
  dom.curriculumTemplateModal = ensureCurriculumTemplateModalPortal();
  dom.curriculumTemplateList = $('promotion-curriculum-template-list');
  dom.curriculumTemplateStatus = $('promotion-curriculum-template-status');
  dom.curriculumSaveModal = $('promotion-curriculum-save-modal');
  dom.curriculumSaveTitle = $('promotion-curriculum-save-title-input');
  dom.curriculumSaveStatus = $('promotion-curriculum-save-status');
  dom.curriculumSaveActive = $('promotion-curriculum-save-active-btn');
  dom.curriculumSaveNew = $('promotion-curriculum-save-new-btn');
  dom.curriculumSaveActiveLabel = $('promotion-curriculum-save-active-label');
  dom.coursePlanStatus = $('promotion-course-plan-status');
  dom.planningSummaryTitle = $('promotion-planning-summary-title');
  dom.planningSummaryMeta = $('promotion-planning-summary-meta');
  dom.planningOpen = $('promotion-planning-open-btn');
  dom.planningOverlay = ensurePlanningOverlayPortal();
  dom.planningSubtitle = $('promotion-planning-subtitle');
  dom.planningAvailableCourses = $('promotion-planning-available-courses');
  dom.planningCourseSource = $('promotion-planning-course-source');
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

function getFormationLabelById(formationId = '') {
  const found = formations.find((formation) => String(formation.id || '') === String(formationId || '')) || null;
  return found?.titre || found?.title || found?.nom || found?.name || found?.slug || formationId || '';
}

function getCourseSharedFlag(course = {}) {
  return course.sharedCourse === true || course.isSharedCourse === true || course.isTransversal === true || course.scope === 'shared';
}

function getCourseSourceInfo(course = {}) {
  const explicitSourceId = clean(course.sourceFormationId || course.originFormationId || '', 160);
  const explicitSourceName = clean(course.sourceFormationName || course.originFormationName || '', 180);
  const ids = [
    explicitSourceId,
    ...normalizeArray(course.formationIds),
    ...normalizeArray(course.formationsIds),
    ...normalizeArray(course.targetFormationIds)
  ].filter(Boolean);
  const names = [
    explicitSourceName,
    ...normalizeArray(course.formationNames),
    ...normalizeArray(course.targetFormationTitles),
    ...normalizeArray(course.formations)
  ].filter(Boolean);

  const sourceFormationId = ids[0] || '';
  const sourceFormationName = names[0] || getFormationLabelById(sourceFormationId) || '';

  return {
    sourceFormationId,
    sourceFormationName,
    hasFormationRef: Boolean(sourceFormationId || sourceFormationName),
    isSharedCourse: getCourseSharedFlag(course) || (!sourceFormationId && !sourceFormationName)
  };
}

function getDisplayContextFormation() {
  const formation = getSelectedFormation();
  return {
    displayContextFormationId: formation.formationId || '',
    displayContextFormationName: formation.formationName || ''
  };
}

function isExternalCourseForSelectedFormation(course = {}) {
  const formation = getSelectedFormation();
  if (!formation.formationId) return false;
  return !courseMatchesFormation(course, formation);
}

function getCourseSourceFilterLabel(value = courseSourceFilter) {
  if (value === 'shared') return 'cours transversaux';
  if (value === 'other') return 'cours d’autres formations';
  if (value === 'all') return 'tous les cours';
  return 'formation liée';
}

function courseMatchesSourceFilter(course = {}) {
  const formation = getSelectedFormation();
  const linked = courseMatchesFormation(course, formation);
  const source = getCourseSourceInfo(course);
  const filter = courseSourceFilter || 'linked';

  if (filter === 'shared') return source.isSharedCourse;
  if (filter === 'other') return !linked && source.hasFormationRef;
  if (filter === 'all') return linked || source.isSharedCourse || source.hasFormationRef;
  return linked;
}

function buildCourseContextPayload(course = {}, extra = {}) {
  const source = getCourseSourceInfo(course);
  const display = getDisplayContextFormation();
  const external = isExternalCourseForSelectedFormation(course);
  const shared = source.isSharedCourse || external;

  return {
    sourceFormationId: clean(extra.sourceFormationId || source.sourceFormationId || '', 160),
    sourceFormationName: clean(extra.sourceFormationName || source.sourceFormationName || '', 180),
    displayContextFormationId: clean(extra.displayContextFormationId || display.displayContextFormationId || '', 160),
    displayContextFormationName: clean(extra.displayContextFormationName || display.displayContextFormationName || '', 180),
    isSharedCourse: extra.isSharedCourse === true || shared,
    grantedByCurriculum: extra.grantedByCurriculum === false ? false : true
  };
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

function makePlanningItemId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPlanItemType(item = {}) {
  if (item.type) return item.type;
  if (item.itemType) return item.itemType;
  return item.courseId ? 'real_course' : 'placeholder_course';
}

function isCoursePlanItem(item = {}) {
  return getPlanItemType(item) === 'real_course';
}

function getPlanningTypeLabel(type = 'real_course') {
  if (type === 'placeholder_course') return 'Cours futur';
  if (type === 'buffer_period') return 'Marge';
  if (type === 'revision_period') return 'Révisions';
  if (type === 'catchup_period') return 'Rattrapage';
  if (type === 'assignment') return 'Devoir';
  if (type === 'exam') return 'Examen';
  if (type === 'evaluation') return 'Évaluation';
  if (type === 'live_session') return 'Live';
  if (type === 'workshop') return 'Atelier';
  return 'Cours';
}

function isStructuralPlanningType(type = 'real_course') {
  return PLANNING_STRUCTURAL_TYPES.includes(type);
}

function isParallelPlanningType(type = 'real_course') {
  return PLANNING_PARALLEL_TYPES.includes(type);
}

function getPlanningLayerKey(type = 'real_course') {
  const found = PLANNING_LAYERS.find((layer) => layer.types.includes(type));
  return found?.key || 'courses';
}

function getPlanningLayer(type = 'real_course') {
  return PLANNING_LAYERS.find((layer) => layer.key === getPlanningLayerKey(type)) || PLANNING_LAYERS[0];
}

function getDefaultParallelDurationDays(type = 'assignment') {
  if (type === 'exam' || type === 'evaluation') return 1;
  if (type === 'live_session' || type === 'workshop') return 1;
  return 3;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getDefaultDurationDays(course = {}, item = {}) {
  const type = getPlanItemType(item);
  const fallback = isParallelPlanningType(type) ? getDefaultParallelDurationDays(type) : 7;
  return Math.max(1, Math.round(toNumber(
    item.durationDays ||
    item.estimatedDurationDays ||
    course.estimatedDurationDays ||
    course.estimatedDurationMinDays ||
    course.durationDays ||
    fallback,
    fallback
  )));
}

function normalizePlanItem(item = {}, index = 0) {
  const type = getPlanItemType(item);
  const isCourse = type === 'real_course';
  const course = isCourse ? (getCourseById(item.courseId || '') || {}) : {};
  const itemId = isCourse ? '' : (item.itemId || makePlanningItemId(type));
  const title = clean(
    item.courseTitle || item.title || (isCourse ? getCourseTitle(course) : getPlanningTypeLabel(type)),
    180
  );
  const block = clean(item.blockTitle || getCourseBlockLabel(course), 120);
  const status = clean(
    item.courseStatus || item.status || (isCourse ? getCourseStatusLabel(course) : getPlanningTypeLabel(type)),
    80
  );
  const durationDays = getDefaultDurationDays(course, item);
  const courseContext = isCourse ? buildCourseContextPayload(course, item) : {
    sourceFormationId: clean(item.sourceFormationId || '', 160),
    sourceFormationName: clean(item.sourceFormationName || '', 180),
    displayContextFormationId: clean(item.displayContextFormationId || getDisplayContextFormation().displayContextFormationId || '', 160),
    displayContextFormationName: clean(item.displayContextFormationName || getDisplayContextFormation().displayContextFormationName || '', 180),
    isSharedCourse: item.isSharedCourse === true,
    grantedByCurriculum: item.grantedByCurriculum === true
  };
  const relatedCourseId = clean(item.relatedCourseId || '', 160);
  const relatedCourse = relatedCourseId ? getCourseById(relatedCourseId) : null;

  return {
    type,
    layer: item.layer || getPlanningLayerKey(type),
    itemId,
    courseId: isCourse ? (item.courseId || '') : '',
    courseTitle: title,
    title,
    courseStatus: status,
    blockTitle: block,
    durationDays,
    recommendedStartAt: item.recommendedStartAt || item.plannedStartAt || item.startAt || '',
    recommendedEndAt: item.recommendedEndAt || item.plannedEndAt || item.endAt || '',
    deadlineAt: item.deadlineAt || item.dueAt || '',
    dueAt: item.dueAt || item.deadlineAt || '',
    relatedCourseId,
    relatedCourseTitle: clean(item.relatedCourseTitle || (relatedCourse ? getCourseTitle(relatedCourse) : ''), 180),
    priorityLevel: ['normal', 'high', 'urgent'].includes(item.priorityLevel) ? item.priorityLevel : 'normal',
    isRequired: item.isRequired !== false,
    isLocked: item.isLocked === true,
    isBlockingPrerequisite: item.isBlockingPrerequisite === true,
    isBlocking: item.isBlocking === true || item.isBlockingPrerequisite === true,
    isQualiopiEvidence: item.isQualiopiEvidence === true,
    sourceFormationId: courseContext.sourceFormationId || '',
    sourceFormationName: courseContext.sourceFormationName || '',
    displayContextFormationId: courseContext.displayContextFormationId || '',
    displayContextFormationName: courseContext.displayContextFormationName || '',
    isSharedCourse: courseContext.isSharedCourse === true,
    grantedByCurriculum: courseContext.grantedByCurriculum === true,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    source: item.source || (isCourse ? 'promotion-course-plan-overlay-v1' : isParallelPlanningType(type) ? 'promotion-planning-layer-v1' : 'promotion-planning-placeholder-v1')
  };
}

function normalizeCoursePlan(coursePlan = []) {
  if (!Array.isArray(coursePlan)) return [];
  return coursePlan
    .map((item, index) => normalizePlanItem(item, index))
    .filter((item) => getPlanItemKey(item))
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
    .filter(courseMatchesSourceFilter)
    .sort((a, b) => {
      const externalA = isExternalCourseForSelectedFormation(a) ? 1 : 0;
      const externalB = isExternalCourseForSelectedFormation(b) ? 1 : 0;
      if (externalA !== externalB) return externalA - externalB;
      return getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' });
    });
}

function getPlanDurationDays(plan = activeCoursePlan) {
  return plan
    .filter((item) => isStructuralPlanningType(getPlanItemType(item)))
    .reduce((total, item) => total + Math.max(1, toNumber(item.durationDays, 7)), 0);
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
    dom.planningSummaryMeta.textContent = `${formation.formationName || 'Formation liée'} · sélectionnez un cursus existant.`;
    return;
  }

  dom.planningSummaryTitle.textContent = curriculumTitle || `Cursus ${formation.formationName || ''}`.trim();
  dom.planningSummaryMeta.textContent = `${planCount} élément${planCount > 1 ? 's' : ''} · ${durationDays} jour${durationDays > 1 ? 's' : ''} estimé${durationDays > 1 ? 's' : ''} · cursus appliqué à la promotion.`;
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
  replacePlaceholderItemKey = '';
  renderPlanningSummary();
}

function openCurriculumTemplateModal() {
  if (!dom.curriculumTemplateModal) return;
  if (!getSelectedFormation().formationId) {
    setStatus(dom.formStatus, 'Sélectionnez une formation liée avant de choisir un cursus.', 'error');
    return;
  }
  dom.curriculumTemplateModal.classList.add('is-open');
  dom.curriculumTemplateModal.setAttribute('aria-hidden', 'false');
  renderCurriculumTemplateList();
  loadCurriculumTemplates().then(renderCurriculumTemplateList);
}

function closeCurriculumTemplateModal() {
  if (!dom.curriculumTemplateModal) return;
  dom.curriculumTemplateModal.classList.remove('is-open');
  dom.curriculumTemplateModal.setAttribute('aria-hidden', 'true');
}

function getTemplateStatusLabel(status = 'active') {
  if (status === 'draft') return 'Brouillon';
  if (status === 'archived') return 'Archivé';
  return 'Actif';
}

function getTemplateItemsForSave(plan = activeCoursePlan) {
  return normalizeCoursePlan(plan).map((item, index) => {
    const type = getPlanItemType(item);
    const payload = {
      type,
      layer: item.layer || getPlanningLayerKey(type),
      order: index,
      courseId: type === 'real_course' ? (item.courseId || '') : '',
      courseTitle: clean(item.courseTitle || item.title || getPlanningTypeLabel(type), 180),
      title: clean(item.title || item.courseTitle || getPlanningTypeLabel(type), 180),
      courseStatus: clean(item.courseStatus || (type === 'real_course' ? 'Cours' : getPlanningTypeLabel(type)), 80),
      blockTitle: clean(item.blockTitle || '', 120),
      durationDays: Math.max(1, toNumber(item.durationDays, isParallelPlanningType(type) ? getDefaultParallelDurationDays(type) : 7)),
      priorityLevel: ['normal', 'high', 'urgent'].includes(item.priorityLevel) ? item.priorityLevel : 'normal',
      isRequired: item.isRequired !== false,
      isBlockingPrerequisite: item.isBlockingPrerequisite === true,
      isBlocking: item.isBlocking === true || item.isBlockingPrerequisite === true,
      isQualiopiEvidence: item.isQualiopiEvidence === true,
      isLocked: false,
      relatedCourseId: clean(item.relatedCourseId || '', 160),
      relatedCourseTitle: clean(item.relatedCourseTitle || '', 180),
      sourceFormationId: clean(item.sourceFormationId || '', 160),
      sourceFormationName: clean(item.sourceFormationName || '', 180),
      displayContextFormationId: clean(item.displayContextFormationId || '', 160),
      displayContextFormationName: clean(item.displayContextFormationName || '', 180),
      isSharedCourse: item.isSharedCourse === true,
      grantedByCurriculum: item.grantedByCurriculum === true,
      source: 'curriculum-template-v1'
    };

    if (type !== 'real_course') {
      payload.itemId = '';
    }

    return payload;
  });
}

function getPlanItemsFromTemplate(template = {}) {
  const items = Array.isArray(template.items) ? template.items : [];
  return normalizeCoursePlan(items.map((item, index) => {
    const type = getPlanItemType(item);
    const isCourse = type === 'real_course';
    const course = isCourse ? getCourseById(item.courseId || '') : null;
    return {
      ...item,
      itemId: isCourse ? '' : makePlanningItemId(type),
      courseId: isCourse ? (item.courseId || '') : '',
      courseTitle: isCourse
        ? clean(item.courseTitle || getCourseTitle(course || {}), 180)
        : clean(item.courseTitle || item.title || getPlanningTypeLabel(type), 180),
      title: clean(item.title || item.courseTitle || getPlanningTypeLabel(type), 180),
      courseStatus: isCourse ? clean(item.courseStatus || getCourseStatusLabel(course || {}), 80) : clean(item.courseStatus || 'Prévu', 80),
      blockTitle: clean(item.blockTitle || getCourseBlockLabel(course || {}), 120),
      recommendedStartAt: '',
      recommendedEndAt: '',
      deadlineAt: '',
      isLocked: false,
      sourceFormationId: item.sourceFormationId || '',
      sourceFormationName: item.sourceFormationName || '',
      displayContextFormationId: getDisplayContextFormation().displayContextFormationId || item.displayContextFormationId || '',
      displayContextFormationName: getDisplayContextFormation().displayContextFormationName || item.displayContextFormationName || '',
      isSharedCourse: item.isSharedCourse === true,
      grantedByCurriculum: item.grantedByCurriculum === true,
      order: index,
      source: 'curriculum-template-applied-v1'
    };
  }));
}

function renderCurriculumTemplateList() {
  if (!dom.curriculumTemplateList || !dom.curriculumTemplateStatus) return;

  const formation = getSelectedFormation();
  if (!formation.formationId) {
    dom.curriculumTemplateStatus.textContent = 'Sélectionnez une formation liée pour afficher les cursus disponibles.';
    dom.curriculumTemplateList.innerHTML = '<div class="sbi-promotions-empty">Aucune formation liée.</div>';
    return;
  }

  const sameFormation = curriculumTemplates
    .filter((template) => (template.status || 'active') !== 'archived')
    .filter((template) => String(template.formationId || '') === String(formation.formationId || ''))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' }));

  dom.curriculumTemplateStatus.textContent = sameFormation.length
    ? `${sameFormation.length} cursus disponible${sameFormation.length > 1 ? 's' : ''} pour ${formation.formationName || 'cette formation'}.`
    : `Aucun cursus sauvegardé pour ${formation.formationName || 'cette formation'}.`;

  if (!sameFormation.length) {
    dom.curriculumTemplateList.innerHTML = '<div class="sbi-promotions-empty">Aucun cursus n’est encore disponible pour cette formation. Créez-le depuis l’onglet Cursus, puis revenez le sélectionner ici.</div>';
    return;
  }

  dom.curriculumTemplateList.innerHTML = sameFormation.map((template) => {
    const count = Number(template.itemCount || (Array.isArray(template.items) ? template.items.length : 0));
    const duration = Number(template.durationDays || getPlanDurationDays(template.items || []));
    const isActive = template.id === activeCurriculumTemplateId;
    return `
      <article class="sbi-curriculum-template-row ${isActive ? 'is-active-template' : ''}" data-template-id="${escapeHtml(template.id)}">
        <div>
          <strong>${escapeHtml(template.title || 'Cursus sans nom')}</strong>
          <small>
            <span>${escapeHtml(template.formationName || 'Formation liée')}</span>
            <span>${count} élément${count > 1 ? 's' : ''}</span>
            <span>${duration} jour${duration > 1 ? 's' : ''} estimé${duration > 1 ? 's' : ''}</span>
            ${Number(template.sharedItemCount || 0) > 0 ? `<span>${Number(template.sharedItemCount || 0)} transversal${Number(template.sharedItemCount || 0) > 1 ? 's' : ''}</span>` : ''}
            <span>${escapeHtml(getTemplateStatusLabel(template.status || 'active'))}</span>
            ${isActive ? '<span>Cursus actif</span>' : ''}
          </small>
        </div>
        <div class="sbi-curriculum-template-actions">
          <button type="button" data-curriculum-apply="${escapeHtml(template.id)}">Appliquer</button>
          <button type="button" class="is-danger" data-curriculum-delete="${escapeHtml(template.id)}">Supprimer</button>
        </div>
      </article>
    `;
  }).join('');
}

async function loadCurriculumTemplates() {
  try {
    const snap = await getDocs(collection(db, 'curriculumTemplates'));
    curriculumTemplates = [];
    snap.forEach((docSnap) => {
      curriculumTemplates.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });
  } catch (error) {
    console.warn('[SBI Promotions] Cursus non chargés :', error);
    curriculumTemplates = [];
    if (dom.curriculumTemplateStatus) dom.curriculumTemplateStatus.textContent = 'Chargement des cursus impossible.';
  }
}

function getActiveCurriculumTemplate() {
  if (!activeCurriculumTemplateId) return null;
  return curriculumTemplates.find((item) => item.id === activeCurriculumTemplateId) || null;
}

function closeCurriculumSaveModal() {
  if (!dom.curriculumSaveModal) return;
  dom.curriculumSaveModal.classList.remove('is-open');
  dom.curriculumSaveModal.setAttribute('aria-hidden', 'true');
}

function openCurriculumSaveModal() {
  if (!currentAdmin) return;

  const formation = getSelectedFormation();
  if (!formation.formationId) {
    if (dom.planningFooterStatus) dom.planningFooterStatus.textContent = 'Sélectionnez une formation liée avant de sauvegarder un cursus.';
    return;
  }

  const items = getTemplateItemsForSave(activeCoursePlan);
  if (!items.length) {
    if (dom.planningFooterStatus) dom.planningFooterStatus.textContent = 'Ajoutez au moins un élément dans la timeline avant de sauvegarder un cursus.';
    return;
  }

  const activeTemplate = getActiveCurriculumTemplate();
  const defaultTitle = clean(dom.curriculumTitle?.value || activeTemplate?.title || `Cursus ${formation.formationName || ''}`.trim(), 140) || 'Nouveau cursus';

  if (dom.curriculumSaveTitle) dom.curriculumSaveTitle.value = defaultTitle;
  if (dom.curriculumSaveStatus) dom.curriculumSaveStatus.textContent = activeTemplate
    ? `Cursus actif : ${activeTemplate.title || 'sans nom'}. Vous pouvez le mettre à jour ou créer une nouvelle version.`
    : 'Aucun cursus actif chargé. Une nouvelle sauvegarde sera créée.';
  if (dom.curriculumSaveActiveLabel) dom.curriculumSaveActiveLabel.textContent = activeTemplate?.title || 'Aucun cursus actif';
  if (dom.curriculumSaveActive) dom.curriculumSaveActive.disabled = !activeTemplate;

  dom.curriculumSaveModal?.classList.add('is-open');
  dom.curriculumSaveModal?.setAttribute('aria-hidden', 'false');
}

function buildCurriculumTemplateSavePayload(title, formation, items) {
  const sharedItemCount = items.filter((item) => item.isSharedCourse === true).length;
  return {
    title,
    slug: slugify(title),
    formationId: formation.formationId,
    formationName: formation.formationName,
    status: 'active',
    version: 'curriculum-template-v1',
    items,
    itemCount: items.length,
    sharedItemCount,
    durationDays: getPlanDurationDays(items),
    updatedAt: serverTimestamp(),
    updatedBy: currentAdmin.uid,
    updatedByEmail: currentAdmin.email || ''
  };
}

async function saveCurriculumTemplate(mode = 'new') {
  if (!currentAdmin) return;

  const formation = getSelectedFormation();
  const items = getTemplateItemsForSave(activeCoursePlan);
  const title = clean(dom.curriculumSaveTitle?.value || dom.curriculumTitle?.value || '', 140);

  if (!formation.formationId) {
    setStatus(dom.curriculumSaveStatus, 'Sélectionnez une formation liée avant de sauvegarder.', 'error');
    return;
  }

  if (!items.length) {
    setStatus(dom.curriculumSaveStatus, 'Ajoutez au moins un élément dans la timeline.', 'error');
    return;
  }

  if (!title) {
    setStatus(dom.curriculumSaveStatus, 'Donnez un nom au cursus.', 'error');
    return;
  }

  const activeTemplate = getActiveCurriculumTemplate();
  const payload = buildCurriculumTemplateSavePayload(title, formation, items);

  try {
    if (mode === 'active' && activeTemplate?.id) {
      await setDoc(doc(db, 'curriculumTemplates', activeTemplate.id), payload, { merge: true });
      activeCurriculumTemplateId = activeTemplate.id;
      if (dom.planningFooterStatus) dom.planningFooterStatus.textContent = `Cursus « ${title} » mis à jour.`;
    } else {
      const ref = await addDoc(collection(db, 'curriculumTemplates'), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: currentAdmin.uid,
        createdByEmail: currentAdmin.email || ''
      });
      activeCurriculumTemplateId = ref.id;
      if (dom.planningFooterStatus) dom.planningFooterStatus.textContent = `Nouveau cursus « ${title} » sauvegardé.`;
    }

    if (dom.curriculumTitle) dom.curriculumTitle.value = title;
    closeCurriculumSaveModal();
    await loadCurriculumTemplates();
    renderPlanningSummary();
  } catch (error) {
    console.warn('[SBI Promotions] Sauvegarde cursus impossible :', error);
    setStatus(dom.curriculumSaveStatus, 'Sauvegarde du cursus impossible.', 'error');
  }
}

async function deleteCurriculumTemplate(templateId = '') {
  if (!templateId || !currentAdmin) return;
  const template = curriculumTemplates.find((item) => item.id === templateId);
  if (!template) return;

  try {
    await deleteDoc(doc(db, 'curriculumTemplates', templateId));
    if (activeCurriculumTemplateId === templateId) {
      activeCurriculumTemplateId = '';
      if (dom.curriculumTitle?.value === (template.title || '')) dom.curriculumTitle.value = '';
    }
    await loadCurriculumTemplates();
    renderCurriculumTemplateList();
    renderPlanningSummary();
    if (dom.curriculumTemplateStatus) dom.curriculumTemplateStatus.textContent = `Cursus « ${template.title || 'sans nom'} » supprimé.`;
  } catch (error) {
    console.warn('[SBI Promotions] Suppression cursus impossible :', error);
    if (dom.curriculumTemplateStatus) dom.curriculumTemplateStatus.textContent = 'Suppression du cursus impossible.';
  }
}

function applyCurriculumTemplate(templateId = '') {
  const template = curriculumTemplates.find((item) => item.id === templateId);
  if (!template) return;

  activeCurriculumTemplateId = template.id;
  if (dom.curriculumTitle) dom.curriculumTitle.value = template.title || '';
  selectedPlanningItemKey = '';
  replacePlaceholderItemKey = '';
  setActiveCoursePlan(getPlanItemsFromTemplate(template));
  maybeAutoRecalculatePlanningDates();
  closeCurriculumTemplateModal();
  const message = `Cursus « ${template.title || 'sans nom'} » sélectionné. Sauvegardez la promotion pour enregistrer ce choix.`;
  if (dom.planningFooterStatus) {
    dom.planningFooterStatus.textContent = `${message} Les dates sont recalculées depuis la date de début.`;
  }
  setStatus(dom.formStatus, message, 'success');
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

  if (dom.planningCourseSource && dom.planningCourseSource.value !== courseSourceFilter) {
    dom.planningCourseSource.value = courseSourceFilter;
  }

  const replacingItem = replacePlaceholderItemKey
    ? activeCoursePlan.find((item) => getPlanItemKey(item) === replacePlaceholderItemKey && getPlanItemType(item) === 'placeholder_course')
    : null;

  const placedIds = new Set(activeCoursePlan.filter(isCoursePlanItem).map((item) => item.courseId));
  const matchingCourses = getMatchingCoursesForSelectedFormation();
  const available = matchingCourses.filter((course) => !placedIds.has(course.id));
  const sourceLabel = getCourseSourceFilterLabel();

  dom.coursePlanStatus.textContent = replacingItem
    ? `Mode remplacement actif · choisissez un cours ${sourceLabel} pour remplacer « ${replacingItem.courseTitle || replacingItem.title || 'Cours futur'} ».`
    : `${matchingCourses.length} cours disponible${matchingCourses.length > 1 ? 's' : ''} · filtre ${sourceLabel} · ${activeCoursePlan.length} placé${activeCoursePlan.length > 1 ? 's' : ''}.`;

  if (!matchingCourses.length) {
    dom.planningAvailableCourses.innerHTML = `<div class="sbi-promotions-empty">Aucun cours trouvé pour le filtre « ${escapeHtml(sourceLabel)} ».</div>`;
    return;
  }

  if (!available.length) {
    dom.planningAvailableCourses.innerHTML = replacingItem
      ? '<div class="sbi-promotions-empty">Aucun cours disponible pour remplacer ce cours futur. Tous les cours de ce filtre sont déjà placés.</div>'
      : '<div class="sbi-promotions-empty">Tous les cours de ce filtre sont déjà dans la timeline.</div>';
    return;
  }

  dom.planningAvailableCourses.innerHTML = available.map((course) => {
    const title = getCourseTitle(course);
    const block = getCourseBlockLabel(course);
    const status = getCourseStatusLabel(course);
    const duration = getDefaultDurationDays(course);
    const source = getCourseSourceInfo(course);
    const external = isExternalCourseForSelectedFormation(course);
    const isShared = source.isSharedCourse || external;
    const actionLabel = replacingItem ? 'Remplacer' : 'Ajouter';
    const dataAttr = replacingItem ? 'data-planning-replace-course' : 'data-planning-add-course';
    const sourceText = source.sourceFormationName || (source.isSharedCourse ? 'Transversal' : 'Source non renseignée');
    return `
      <article class="sbi-planning-course-card ${replacingItem ? 'is-replace-target' : ''} ${isShared ? 'is-shared-course' : ''}" data-course-id="${escapeHtml(course.id)}">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(status)}${block ? ` · Bloc : ${escapeHtml(block)}` : ''} · ${duration} j estimés</small>
          <small class="sbi-planning-source-line">
            <span>Source : ${escapeHtml(sourceText)}</span>
            ${external ? `<span>Affiché dans : ${escapeHtml(formation.formationName || 'promotion actuelle')}</span>` : ''}
            ${isShared ? '<span>Accès via cursus</span>' : ''}
          </small>
        </div>
        <button type="button" ${dataAttr}="${escapeHtml(course.id)}">${actionLabel}</button>
      </article>
    `;
  }).join('');
}

function getPlanningItemDatesLabel(item = {}) {
  if (item.recommendedStartAt || item.recommendedEndAt) {
    return `Auto : ${formatDate(item.recommendedStartAt, 'Début ?')} → ${formatDate(item.recommendedEndAt, 'Fin ?')}`;
  }
  if (isParallelPlanningType(getPlanItemType(item))) return 'À placer en parallèle';
  return 'Dates auto à calculer';
}

function renderPlanningItemRow(item, index, layerItems = []) {
  const key = getPlanItemKey(item);
  const selected = key === selectedPlanningItemKey;
  const type = getPlanItemType(item);
  const typeLabel = getPlanningTypeLabel(type);
  const layer = getPlanningLayer(type);
  const block = item.blockTitle ? `<span>Bloc : ${escapeHtml(item.blockTitle)}</span>` : '';
  const related = item.relatedCourseTitle ? `<span>Lié à : ${escapeHtml(item.relatedCourseTitle)}</span>` : '';
  const title = item.courseTitle || item.title || typeLabel;
  const sourceBadge = item.isSharedCourse && item.sourceFormationName
    ? `<span>Source : ${escapeHtml(item.sourceFormationName)}</span>`
    : '';
  const contextBadge = item.isSharedCourse && item.displayContextFormationName
    ? `<span>Contexte : ${escapeHtml(item.displayContextFormationName)}</span>`
    : '';
  const laneIndex = layerItems.findIndex((entry) => getPlanItemKey(entry) === key);
  const canMoveUp = index > 0;
  const canMoveDown = index < activeCoursePlan.length - 1;

  return `
    <article class="sbi-planning-timeline-row is-${escapeHtml(type)} is-layer-${escapeHtml(layer.key)} ${selected ? 'is-selected' : ''} ${item.isSharedCourse ? 'is-shared-course' : ''} ${replacePlaceholderItemKey ? 'is-replace-mode' : ''} ${replacePlaceholderItemKey === key ? 'is-replace-source' : ''}" draggable="true" data-plan-row data-plan-key="${escapeHtml(key)}" data-plan-layer="${escapeHtml(layer.key)}">
      <button type="button" class="sbi-planning-order-badge" data-plan-select="${escapeHtml(key)}">${index + 1}</button>
      <div class="sbi-planning-timeline-content" data-plan-select="${escapeHtml(key)}">
        <strong>${escapeHtml(title)}</strong>
        <small>
          <span>${escapeHtml(typeLabel)}</span>
          <span>${escapeHtml(getPlanningItemDatesLabel(item))}</span>
          <span>${Math.max(1, toNumber(item.durationDays, isParallelPlanningType(type) ? getDefaultParallelDurationDays(type) : 7))} j</span>
          <span>${escapeHtml(getPriorityLabel(item.priorityLevel))}</span>
          ${block}
          ${related}
          ${sourceBadge}
          ${contextBadge}
          ${item.grantedByCurriculum ? '<span>Accès cursus</span>' : ''}
          ${item.isLocked ? '<span>Dates verrouillées</span>' : ''}
          ${item.isBlocking || item.isBlockingPrerequisite ? '<span>Bloquant</span>' : ''}
          ${item.isQualiopiEvidence ? '<span>Preuve Qualiopi</span>' : ''}
        </small>
      </div>
      <div class="sbi-planning-timeline-actions">
        ${type === 'placeholder_course' ? `<button type="button" data-plan-replace="${escapeHtml(key)}" class="is-replace">Remplacer par...</button>` : ''}
        <button type="button" data-plan-move="up" data-plan-key="${escapeHtml(key)}" ${!canMoveUp ? 'disabled' : ''}>↑</button>
        <button type="button" data-plan-move="down" data-plan-key="${escapeHtml(key)}" ${!canMoveDown ? 'disabled' : ''}>↓</button>
        <button type="button" data-plan-remove="${escapeHtml(key)}" class="is-danger">Retirer</button>
      </div>
    </article>
  `;
}

function renderPlanningTimeline() {
  if (!dom.planningTimelineList) return;

  if (!activeCoursePlan.length) {
    dom.planningTimelineList.innerHTML = '<div class="sbi-promotions-empty">Ajoutez des cours, cours futurs, marges ou événements parallèles pour construire la timeline.</div>';
    return;
  }

  dom.planningTimelineList.innerHTML = PLANNING_LAYERS.map((layer) => {
    const layerItems = activeCoursePlan.filter((item) => layer.types.includes(getPlanItemType(item)));
    const rows = layerItems.length
      ? layerItems.map((item) => renderPlanningItemRow(item, activeCoursePlan.findIndex((entry) => getPlanItemKey(entry) === getPlanItemKey(item)), layerItems)).join('')
      : `<div class="sbi-planning-layer-empty">Aucun élément sur cette piste.</div>`;

    return `
      <section class="sbi-planning-layer" data-planning-layer="${escapeHtml(layer.key)}">
        <div class="sbi-planning-layer-head">
          <div>
            <strong>${escapeHtml(layer.label)}</strong>
            <p>${escapeHtml(layer.hint)}</p>
          </div>
          <span>${layerItems.length}</span>
        </div>
        <div class="sbi-planning-layer-track">
          ${rows}
        </div>
      </section>
    `;
  }).join('');
}

function renderPlanningInspector() {
  if (!dom.planningInspector) return;
  const item = activeCoursePlan.find((entry) => getPlanItemKey(entry) === selectedPlanningItemKey) || null;

  if (!item) {
    dom.planningInspector.innerHTML = '<div class="sbi-promotions-empty">Sélectionnez un élément dans la timeline.</div>';
    return;
  }

  const key = getPlanItemKey(item);
  const type = getPlanItemType(item);
  const typeLabel = getPlanningTypeLabel(type);
  const layer = getPlanningLayer(type);
  const isCourse = type === 'real_course';
  const isParallel = isParallelPlanningType(type);
  const isMargin = ['buffer_period', 'revision_period', 'catchup_period'].includes(type);
  const relatedOptions = activeCoursePlan
    .filter((entry) => ['real_course', 'placeholder_course'].includes(getPlanItemType(entry)))
    .map((entry) => {
      const entryKey = getPlanItemKey(entry);
      const label = entry.courseTitle || entry.title || getPlanningTypeLabel(getPlanItemType(entry));
      return `<option value="${escapeHtml(entry.courseId || entryKey)}" ${item.relatedCourseId === (entry.courseId || entryKey) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

  dom.planningInspector.innerHTML = `
    <div class="sbi-planning-inspector-card" data-inspector-key="${escapeHtml(key)}">
      <h5>${escapeHtml(item.courseTitle || item.title || typeLabel)}</h5>
      <p>${escapeHtml(layer.label)} · ${escapeHtml(isCourse ? (item.blockTitle || 'Aucun bloc assigné') : typeLabel)}</p>

      ${isCourse ? `
        <div class="sbi-planning-context-box">
          <span>Source : ${escapeHtml(item.sourceFormationName || 'Formation source non renseignée')}</span>
          <span>Affichage : ${escapeHtml(item.displayContextFormationName || 'Formation de la promotion')}</span>
          ${item.isSharedCourse ? '<span>Cours mutualisé / accès via cursus</span>' : '<span>Cours de la formation liée</span>'}
        </div>
      ` : ''}

      ${isCourse ? '' : `
        <label>Titre</label>
        <input type="text" maxlength="180" data-plan-field="courseTitle" value="${escapeHtml(item.courseTitle || item.title || '')}">
      `}

      ${isMargin ? `
        <label>Type de marge</label>
        <select data-plan-field="type">
          ${['buffer_period', 'revision_period', 'catchup_period'].map((level) => `<option value="${level}" ${type === level ? 'selected' : ''}>${getPlanningTypeLabel(level)}</option>`).join('')}
        </select>
      ` : ''}

      ${isParallel ? `
        <label>Type d’élément parallèle</label>
        <select data-plan-field="type">
          ${['assignment', 'exam', 'evaluation', 'live_session', 'workshop'].map((level) => `<option value="${level}" ${type === level ? 'selected' : ''}>${getPlanningTypeLabel(level)}</option>`).join('')}
        </select>

        <label>Cours lié</label>
        <select data-plan-field="relatedCourseId">
          <option value="">Aucun lien direct</option>
          ${relatedOptions}
        </select>
      ` : ''}

      <label>${isParallel ? 'Durée / fenêtre estimée en jours' : 'Durée estimée en jours'}</label>
      <input type="number" min="1" max="365" data-plan-field="durationDays" value="${escapeHtml(item.durationDays || (isParallel ? getDefaultParallelDurationDays(type) : 7))}">

      <div class="sbi-planning-auto-date-note">
        ${isParallel
          ? 'Cet élément est placé sur sa propre piste. Il se superpose au planning principal et ne décale pas les cours.'
          : 'Les dates sont calculées automatiquement depuis la date de début de la promotion. Activez le verrouillage seulement pour ajuster manuellement un élément précis.'}
      </div>

      <label>Début calculé</label>
      <input type="date" data-plan-field="recommendedStartAt" value="${escapeHtml(item.recommendedStartAt || '')}" ${item.isLocked ? '' : 'disabled'}>

      <label>Fin calculée</label>
      <input type="date" data-plan-field="recommendedEndAt" value="${escapeHtml(item.recommendedEndAt || '')}" ${item.isLocked ? '' : 'disabled'}>

      <label>${isParallel ? 'Échéance / date clé' : 'Deadline calculée'}</label>
      <input type="date" data-plan-field="deadlineAt" value="${escapeHtml(item.deadlineAt || item.dueAt || '')}" ${item.isLocked ? '' : 'disabled'}>

      <label>Priorité</label>
      <select data-plan-field="priorityLevel">
        ${['normal', 'high', 'urgent'].map((level) => `<option value="${level}" ${item.priorityLevel === level ? 'selected' : ''}>${getPriorityLabel(level)}</option>`).join('')}
      </select>

      <label class="sbi-planning-checkline">
        <input type="checkbox" data-plan-field="isRequired" ${item.isRequired !== false ? 'checked' : ''}>
        <span>${isCourse ? 'Cours obligatoire dans le planning' : 'Élément obligatoire dans le planning'}</span>
      </label>

      <label class="sbi-planning-checkline">
        <input type="checkbox" data-plan-field="isLocked" ${item.isLocked ? 'checked' : ''}>
        <span>Verrouiller les dates au recalcul</span>
      </label>

      ${isCourse || type === 'placeholder_course' ? `
        <label class="sbi-planning-checkline">
          <input type="checkbox" data-plan-field="isBlockingPrerequisite" ${item.isBlockingPrerequisite ? 'checked' : ''}>
          <span>Prérequis bloquant</span>
        </label>
      ` : ''}

      ${isParallel ? `
        <label class="sbi-planning-checkline">
          <input type="checkbox" data-plan-field="isBlocking" ${item.isBlocking ? 'checked' : ''}>
          <span>Événement bloquant</span>
        </label>
        <label class="sbi-planning-checkline">
          <input type="checkbox" data-plan-field="isQualiopiEvidence" ${item.isQualiopiEvidence ? 'checked' : ''}>
          <span>Preuve Qualiopi potentielle</span>
        </label>
      ` : ''}
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
      ? `${activeCoursePlan.length} élément${activeCoursePlan.length > 1 ? 's' : ''} · ${duration} jour${duration > 1 ? 's' : ''} structurel${duration > 1 ? 's' : ''}. Les pistes parallèles ne décalent pas les cours.`
      : 'Ajoutez des cours, cours futurs, marges ou événements parallèles. Les dates sont calculées automatiquement avec la promotion.';
  }
}

function addPlaceholderToActivePlan() {
  const item = normalizePlanItem({
    type: 'placeholder_course',
    itemId: makePlanningItemId('placeholder'),
    courseTitle: 'Cours futur à créer',
    title: 'Cours futur à créer',
    courseStatus: 'Prévu',
    durationDays: 7,
    priorityLevel: 'normal',
    isRequired: true,
    isLocked: false,
    isBlockingPrerequisite: false,
    order: activeCoursePlan.length,
    source: 'promotion-planning-placeholder-v1'
  }, activeCoursePlan.length);
  activeCoursePlan = [...activeCoursePlan, item].map((entry, index) => ({ ...entry, order: index }));
  selectedPlanningItemKey = getPlanItemKey(item);
  replacePlaceholderItemKey = '';
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
}

function addBufferToActivePlan(type = 'buffer_period') {
  const safeType = ['buffer_period', 'revision_period', 'catchup_period'].includes(type) ? type : 'buffer_period';
  const item = normalizePlanItem({
    type: safeType,
    itemId: makePlanningItemId(safeType.replace('_period', '')),
    courseTitle: getPlanningTypeLabel(safeType),
    title: getPlanningTypeLabel(safeType),
    courseStatus: 'Marge',
    durationDays: safeType === 'revision_period' ? 5 : 7,
    priorityLevel: 'normal',
    isRequired: false,
    isLocked: false,
    isBlockingPrerequisite: false,
    order: activeCoursePlan.length,
    source: 'promotion-planning-buffer-v1'
  }, activeCoursePlan.length);
  activeCoursePlan = [...activeCoursePlan, item].map((entry, index) => ({ ...entry, order: index }));
  selectedPlanningItemKey = getPlanItemKey(item);
  replacePlaceholderItemKey = '';
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
}

function addParallelItemToActivePlan(type = 'assignment') {
  const safeType = PLANNING_PARALLEL_TYPES.includes(type) ? type : 'assignment';
  const title = safeType === 'assignment'
    ? 'Nouveau devoir'
    : safeType === 'exam'
      ? 'Nouvel examen'
      : safeType === 'evaluation'
        ? 'Nouvelle évaluation'
        : safeType === 'live_session'
          ? 'Nouveau live'
          : 'Nouvel atelier';
  const firstRelated = activeCoursePlan.find((item) => ['real_course', 'placeholder_course'].includes(getPlanItemType(item))) || null;
  const item = normalizePlanItem({
    type: safeType,
    itemId: makePlanningItemId(safeType),
    courseTitle: title,
    title,
    courseStatus: getPlanningTypeLabel(safeType),
    durationDays: getDefaultParallelDurationDays(safeType),
    relatedCourseId: firstRelated ? (firstRelated.courseId || getPlanItemKey(firstRelated)) : '',
    relatedCourseTitle: firstRelated ? (firstRelated.courseTitle || firstRelated.title || '') : '',
    priorityLevel: safeType === 'exam' || safeType === 'evaluation' ? 'high' : 'normal',
    isRequired: safeType !== 'live_session' && safeType !== 'workshop',
    isBlocking: safeType === 'exam' || safeType === 'evaluation',
    isQualiopiEvidence: safeType === 'exam' || safeType === 'evaluation',
    isLocked: false,
    order: activeCoursePlan.length,
    source: 'promotion-planning-multilayer-v1'
  }, activeCoursePlan.length);
  activeCoursePlan = [...activeCoursePlan, item].map((entry, index) => ({ ...entry, order: index }));
  selectedPlanningItemKey = getPlanItemKey(item);
  replacePlaceholderItemKey = '';
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
}

function maybeAutoRecalculatePlanningDates() {
  if (!dom.startDate?.value) return false;
  return recalculatePlanningDates({ silent: true });
}

function replacePlaceholderWithCourse(placeholderKey = '', courseId = '') {
  const course = getCourseById(courseId);
  if (!placeholderKey || !course || activeCoursePlan.some((item) => item.courseId === courseId)) return;

  activeCoursePlan = activeCoursePlan.map((item, index) => {
    if (getPlanItemKey(item) !== placeholderKey) return item;
    return normalizePlanItem({
      type: 'real_course',
      courseId,
      courseTitle: getCourseTitle(course),
      courseStatus: getCourseStatusLabel(course),
      blockTitle: getCourseBlockLabel(course),
      ...buildCourseContextPayload(course, item),
      durationDays: item.durationDays || getDefaultDurationDays(course),
      recommendedStartAt: item.recommendedStartAt || '',
      recommendedEndAt: item.recommendedEndAt || '',
      deadlineAt: item.deadlineAt || '',
      priorityLevel: item.priorityLevel || course.priorityLevel || 'normal',
      isRequired: item.isRequired !== false,
      isLocked: item.isLocked === true,
      isBlockingPrerequisite: item.isBlockingPrerequisite === true,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      source: 'promotion-planning-placeholder-replaced-v1'
    }, index);
  }).map((entry, index) => ({ ...entry, order: index }));

  selectedPlanningItemKey = courseId;
  replacePlaceholderItemKey = '';
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
}

function startPlaceholderReplacement(key = '') {
  const item = activeCoursePlan.find((entry) => getPlanItemKey(entry) === key);
  if (!item || getPlanItemType(item) !== 'placeholder_course') return;
  if (replacePlaceholderItemKey === key) {
    cancelPlaceholderReplacement();
    return;
  }
  replacePlaceholderItemKey = key;
  selectedPlanningItemKey = key;
  renderPlanningOverlay();
}

function cancelPlaceholderReplacement() {
  replacePlaceholderItemKey = '';
  renderPlanningOverlay();
}

function addCourseToActivePlan(courseId = '') {
  const course = getCourseById(courseId);
  if (!course || activeCoursePlan.some((item) => item.courseId === courseId)) return;
  const item = normalizePlanItem({
    type: 'real_course',
    courseId,
    courseTitle: getCourseTitle(course),
    courseStatus: getCourseStatusLabel(course),
    blockTitle: getCourseBlockLabel(course),
    ...buildCourseContextPayload(course),
    durationDays: getDefaultDurationDays(course),
    priorityLevel: course.priorityLevel || 'normal',
    order: activeCoursePlan.length,
    source: 'promotion-course-plan-overlay-v1'
  }, activeCoursePlan.length);
  activeCoursePlan = [...activeCoursePlan, item].map((entry, index) => ({ ...entry, order: index }));
  selectedPlanningItemKey = getPlanItemKey(item);
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
}

function removeCourseFromActivePlan(key = '') {
  activeCoursePlan = activeCoursePlan.filter((item) => getPlanItemKey(item) !== key)
    .map((item, index) => ({ ...item, order: index }));
  if (selectedPlanningItemKey === key) selectedPlanningItemKey = activeCoursePlan[0] ? getPlanItemKey(activeCoursePlan[0]) : '';
  if (replacePlaceholderItemKey === key) replacePlaceholderItemKey = '';
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
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
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
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
  if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
}

function updateSelectedPlanItem(field = '', value) {
  if (!selectedPlanningItemKey || !field) return;
  activeCoursePlan = activeCoursePlan.map((item) => {
    if (getPlanItemKey(item) !== selectedPlanningItemKey) return item;
    const next = { ...item };
    if (['isRequired', 'isLocked', 'isBlockingPrerequisite', 'isBlocking', 'isQualiopiEvidence'].includes(field)) {
      next[field] = Boolean(value);
    } else if (field === 'durationDays') {
      next.durationDays = Math.max(1, Math.round(toNumber(value, item.durationDays || 7)));
    } else if (field === 'courseTitle') {
      next.courseTitle = clean(value, 180) || getPlanningTypeLabel(getPlanItemType(next));
      next.title = next.courseTitle;
    } else if (field === 'relatedCourseId') {
      next.relatedCourseId = clean(value, 160);
      const related = activeCoursePlan.find((entry) => (entry.courseId || getPlanItemKey(entry)) === next.relatedCourseId) || null;
      next.relatedCourseTitle = related ? (related.courseTitle || related.title || '') : '';
    } else if (field === 'type') {
      const previousType = getPlanItemType(next);
      next.type = [...PLANNING_STRUCTURAL_TYPES, ...PLANNING_PARALLEL_TYPES].includes(value) ? value : previousType;
      next.layer = getPlanningLayerKey(next.type);
      if (!isCoursePlanItem(next) && (!next.courseTitle || next.courseTitle === getPlanningTypeLabel(previousType))) {
        next.courseTitle = getPlanningTypeLabel(next.type);
        next.title = next.courseTitle;
      }
    } else {
      next[field] = clean(value, 180);
    }
    return next;
  });
  if (['recommendedStartAt', 'recommendedEndAt', 'deadlineAt'].includes(field)) {
    renderPlanningOverlay();
    return;
  }
  if (['durationDays', 'isLocked', 'relatedCourseId', 'type'].includes(field)) {
    if (!maybeAutoRecalculatePlanningDates()) renderPlanningOverlay();
    return;
  }
  renderPlanningOverlay();
}

function addDaysToDateString(dateString = '', days = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return '';
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function recalculatePlanningDates(options = {}) {
  const silent = options?.silent === true;
  const baseDate = dom.startDate?.value || '';
  if (!baseDate) {
    if (!silent && dom.planningFooterStatus) dom.planningFooterStatus.textContent = 'Ajoutez une date de début à la promotion avant le recalcul.';
    return false;
  }

  let cursor = baseDate;
  const structuralDateMap = new Map();
  const structural = activeCoursePlan
    .filter((item) => isStructuralPlanningType(getPlanItemType(item)))
    .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0));

  const recalculatedStructural = structural.map((item) => {
    const key = getPlanItemKey(item);
    if (item.isLocked && item.recommendedStartAt && item.recommendedEndAt) {
      cursor = addDaysToDateString(item.recommendedEndAt, 1) || cursor;
      structuralDateMap.set(key, item);
      if (item.courseId) structuralDateMap.set(item.courseId, item);
      return item;
    }

    const duration = Math.max(1, toNumber(item.durationDays, 7));
    const start = cursor;
    const end = addDaysToDateString(start, duration - 1) || start;
    cursor = addDaysToDateString(end, 1) || cursor;

    const next = {
      ...item,
      recommendedStartAt: start,
      recommendedEndAt: end,
      deadlineAt: item.deadlineAt || end,
      dueAt: item.dueAt || item.deadlineAt || end
    };
    structuralDateMap.set(key, next);
    if (next.courseId) structuralDateMap.set(next.courseId, next);
    return next;
  });

  const structuralByKey = new Map(recalculatedStructural.map((item) => [getPlanItemKey(item), item]));

  activeCoursePlan = activeCoursePlan.map((item) => {
    const key = getPlanItemKey(item);
    if (structuralByKey.has(key)) return structuralByKey.get(key);

    if (!isParallelPlanningType(getPlanItemType(item))) return item;
    if (item.isLocked && item.recommendedStartAt && item.recommendedEndAt) return item;

    const related = item.relatedCourseId ? structuralDateMap.get(item.relatedCourseId) : null;
    const start = related?.recommendedStartAt || baseDate;
    const duration = Math.max(1, toNumber(item.durationDays, getDefaultParallelDurationDays(getPlanItemType(item))));
    const end = addDaysToDateString(start, duration - 1) || start;
    const deadline = related?.recommendedEndAt || end;

    return {
      ...item,
      relatedCourseTitle: related ? (related.courseTitle || related.title || item.relatedCourseTitle || '') : item.relatedCourseTitle || '',
      recommendedStartAt: start,
      recommendedEndAt: end,
      deadlineAt: item.deadlineAt || item.dueAt || deadline,
      dueAt: item.dueAt || item.deadlineAt || deadline
    };
  });

  renderPlanningOverlay();
  return true;
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
  replacePlaceholderItemKey = '';
  activeCurriculumTemplateId = '';
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
  replacePlaceholderItemKey = '';
  activeCurriculumTemplateId = promotion.curriculumTemplateId || '';
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
    curriculumTemplateId: activeCurriculumTemplateId || '',
    coursePlan,
    coursePlanVersion: 'promotion-course-plan-multilayer-v1',
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
            ${Number(promotion.coursePlanCount || 0) > 0 ? `<span class="sbi-promotions-pill">${Number(promotion.coursePlanCount || 0)} élément planning${Number(promotion.coursePlanCount || 0) > 1 ? 's' : ''}</span>` : ''}
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
        <strong>${escapeHtml(getStudentName(student))}${renderCompletenessBadge(student, { uid: student.id })}</strong>
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
    loadFormations().then(loadCoursesForPlan).then(loadCurriculumTemplates);
    startPromotionsSnapshot();
    if (activeRosterPromotionId) loadPromotionStudents(activeRosterPromotionId);
  });
  dom.rosterRefresh?.addEventListener('click', () => loadPromotionStudents(dom.rosterSelect?.value || activeRosterPromotionId));
  dom.rosterSelect?.addEventListener('change', () => loadPromotionStudents(dom.rosterSelect.value));
  dom.rosterSearch?.addEventListener('input', renderRosterStudents);
  dom.formation?.addEventListener('change', () => {
    selectedPlanningItemKey = '';
    replacePlaceholderItemKey = '';
    courseSourceFilter = 'linked';
    if (dom.planningCourseSource) dom.planningCourseSource.value = 'linked';
    setActiveCoursePlan([]);
  });
  dom.startDate?.addEventListener('change', () => {
    if (!activeCoursePlan.length) return;
    maybeAutoRecalculatePlanningDates();
  });
  dom.planningCourseSource?.addEventListener('change', () => {
    courseSourceFilter = ['linked', 'shared', 'other', 'all'].includes(dom.planningCourseSource.value) ? dom.planningCourseSource.value : 'linked';
    renderPlanningOverlay();
  });
  dom.planningOpen?.addEventListener('click', openCurriculumTemplateModal);
  dom.curriculumLoad?.addEventListener('click', openCurriculumTemplateModal);
  dom.curriculumSave?.addEventListener('click', openCurriculumSaveModal);
  dom.planningApply?.addEventListener('click', closePlanningOverlay);
  dom.planningOverlay?.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-planning-close]')) closePlanningOverlay();
    if (event.target.closest?.('[data-curriculum-modal-close]')) closeCurriculumTemplateModal();
    if (event.target.closest?.('[data-curriculum-save-modal-close]')) closeCurriculumSaveModal();

    const saveActive = event.target.closest?.('[data-curriculum-save-active]');
    if (saveActive) {
      saveCurriculumTemplate('active');
      return;
    }

    const saveNew = event.target.closest?.('[data-curriculum-save-new]');
    if (saveNew) {
      saveCurriculumTemplate('new');
      return;
    }

    const deleteTemplate = event.target.closest?.('[data-curriculum-delete]');
    if (deleteTemplate) {
      if (deleteTemplate.dataset.confirmDelete === 'true') {
        deleteCurriculumTemplate(deleteTemplate.dataset.curriculumDelete || '');
      } else {
        deleteTemplate.dataset.confirmDelete = 'true';
        deleteTemplate.textContent = 'Confirmer ?';
        setTimeout(() => {
          if (!deleteTemplate.isConnected) return;
          deleteTemplate.dataset.confirmDelete = '';
          deleteTemplate.textContent = 'Supprimer';
        }, 2600);
      }
      return;
    }

    const applyTemplate = event.target.closest?.('[data-curriculum-apply]');
    if (applyTemplate) applyCurriculumTemplate(applyTemplate.dataset.curriculumApply || '');
  });

  dom.curriculumTemplateModal?.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-curriculum-modal-close]')) {
      closeCurriculumTemplateModal();
      return;
    }

    const deleteTemplate = event.target.closest?.('[data-curriculum-delete]');
    if (deleteTemplate) {
      if (deleteTemplate.dataset.confirmDelete === 'true') {
        deleteCurriculumTemplate(deleteTemplate.dataset.curriculumDelete || '');
      } else {
        deleteTemplate.dataset.confirmDelete = 'true';
        deleteTemplate.textContent = 'Confirmer ?';
        setTimeout(() => {
          if (!deleteTemplate.isConnected) return;
          deleteTemplate.dataset.confirmDelete = '';
          deleteTemplate.textContent = 'Supprimer';
        }, 2600);
      }
      return;
    }

    const applyTemplate = event.target.closest?.('[data-curriculum-apply]');
    if (applyTemplate) applyCurriculumTemplate(applyTemplate.dataset.curriculumApply || '');
  });
  dom.planningAutoDates?.addEventListener('click', recalculatePlanningDates);
  document.getElementById('promotion-planning-add-placeholder-btn')?.addEventListener('click', addPlaceholderToActivePlan);
  document.getElementById('promotion-planning-add-buffer-btn')?.addEventListener('click', () => addBufferToActivePlan('buffer_period'));
  document.getElementById('promotion-planning-add-assignment-btn')?.addEventListener('click', () => addParallelItemToActivePlan('assignment'));
  document.getElementById('promotion-planning-add-exam-btn')?.addEventListener('click', () => addParallelItemToActivePlan('exam'));
  document.getElementById('promotion-planning-add-live-btn')?.addEventListener('click', () => addParallelItemToActivePlan('live_session'));
  dom.planningAvailableCourses?.addEventListener('click', (event) => {
    const replaceButton = event.target.closest?.('[data-planning-replace-course]');
    if (replaceButton) {
      replacePlaceholderWithCourse(replacePlaceholderItemKey, replaceButton.dataset.planningReplaceCourse || '');
      return;
    }

    const button = event.target.closest?.('[data-planning-add-course]');
    if (!button) return;
    addCourseToActivePlan(button.dataset.planningAddCourse || '');
  });
  dom.planningTimelineList?.addEventListener('click', (event) => {
    const select = event.target.closest?.('[data-plan-select]');
    const move = event.target.closest?.('[data-plan-move]');
    const remove = event.target.closest?.('[data-plan-remove]');
    const replace = event.target.closest?.('[data-plan-replace]');

    if (replace) {
      startPlaceholderReplacement(replace.dataset.planReplace || '');
      return;
    }

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
  const view = document.getElementById('view-promotions');
  if (!view) return () => {};

  // Déjà monté sur CE noeud DOM (double appel : auto-montage à l'import + appel
  // explicite par la route PJAX sur une vue fraîche) : ne pas re-binder.
  if (mounted && mountedView === view) return window.SBI_ADMIN_PROMOTIONS_UNMOUNT || (() => {});

  // Nouveau noeud (retour via PJAX après un chargement standalone / F5, sans cleanup
  // shell enregistré) ou premier montage : on repart propre, en coupant les listeners
  // (auth + snapshot promotions) restés actifs d'un montage précédent.
  unsubscribeAuth?.();
  unsubscribePromotions?.();
  unsubscribePromotions = null;

  mounted = true;
  mountedView = view;
  injectCompletenessBadgeStyles();
  cacheDom();
  bindEvents();
  resetForm();
  renderRosterStudents();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await loadFormations();
      await loadCoursesForPlan();
      await loadCurriculumTemplates();
      startPromotionsSnapshot();
    } catch (error) {
      console.warn('[SBI Promotions] Accès refusé :', error);
      showUnauthorized(error?.message || 'Accès réservé aux administrateurs.');
    }
  });

  const cleanup = () => {
    mounted = false;
    mountedView = null;
    closeCurriculumTemplateModal();
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
