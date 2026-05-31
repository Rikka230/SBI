/**
 * SBI 8.0P.167.201
 * Page Cursus dédiée : timeline horizontale multi-pistes.
 *
 * Correctif noyau verrouillage :
 * - verrouillé = impossible à déplacer ;
 * - déverrouillé = déplaçable sans retour automatique en S1 ;
 * - déplacer un bloc ne le reverrouille jamais automatiquement.
 * - les petits cours peuvent etre stackes sur une meme semaine.
 * - un nouveau cours futur apres selection d'un stack cherche la prochaine place libre.
 * - la saisie texte de l'inspecteur ne reconstruit plus tout le panneau.
 * - les lives portent une ebauche liveTracking pour la future planification prof.
 */

import { auth, db } from '/js/firebase-init.js';
import { isSbiAdminLike } from '/js/sbi-permissions.js?v=8.0P.167.44';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let mounted = false;
let mountedView = null;
let unsubscribeAuth = null;
let currentAdmin = null;
let formations = [];
let courses = [];
let templates = [];
let timelineItems = [];
let selectedItemId = '';
let activeTemplateId = '';
let activeToolFilter = 'all';
let pendingDeleteTemplateId = '';
let zoomLevel = 1;
let activeStackWeek = -1;

const STRUCTURAL_TYPES = new Set(['course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period']);
const COURSE_TRACK_TYPES = new Set(['course', 'placeholder_course']);
const PARALLEL_TYPES = new Set(['assignment', 'exam', 'evaluation', 'live_session', 'workshop']);

const TRACKS = [
  { id: 'courses', label: 'Cours', sub: 'Cours réels et futurs', icon: '▦', types: ['course', 'placeholder_course'] },
  { id: 'assignments', label: 'Devoirs / livrables', sub: 'Travaux à remettre', icon: '▣', types: ['assignment'] },
  { id: 'exams', label: 'Examens / évaluations', sub: 'Évaluations et validations', icon: '◆', types: ['exam', 'evaluation'] },
  { id: 'lives', label: 'Lives / ateliers', sub: 'Sessions synchrones', icon: '◉', types: ['live_session', 'workshop'] },
  { id: 'margins', label: 'Marges / révisions', sub: 'Tampons pédagogiques', icon: '◎', types: ['buffer_period', 'revision_period', 'catchup_period'] }
];

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

function clean(value = '', max = 220) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slugify(value = '') {
  return clean(value, 160)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || `cursus-${Date.now()}`;
}

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 180)).filter(Boolean);
  if (typeof value === 'string') return clean(value, 180) ? [clean(value, 180)] : [];
  return [];
}

function uid(prefix = 'item') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 8.0P.167 (T3) : classification Obligatoire / Optionnel unifiée.
// Mêmes champs que isExplicitOptional() de admin-cursus-tool-filters.js, afin que
// l'affichage (renderToolList) et le filtre/compteur (tool-filters) soient cohérents
// quel que soit le filtre actif.
function isCourseExplicitlyOptional(course = {}) {
  const stringFields = [
    course.requirement,
    course.requirementLevel,
    course.requiredLevel,
    course.obligationLevel,
    course.courseRequirement,
    course.moduleRequirement,
    course.typeRequirement,
    course.statusRequirement,
    course.importance
  ].map((value) => normalizeSearch(value));

  return course.isRequired === false
    || course.required === false
    || course.mandatory === false
    || course.obligatoire === false
    || course.isOptional === true
    || course.optional === true
    || stringFields.some((value) => value.includes('optional') || value.includes('optionnel'));
}

function setStatus(message = '', tone = 'muted') {
  if (!dom.saveStatus) return;
  dom.saveStatus.textContent = message;
  dom.saveStatus.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function cacheDom() {
  dom.root = $('view-cursus');
  dom.app = dom.root?.querySelector('.sbi-cursus-app');
  dom.formation = $('cursus-formation-select');
  dom.template = $('cursus-template-select');
  dom.title = $('cursus-title-input');
  dom.activeStatus = $('cursus-active-status');
  dom.newBtn = $('cursus-new-btn');
  dom.saveBtn = $('cursus-save-btn');
  dom.saveFooterBtn = $('cursus-save-footer-btn');
  dom.duplicateBtn = $('cursus-duplicate-btn');
  dom.recalcBtn = $('cursus-recalc-btn');
  dom.deleteBtn = $('cursus-delete-btn');
  dom.resetBtn = $('cursus-reset-btn');
  dom.search = $('cursus-search');
  dom.sourceFilter = $('cursus-source-filter');
  dom.toolList = $('cursus-tool-list');
  dom.courseCount = $('cursus-course-count');
  dom.timelineCanvas = $('cursus-timeline-canvas');
  dom.timelineScroll = $('cursus-timeline-scroll');
  dom.ruler = $('cursus-ruler');
  dom.tracks = $('cursus-tracks');
  dom.inspector = $('cursus-inspector-content');
  dom.clearSelection = $('cursus-clear-selection');
  dom.zoomIn = $('cursus-zoom-in');
  dom.zoomOut = $('cursus-zoom-out');
  dom.gridToggle = $('cursus-grid-toggle');
  dom.saveStatus = $('cursus-save-status');
  dom.statCount = $('cursus-stat-count');
  dom.statPeriod = $('cursus-stat-period');
  dom.statDuration = $('cursus-stat-duration');
  dom.coherenceTitle = $('cursus-coherence-title');
  dom.coherenceDetail = $('cursus-coherence-detail');
  dom.stackManager = $('cursus-stack-manager');
}

function getFormationLabel(formation = {}) {
  return clean(formation.titre || formation.title || formation.nom || formation.name || formation.slug || formation.id || 'Formation sans nom', 160);
}

function getCourseTitle(course = {}) {
  return clean(course.titre || course.title || course.nom || course.name || 'Cours sans titre', 180);
}

function getCourseBlockLabel(course = {}) {
  return clean(course.bloc || course.blockTitle || course.blockName || course.moduleTitle || '', 120);
}

function getCourseStatusLabel(course = {}) {
  if (course.actif === true || course.lmsStatus === 'published' || course.statutValidation === 'approved') return 'Publié';
  if (course.lmsStatus === 'pending_review' || course.statutValidation === 'pending') return 'En attente';
  return 'Brouillon';
}

function isCoursePublishedForCursus(course = {}) {
  const status = String(course.statutValidation || '').toLowerCase();
  const lmsStatus = String(course.lmsStatus || '').toLowerCase();
  return course.actif === true || status === 'approved' || lmsStatus === 'published';
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

function getSelectedFormation() {
  const formationId = dom.formation?.value || '';
  const formation = formations.find((item) => item.id === formationId) || null;
  return {
    id: formation?.id || formationId,
    name: formation ? getFormationLabel(formation) : ''
  };
}

function courseMatchesSelectedFormation(course = {}) {
  const formation = getSelectedFormation();
  if (!formation.id && !formation.name) return false;
  const refs = getCourseFormationRefs(course);
  const probes = [formation.id, formation.name].map(normalizeSearch).filter(Boolean);
  return probes.some((probe) => refs.includes(probe));
}

function findCourseFormation(course = {}) {
  const refs = getCourseFormationRefs(course);
  return formations.find((formation) => {
    const probes = [formation.id, getFormationLabel(formation)].map(normalizeSearch).filter(Boolean);
    return probes.some((probe) => refs.includes(probe));
  }) || null;
}

function isCoursePlaced(courseId = '') {
  return timelineItems.some((item) => item.type === 'course' && item.courseId === courseId);
}

function getTypeLabel(type = '') {
  const map = {
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

function getTrackForItem(item = {}) {
  const type = item.type || 'course';
  if (COURSE_TRACK_TYPES.has(type)) return 'courses';
  if (type === 'assignment') return 'assignments';
  if (type === 'exam' || type === 'evaluation') return 'exams';
  if (type === 'live_session' || type === 'workshop') return 'lives';
  return 'margins';
}

function isLiveTimelineType(type = '') {
  return type === 'live_session' || type === 'workshop';
}

function getDefaultDuration(type = '') {
  if (type === 'exam' || type === 'evaluation') return 2;
  if (type === 'live_session' || type === 'workshop') return 1;
  if (type === 'assignment') return 7;
  if (type === 'revision_period' || type === 'catchup_period' || type === 'buffer_period') return 7;
  return 7;
}

function buildLiveTrackingDraft(raw = {}, item = {}) {
  const existing = raw.liveTracking && typeof raw.liveTracking === 'object' ? raw.liveTracking : {};
  const existingWindow = existing.schedulingWindow && typeof existing.schedulingWindow === 'object'
    ? existing.schedulingWindow
    : existing.teacherSchedulingWindow && typeof existing.teacherSchedulingWindow === 'object'
      ? existing.teacherSchedulingWindow
      : {};
  const type = item.type || raw.type || 'live_session';
  const duration = Math.max(1, Number(item.estimatedDurationDays || raw.estimatedDurationDays || raw.durationDays || getDefaultDuration(type)) || getDefaultDuration(type));
  const startOffset = Math.max(0, Number(item.startOffsetDays || raw.startOffsetDays || 0) || 0);

  return {
    ...existing,
    version: existing.version || 'live-tracking-v1',
    type,
    title: clean(item.title || raw.title || getTypeLabel(type), 180),
    status: clean(existing.status || raw.liveStatus || 'to_schedule', 60) || 'to_schedule',
    teacherSelectionMode: clean(existing.teacherSelectionMode || 'teacher_selects_date_in_window', 80),
    teacherSelectionStatus: clean(existing.teacherSelectionStatus || 'pending', 60) || 'pending',
    studentScheduleStatus: clean(existing.studentScheduleStatus || 'pending_teacher_date', 60) || 'pending_teacher_date',
    notificationStatus: clean(existing.notificationStatus || 'not_ready', 60) || 'not_ready',
    selectedSlot: existing.selectedSlot || null,
    selectedLiveAt: clean(existing.selectedLiveAt || '', 60),
    selectedLiveEndAt: clean(existing.selectedLiveEndAt || '', 60),
    selectedByUid: clean(existing.selectedByUid || '', 140),
    selectedByEmail: clean(existing.selectedByEmail || '', 180),
    selectedAt: clean(existing.selectedAt || '', 60),
    schedulingWindow: {
      ...existingWindow,
      modelStartOffsetDays: startOffset,
      modelEndOffsetDays: startOffset + duration,
      modelDurationDays: duration,
      recommendedStartAt: clean(existingWindow.recommendedStartAt || existingWindow.startAt || '', 60),
      recommendedEndAt: clean(existingWindow.recommendedEndAt || existingWindow.endAt || '', 60),
      teacherCanSelectFrom: clean(existingWindow.teacherCanSelectFrom || existingWindow.recommendedStartAt || '', 60),
      teacherCanSelectUntil: clean(existingWindow.teacherCanSelectUntil || existingWindow.recommendedEndAt || '', 60)
    }
  };
}

function syncLiveTrackingDraft(item = {}) {
  if (!isLiveTimelineType(item.type)) return;
  item.liveTracking = buildLiveTrackingDraft(item, item);
}

function normalizeItem(raw = {}, index = 0) {
  const type = raw.type || (raw.courseId ? 'course' : 'placeholder_course');
  const duration = Math.max(1, Number(raw.estimatedDurationDays || raw.durationDays || getDefaultDuration(type)) || getDefaultDuration(type));
  const item = {
    id: raw.id || raw.itemId || uid(type),
    type,
    layer: raw.layer || getTrackForItem({ type }),
    title: clean(raw.title || raw.courseTitle || raw.label || getTypeLabel(type), 180),
    courseId: raw.courseId || '',
    courseTitle: clean(raw.courseTitle || raw.title || '', 180),
    sourceFormationId: raw.sourceFormationId || raw.formationId || '',
    sourceFormationName: clean(raw.sourceFormationName || raw.formationName || '', 180),
    displayContextFormationId: raw.displayContextFormationId || getSelectedFormation().id || '',
    displayContextFormationName: clean(raw.displayContextFormationName || getSelectedFormation().name || '', 180),
    blockTitle: clean(raw.blockTitle || raw.blockName || '', 120),
    relatedCourseId: raw.relatedCourseId || '',
    relatedCourseTitle: clean(raw.relatedCourseTitle || '', 180),
    estimatedDurationDays: duration,
    startOffsetDays: Math.max(0, Number(raw.startOffsetDays || 0) || 0),
    priorityLevel: raw.priorityLevel || 'normal',
    isRequired: raw.isRequired !== false,
    isBlocking: Boolean(raw.isBlocking || raw.isBlockingPrerequisite),
    isBlockingPrerequisite: Boolean(raw.isBlockingPrerequisite || raw.isBlocking),
    isQualiopiEvidence: Boolean(raw.isQualiopiEvidence),
    isLocked: Boolean(raw.isLocked),
    isSharedCourse: Boolean(raw.isSharedCourse),
    grantedByCurriculum: raw.grantedByCurriculum !== false,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    notes: clean(raw.notes || raw.description || '', 600)
  };
  if (isLiveTimelineType(type)) item.liveTracking = buildLiveTrackingDraft(raw, item);
  return item;
}

function getStructuralItems() {
  return timelineItems
    .filter((item) => STRUCTURAL_TYPES.has(item.type))
    .sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)) || a.title.localeCompare(b.title, 'fr'));
}

function normalizeStructuralOrders() {
  getStructuralItems().forEach((item, index) => {
    item.order = Number.isFinite(Number(item.order)) ? Number(item.order) : index;
    if (!Number.isFinite(Number(item.startOffsetDays))) item.startOffsetDays = 0;
  });
}

function getTimelineDurationDays() {
  if (!timelineItems.length) return 0;
  return Math.max(...timelineItems.map((item) => Number(item.startOffsetDays || 0) + Number(item.estimatedDurationDays || 1)), 0);
}

function getWeeksCount() {
  return Math.max(8, Math.ceil(Math.max(1, getTimelineDurationDays()) / 7));
}

function getItemWeekStart(item = {}) {
  return Math.max(0, Math.floor(Number(item.startOffsetDays || 0) / 7));
}

function getItemWeekSpan(item = {}) {
  return Math.max(1, Math.ceil(Number(item.estimatedDurationDays || 1) / 7));
}

function getItemPeriodLabel(item = {}) {
  const startWeek = getItemWeekStart(item) + 1;
  const endWeek = startWeek + getItemWeekSpan(item) - 1;
  return startWeek === endWeek ? `S${startWeek}` : `S${startWeek}–S${endWeek}`;
}

function getCourseItemsForWeek(weekZero = 0) {
  const targetWeek = Math.max(0, Number(weekZero) || 0);
  return timelineItems
    .filter((item) => COURSE_TRACK_TYPES.has(item.type) && getItemWeekStart(item) === targetWeek)
    .sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)) || a.title.localeCompare(b.title, 'fr'));
}

function getCourseStackForItem(item = {}) {
  if (!COURSE_TRACK_TYPES.has(item.type)) return [];
  return getCourseItemsForWeek(getItemWeekStart(item));
}

function getStructuralWeekRanges() {
  return timelineItems
    .filter((item) => STRUCTURAL_TYPES.has(item.type))
    .map((item) => {
      const start = getItemWeekStart(item);
      return {
        id: item.id,
        start,
        end: start + getItemWeekSpan(item),
        type: item.type
      };
    })
    .sort((a, b) => (a.start - b.start) || (a.end - b.end));
}

function getLatestStructuralEndWeek() {
  return Math.max(0, ...getStructuralWeekRanges().map((range) => range.end), 0);
}

function findNextFreeStructuralWeek(startWeek = 0, spanWeeks = 1) {
  let cursor = Math.max(0, Math.floor(Number(startWeek) || 0));
  const span = Math.max(1, Math.ceil(Number(spanWeeks) || 1));

  getStructuralWeekRanges().forEach((range) => {
    if (range.end <= cursor) return;
    if (range.start >= cursor + span) return;
    cursor = Math.max(cursor, range.end);
  });

  return cursor;
}

function getSelectedStackAppendOffset(type = '') {
  if (!COURSE_TRACK_TYPES.has(type)) return null;
  const selected = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!selected || !COURSE_TRACK_TYPES.has(selected.type)) return null;

  const stack = getCourseStackForItem(selected);
  if (stack.length < 2) return null;

  const stackEndWeek = Math.max(...stack.map((item) => getItemWeekStart(item) + getItemWeekSpan(item)), 0);
  const spanWeeks = Math.max(1, Math.ceil(getDefaultDuration(type) / 7));
  return findNextFreeStructuralWeek(stackEndWeek, spanWeeks) * 7;
}

function captureTimelineScroll() {
  if (!dom.timelineScroll) return null;
  return {
    node: dom.timelineScroll,
    left: dom.timelineScroll.scrollLeft,
    top: dom.timelineScroll.scrollTop
  };
}

function restoreTimelineScroll(snapshot) {
  if (!snapshot?.node) return;
  const restore = () => {
    if (!snapshot.node.isConnected) return;
    snapshot.node.scrollLeft = snapshot.left;
    snapshot.node.scrollTop = snapshot.top;
  };
  restore();
  window.requestAnimationFrame(restore);
}

function getAppendStartOffset(type = '') {
  if (COURSE_TRACK_TYPES.has(type)) {
    const stackOffset = getSelectedStackAppendOffset(type);
    if (Number.isFinite(stackOffset)) return stackOffset;

    const spanWeeks = Math.max(1, Math.ceil(getDefaultDuration(type) / 7));
    return findNextFreeStructuralWeek(getLatestStructuralEndWeek(), spanWeeks) * 7;
  }
  if (STRUCTURAL_TYPES.has(type)) return getTimelineDurationDays();
  return Math.max(0, getTimelineDurationDays() - getDefaultDuration(type));
}

function renderFormationSelect() {
  if (!dom.formation) return;
  const current = dom.formation.value || formations[0]?.id || '';
  dom.formation.innerHTML = formations.length
    ? formations.map((formation) => `<option value="${escapeHtml(formation.id)}">${escapeHtml(getFormationLabel(formation))}</option>`).join('')
    : '<option value="">Aucune formation disponible</option>';
  if (current && formations.some((formation) => formation.id === current)) dom.formation.value = current;
}

function renderTemplateSelect() {
  if (!dom.template) return;
  const selectedFormation = getSelectedFormation();
  const sameFormation = templates
    .filter((template) => !selectedFormation.id || template.formationId === selectedFormation.id)
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' }));
  const others = templates
    .filter((template) => selectedFormation.id && template.formationId !== selectedFormation.id)
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' }));

  dom.template.innerHTML = `
    <option value="">Nouveau cursus</option>
    ${sameFormation.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.title || 'Cursus sans nom')}</option>`).join('')}
    ${others.length ? `<option disabled>──── Autres formations ────</option>${others.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.title || 'Cursus sans nom')} · ${escapeHtml(template.formationName || 'Autre formation')}</option>`).join('')}` : ''}
  `;

  if (activeTemplateId && templates.some((template) => template.id === activeTemplateId)) dom.template.value = activeTemplateId;
}

function getFilteredCourses() {
  const search = normalizeSearch(dom.search?.value || '');
  const source = dom.sourceFilter?.value || 'linked';
  return courses
    .filter((course) => {
      if (!isCoursePublishedForCursus(course)) return false;
      const matchesLinked = courseMatchesSelectedFormation(course);
      const courseFormation = findCourseFormation(course);
      const isShared = Boolean(course.sharedCourse || course.isSharedCourse || normalizeArray(course.linkedFormationIds).length);
      const required = !isCourseExplicitlyOptional(course);
      if (source === 'linked' && !matchesLinked) return false;
      if (source === 'shared' && !isShared) return false;
      if (source === 'other' && (matchesLinked || !courseFormation)) return false;
      if (activeToolFilter === 'required' && !required) return false;
      if (activeToolFilter === 'optional' && required) return false;
      if (search) {
        const haystack = normalizeSearch(`${getCourseTitle(course)} ${getCourseBlockLabel(course)} ${courseFormation ? getFormationLabel(courseFormation) : ''}`);
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' }));
}

function renderToolList() {
  if (!dom.toolList) return;
  const filtered = getFilteredCourses();
  if (dom.courseCount) dom.courseCount.textContent = filtered.length;

  if (!filtered.length) {
    dom.toolList.innerHTML = '<div class="sbi-cursus-empty">Aucun cours ne correspond à ce filtre.</div>';
    return;
  }

  dom.toolList.innerHTML = filtered.map((course) => {
    const title = getCourseTitle(course);
    const block = getCourseBlockLabel(course);
    const placed = isCoursePlaced(course.id);
    const sourceFormation = findCourseFormation(course);
    const sourceName = sourceFormation ? getFormationLabel(sourceFormation) : 'Source inconnue';
    return `
      <article class="sbi-cursus-tool-card ${placed ? 'is-placed' : ''}" data-course-id="${escapeHtml(course.id)}">
        <div class="sbi-cursus-tool-icon">▦</div>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(getCourseStatusLabel(course))}${block ? ` · Bloc : ${escapeHtml(block)}` : ''}</small>
          <small>Source : ${escapeHtml(sourceName)}</small>
        </div>
        <button type="button" data-action="add-course" data-id="${escapeHtml(course.id)}">${placed ? 'Déjà' : 'Ajouter'}</button>
      </article>
    `;
  }).join('');
}

function renderRuler(weeks = getWeeksCount()) {
  if (!dom.ruler || !dom.timelineCanvas) return;
  dom.timelineCanvas.style.setProperty('--cursus-weeks', String(weeks));
  dom.timelineCanvas.style.setProperty('--cursus-week-width', `${Math.round(120 * zoomLevel)}px`);
  dom.ruler.innerHTML = `
    <div class="sbi-cursus-ruler-corner">Pistes</div>
    ${Array.from({ length: weeks }, (_, index) => `
      <div class="sbi-cursus-week"><span>S${index + 1}</span><small>${index === 0 ? 'Départ' : `+${index * 7} j`}</small></div>
    `).join('')}
  `;
}

function getTrackItems(trackId) {
  const track = TRACKS.find((item) => item.id === trackId);
  if (!track) return [];
  return timelineItems
    .filter((item) => track.types.includes(item.type))
    .sort((a, b) => (Number(a.startOffsetDays || 0) - Number(b.startOffsetDays || 0)) || (Number(a.order || 0) - Number(b.order || 0)));
}

function renderBlock(item) {
  const start = getItemWeekStart(item);
  const span = getItemWeekSpan(item);
  const selected = selectedItemId === item.id;
  const locked = Boolean(item.isLocked);
  const stackItems = getCourseStackForItem(item);
  const stackCount = stackItems.length;
  const stackIndex = Math.max(0, stackItems.findIndex((entry) => entry.id === item.id));
  const isCourseStack = stackCount > 1;
  const isStackTop = isCourseStack && stackIndex === stackCount - 1;
  const stackAction = isCourseStack ? 'open-week-stack' : 'select-item';
  const badges = [
    item.isRequired ? 'O' : '',
    item.isBlocking || item.isBlockingPrerequisite ? 'B' : '',
    locked ? 'L' : '',
    item.isSharedCourse ? '↗' : '',
    isStackTop ? `+${stackCount - 1}` : ''
  ].filter(Boolean).map((badge) => `<span>${escapeHtml(badge)}</span>`).join('');
  const subtitle = isCourseStack
    ? `${getItemPeriodLabel(item)} · ${stackCount} cours stackés${item.blockTitle ? ` · ${item.blockTitle}` : ''}`
    : `${getItemPeriodLabel(item)} · ${Number(item.estimatedDurationDays || 1)} j${item.blockTitle ? ` · ${item.blockTitle}` : ''}${item.isSharedCourse ? ' · Accès cursus' : ''}`;
  const stackStyle = isCourseStack
    ? `--stack-offset:${Math.min(stackIndex, 5) * 7}px;--stack-z:${10 + stackIndex};`
    : '--stack-offset:0px;--stack-z:1;';

  return `
    <button type="button" class="sbi-cursus-block type-${escapeHtml(item.type)} ${selected ? 'is-selected' : ''} ${locked ? 'sbi-is-locked' : ''} ${isCourseStack ? 'is-stack-member' : ''} ${isStackTop ? 'is-stack-top' : ''}" data-action="${stackAction}" data-id="${escapeHtml(item.id)}" data-stack-week="${start + 1}" data-stack-count="${stackCount}" data-sbi-locked="${locked ? 'true' : 'false'}" draggable="${locked ? 'false' : 'true'}" style="--start-week:${start};--span-week:${span};${stackStyle}">
      <span class="sbi-cursus-block-handle">⋮⋮</span>
      <span class="sbi-cursus-block-title"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(subtitle)}</small></span>
      <span class="sbi-cursus-block-badges">${badges}</span>
    </button>
  `;
}

function renderTracks() {
  if (!dom.tracks) return;
  dom.tracks.innerHTML = TRACKS.map((track) => {
    const items = getTrackItems(track.id);
    return `
      <section class="sbi-cursus-track" data-track="${escapeHtml(track.id)}">
        <div class="sbi-cursus-track-label">
          <div class="sbi-cursus-track-icon type-${escapeHtml(track.types[0])}">${escapeHtml(track.icon)}</div>
          <div><strong>${escapeHtml(track.label)}</strong><small>${escapeHtml(track.sub)}</small></div>
          <span class="sbi-cursus-track-count">${items.length}</span>
        </div>
        <div class="sbi-cursus-track-body">
          ${items.map(renderBlock).join('')}
        </div>
      </section>
    `;
  }).join('');
}

function renderStats() {
  const duration = getTimelineDurationDays();
  const weeks = getWeeksCount();
  if (dom.statCount) dom.statCount.textContent = String(timelineItems.length);
  if (dom.statPeriod) dom.statPeriod.textContent = `S1 → S${weeks}`;
  if (dom.statDuration) dom.statDuration.textContent = `${duration || 0} j`;

  const structuralCount = getStructuralItems().length;
  const warnings = [];
  if (!dom.formation?.value) warnings.push('Formation non liée');
  if (!structuralCount && timelineItems.length) warnings.push('Aucun cours / marge structurelle');
  if (timelineItems.some((item) => PARALLEL_TYPES.has(item.type) && !item.relatedCourseId)) warnings.push('Un devoir, examen ou live n’est lié à aucun cours');

  if (dom.coherenceTitle) dom.coherenceTitle.textContent = warnings.length ? `${warnings.length} point${warnings.length > 1 ? 's' : ''} à vérifier` : 'Planning cohérent';
  if (dom.coherenceDetail) dom.coherenceDetail.textContent = warnings.length ? warnings.join(' · ') : 'Aucune anomalie détectée';
}

function renderInspector() {
  if (!dom.inspector) return;
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item) {
    dom.inspector.innerHTML = '<div class="sbi-cursus-inspector-empty">Sélectionnez un élément dans la timeline.</div>';
    return;
  }

  const relatedOptions = getStructuralItems()
    .filter((entry) => entry.type === 'course' || entry.type === 'placeholder_course')
    .map((entry) => `<option value="${escapeHtml(entry.id)}" ${item.relatedCourseId === entry.id || item.relatedCourseId === entry.courseId ? 'selected' : ''}>${escapeHtml(entry.title)}</option>`)
    .join('');

  const isParallel = PARALLEL_TYPES.has(item.type);
  const startWeek = getItemWeekStart(item) + 1;
  const locked = Boolean(item.isLocked);

  dom.inspector.innerHTML = `
    <div class="sbi-cursus-selected-card">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(getTypeLabel(item.type))} · ${escapeHtml(getItemPeriodLabel(item))}</span>
      ${item.sourceFormationName ? `<span>Source : ${escapeHtml(item.sourceFormationName)}</span>` : ''}
    </div>

    <div class="sbi-cursus-form-grid">
      <div class="sbi-cursus-form-row">
        <label>Titre</label>
        <input type="text" data-field="title" value="${escapeHtml(item.title)}">
      </div>
      <div class="sbi-cursus-two-cols">
        <div class="sbi-cursus-form-row">
          <label>Durée estimée en jours</label>
          <input type="number" min="1" max="365" data-field="estimatedDurationDays" value="${Number(item.estimatedDurationDays || 1)}">
        </div>
        <div class="sbi-cursus-form-row">
          <label>Semaine de début</label>
          <input type="number" min="1" max="999" data-field="startWeek" value="${startWeek}" ${locked ? 'disabled' : ''}>
          <small>${locked ? 'Position verrouillée.' : 'Placement manuel relatif.'}</small>
        </div>
      </div>
      <div class="sbi-cursus-form-row">
        <label>Priorité</label>
        <select data-field="priorityLevel">
          <option value="normal" ${item.priorityLevel === 'normal' ? 'selected' : ''}>Normale</option>
          <option value="high" ${item.priorityLevel === 'high' ? 'selected' : ''}>Haute</option>
          <option value="urgent" ${item.priorityLevel === 'urgent' ? 'selected' : ''}>Urgente</option>
        </select>
      </div>
      ${isParallel ? `
        <div class="sbi-cursus-form-row">
          <label>Cours lié</label>
          <select data-field="relatedCourseId">
            <option value="">Aucun cours lié</option>
            ${relatedOptions}
          </select>
        </div>
      ` : ''}
      <label class="sbi-cursus-check-row">Obligatoire <input type="checkbox" data-field="isRequired" ${item.isRequired ? 'checked' : ''}></label>
      <label class="sbi-cursus-check-row">Prérequis / élément bloquant <input type="checkbox" data-field="isBlocking" ${item.isBlocking || item.isBlockingPrerequisite ? 'checked' : ''}></label>
      <label class="sbi-cursus-check-row">Dates / position verrouillées <input type="checkbox" data-field="isLocked" ${locked ? 'checked' : ''}></label>
      <label class="sbi-cursus-check-row">Preuve Qualiopi <input type="checkbox" data-field="isQualiopiEvidence" ${item.isQualiopiEvidence ? 'checked' : ''}></label>
      <div class="sbi-cursus-form-row">
        <label>Notes</label>
        <textarea rows="4" data-field="notes">${escapeHtml(item.notes || '')}</textarea>
      </div>
      <div class="sbi-cursus-inline-actions">
        <button type="button" data-action="delete-item" class="is-danger">Supprimer</button>
      </div>
    </div>
  `;
}

function escapeCssValue(value = '') {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, '\\$&');
}

function isSoftInspectorTextField(target) {
  if (!target || typeof target.matches !== 'function') return false;
  return target.matches('input[type="text"][data-field="title"], textarea[data-field="notes"]');
}

function renderSelectedItemPreview(item = {}) {
  const selector = `[data-id="${escapeCssValue(item.id || '')}"]`;
  dom.tracks?.querySelectorAll(selector).forEach((block) => {
    const title = block.querySelector('.sbi-cursus-block-title strong');
    if (title) title.textContent = item.title || getTypeLabel(item.type);
  });

  const cardTitle = dom.inspector?.querySelector('.sbi-cursus-selected-card strong');
  if (cardTitle) cardTitle.textContent = item.title || getTypeLabel(item.type);
}

function ensureStackManager() {
  if (dom.stackManager?.isConnected) return dom.stackManager;
  if (!dom.app) return null;

  const modal = document.createElement('div');
  modal.id = 'cursus-stack-manager';
  modal.className = 'sbi-cursus-stack-modal';
  modal.hidden = true;
  dom.app.appendChild(modal);
  dom.stackManager = modal;
  return modal;
}

function renderStackManager() {
  const modal = ensureStackManager();
  if (!modal) return;

  const weekZero = Math.max(0, Number(activeStackWeek) || 0);
  const items = activeStackWeek >= 0 ? getCourseItemsForWeek(weekZero) : [];
  if (activeStackWeek < 0 || !items.length) {
    modal.hidden = true;
    modal.innerHTML = '';
    return;
  }

  const weekLabel = `S${weekZero + 1}`;
  modal.hidden = false;
  modal.innerHTML = `
    <div class="sbi-cursus-stack-backdrop" data-stack-action="close"></div>
    <section class="sbi-cursus-stack-panel" role="dialog" aria-modal="true" aria-label="Cours stackés ${escapeHtml(weekLabel)}">
      <header class="sbi-cursus-stack-head">
        <div>
          <p class="sbi-cursus-kicker">Semaine ${escapeHtml(String(weekZero + 1))}</p>
          <h3>${items.length} cours stackés</h3>
        </div>
        <button type="button" data-stack-action="close" aria-label="Fermer">×</button>
      </header>
      <div class="sbi-cursus-stack-mini-ruler">${escapeHtml(weekLabel)}</div>
      <div class="sbi-cursus-stack-week-lane">
        ${items.map((item, index) => `
          <article class="sbi-cursus-stack-course ${selectedItemId === item.id ? 'is-selected' : ''}" style="--stack-card-x:${index * 3}px;--stack-card-y:${index * 2}px;">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(Number(item.estimatedDurationDays || 1))} j${item.blockTitle ? ` · ${escapeHtml(item.blockTitle)}` : ''}${item.sourceFormationName ? ` · ${escapeHtml(item.sourceFormationName)}` : ''}</span>
            </div>
            <div class="sbi-cursus-stack-actions">
              <button type="button" data-stack-action="select" data-id="${escapeHtml(item.id)}">Modifier</button>
              <button type="button" data-stack-action="delete" data-id="${escapeHtml(item.id)}" class="is-danger">Supprimer</button>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function moveItemToWeek(itemId, week, { render = true, select = true } = {}) {
  const item = timelineItems.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, reason: 'Element introuvable.' };
  if (item.isLocked) return { ok: false, reason: 'Element verrouille.' };

  item.startOffsetDays = Math.max(0, (Number(week || 1) - 1) * 7);
  if (select) selectedItemId = item.id;
  if (render) renderAll({ recalc: true, preserveScroll: true });
  return { ok: true, item };
}

function applyItemWeekMoves(moves = [], { selectItemId = '', render = true } = {}) {
  const normalized = moves
    .map((move) => ({ id: move.id || move.itemId || '', week: Math.max(1, Number(move.week || move.toWeek || 1) || 1) }))
    .filter((move) => move.id);

  for (const move of normalized) {
    const item = timelineItems.find((entry) => entry.id === move.id);
    if (!item) return { ok: false, reason: 'Element introuvable.' };
    if (item.isLocked) return { ok: false, reason: 'Element verrouille.' };
  }

  normalized.forEach((move) => {
    const item = timelineItems.find((entry) => entry.id === move.id);
    item.startOffsetDays = Math.max(0, (move.week - 1) * 7);
  });

  if (selectItemId) selectedItemId = selectItemId;
  else if (normalized[0]?.id) selectedItemId = normalized[0].id;

  if (render) renderAll({ recalc: true, preserveScroll: true });
  return { ok: true, moved: normalized.length };
}

function exposeCursusApi() {
  window.SBI_ADMIN_CURSUS_API = {
    moveItemToWeek: (itemId, week, options = {}) => moveItemToWeek(itemId, week, options),
    applyWeekMoves: (moves = [], options = {}) => applyItemWeekMoves(moves, options),
    getItems: () => timelineItems.map((item) => ({ ...item })),
    openWeekStack: (week, itemId = '') => openWeekStackManager(week, itemId)
  };
}

function renderAll({ recalc = false, preserveScroll = false } = {}) {
  const scrollSnapshot = preserveScroll ? captureTimelineScroll() : null;
  if (recalc) normalizeStructuralOrders();
  const weeks = getWeeksCount();
  renderRuler(weeks);
  renderTracks();
  renderToolList();
  renderInspector();
  renderStats();
  renderStackManager();
  exposeCursusApi();
  renderTemplateSelect();
  if (dom.app) dom.app.classList.toggle('show-grid', Boolean(dom.gridToggle?.checked));
  if (dom.activeStatus) {
    const template = templates.find((item) => item.id === activeTemplateId);
    const status = template?.status || 'draft';
    dom.activeStatus.textContent = status === 'active' ? 'Actif' : status === 'archived' ? 'Archivé' : 'Brouillon';
    dom.activeStatus.style.borderColor = status === 'active' ? 'rgba(64,223,128,.32)' : status === 'archived' ? 'rgba(255,255,255,.18)' : 'rgba(42,87,255,.28)';
  }
  window.requestAnimationFrame(() => window.SBI_CURSUS_WEEKS?.refresh?.());
  restoreTimelineScroll(scrollSnapshot);
}

function openWeekStackManager(week, itemId = '') {
  const weekNumber = Math.max(1, Number(week) || 1);
  activeStackWeek = weekNumber - 1;
  if (itemId && timelineItems.some((item) => item.id === itemId)) selectedItemId = itemId;
  renderAll({ preserveScroll: true });
}

function closeWeekStackManager({ render = true } = {}) {
  activeStackWeek = -1;
  if (render) renderAll({ preserveScroll: true });
  else renderStackManager();
}

function selectStackItem(itemId = '') {
  if (!timelineItems.some((item) => item.id === itemId)) return;
  selectedItemId = itemId;
  activeStackWeek = -1;
  renderAll({ preserveScroll: true });
}

function deleteStackItem(itemId = '') {
  const item = timelineItems.find((entry) => entry.id === itemId);
  if (!item) return;
  if (!window.confirm(`Supprimer « ${item.title} » du cursus ?`)) return;

  const weekZero = getItemWeekStart(item);
  timelineItems = timelineItems.filter((entry) => entry.id !== itemId);
  if (selectedItemId === itemId) selectedItemId = '';
  activeStackWeek = getCourseItemsForWeek(weekZero).length ? weekZero : -1;
  renderAll({ recalc: true, preserveScroll: true });
}


function applyPlaceholderReplacementToTimeline(replacement = {}) {
  const placeholderId = clean(replacement.placeholderId || '', 180);
  const courseId = clean(replacement.courseId || '', 180);
  if (!placeholderId || !courseId) return false;

  const item = timelineItems.find((entry) => entry.id === placeholderId || entry.itemId === placeholderId || entry.replacedPlaceholderId === placeholderId);
  if (!item) return false;

  item.type = 'course';
  item.itemType = 'course';
  item.layer = 'courses';
  item.title = clean(replacement.title || replacement.courseTitle || item.title || 'Cours sans titre', 180);
  item.courseId = courseId;
  item.courseTitle = clean(replacement.courseTitle || replacement.title || item.title, 180);
  item.courseStatus = clean(replacement.courseStatus || 'Publié', 80);
  item.itemId = '';
  item.sourceFormationId = clean(replacement.sourceFormationId || item.sourceFormationId || '', 180);
  item.sourceFormationName = clean(replacement.sourceFormationName || item.sourceFormationName || '', 180);
  item.displayContextFormationId = clean(replacement.displayContextFormationId || item.displayContextFormationId || getSelectedFormation().id || '', 180);
  item.displayContextFormationName = clean(replacement.displayContextFormationName || item.displayContextFormationName || getSelectedFormation().name || '', 180);
  item.blockTitle = clean(replacement.blockTitle || item.blockTitle || '', 120);
  item.estimatedDurationDays = Math.max(1, Number(replacement.estimatedDurationDays || item.estimatedDurationDays || item.durationDays || 7) || 7);
  item.durationDays = item.estimatedDurationDays;
  item.priorityLevel = replacement.priorityLevel || item.priorityLevel || 'normal';
  item.isSharedCourse = Boolean(replacement.isSharedCourse);
  item.grantedByCurriculum = true;
  item.replacementSource = 'placeholder-replace-v2';
  item.replacedPlaceholderId = placeholderId;
  item.source = 'placeholder-replace-v2';
  selectedItemId = item.id;
  setStatus(`Cours futur remplacé par « ${item.title} ». Sauvegarde le cursus pour synchroniser les promotions.`, 'success');
  renderAll({ recalc: true });
  return true;
}

function addCourseToTimeline(courseId) {
  const course = courses.find((item) => item.id === courseId);
  if (!course) return;
  if (isCoursePlaced(courseId)) {
    setStatus('Ce cours est déjà placé dans le cursus.', 'error');
    return;
  }
  const sourceFormation = findCourseFormation(course);
  const context = getSelectedFormation();
  const item = normalizeItem({
    id: uid('course'),
    type: 'course',
    title: getCourseTitle(course),
    courseId: course.id,
    courseTitle: getCourseTitle(course),
    sourceFormationId: sourceFormation?.id || '',
    sourceFormationName: sourceFormation ? getFormationLabel(sourceFormation) : '',
    displayContextFormationId: context.id,
    displayContextFormationName: context.name,
    blockTitle: getCourseBlockLabel(course),
    estimatedDurationDays: Number(course.estimatedDurationDays || course.durationDays || 7) || 7,
    startOffsetDays: getAppendStartOffset('course'),
    priorityLevel: course.priorityLevel || 'normal',
    isRequired: course.isRequired !== false && course.required !== false,
    isSharedCourse: sourceFormation && context.id && sourceFormation.id !== context.id,
    grantedByCurriculum: true,
    order: getStructuralItems().length
  });
  timelineItems.push(item);
  selectedItemId = item.id;
  setStatus(`Cours « ${item.title} » ajouté.`, 'success');
  renderAll({ recalc: true, preserveScroll: true });
}

function addItemByType(type) {
  const context = getSelectedFormation();
  const titleMap = {
    placeholder_course: 'Cours futur',
    buffer_period: 'Marge pédagogique',
    revision_period: 'Période de révisions',
    catchup_period: 'Rattrapage',
    assignment: 'Nouveau devoir',
    exam: 'Nouvel examen',
    evaluation: 'Nouvelle évaluation',
    live_session: 'Nouveau live',
    workshop: 'Nouvel atelier'
  };
  const structuralCount = getStructuralItems().length;
  const item = normalizeItem({
    id: uid(type),
    type,
    title: titleMap[type] || 'Nouvel élément',
    estimatedDurationDays: getDefaultDuration(type),
    startOffsetDays: getAppendStartOffset(type),
    formationId: context.id,
    formationName: context.name,
    displayContextFormationId: context.id,
    displayContextFormationName: context.name,
    order: STRUCTURAL_TYPES.has(type) ? structuralCount : timelineItems.length
  });
  timelineItems.push(item);
  selectedItemId = item.id;
  renderAll({ recalc: true, preserveScroll: true });
}

function updateSelectedField(field, value, isCheckbox = false, options = {}) {
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item) return;
  const render = options.render !== false;
  const softText = options.softText === true;
  const finalValue = isCheckbox ? Boolean(value) : value;

  if (field === 'title') item.title = (softText ? String(finalValue ?? '').slice(0, 180) : clean(finalValue, 180)) || getTypeLabel(item.type);
  if (field === 'estimatedDurationDays') item.estimatedDurationDays = Math.max(1, Number(finalValue || 1));
  if (field === 'startWeek' && !item.isLocked) {
    item.startOffsetDays = Math.max(0, (Number(finalValue || 1) - 1) * 7);
  }
  if (field === 'priorityLevel') item.priorityLevel = finalValue || 'normal';
  if (field === 'relatedCourseId') {
    item.relatedCourseId = finalValue || '';
    const related = timelineItems.find((entry) => entry.id === item.relatedCourseId || entry.courseId === item.relatedCourseId);
    item.relatedCourseTitle = related?.title || '';
    if (related && !item.isLocked) item.startOffsetDays = related.startOffsetDays || 0;
  }
  if (field === 'isRequired') item.isRequired = Boolean(finalValue);
  if (field === 'isBlocking') {
    item.isBlocking = Boolean(finalValue);
    item.isBlockingPrerequisite = Boolean(finalValue);
  }
  if (field === 'isLocked') item.isLocked = Boolean(finalValue);
  if (field === 'isQualiopiEvidence') item.isQualiopiEvidence = Boolean(finalValue);
  if (field === 'notes') item.notes = softText ? String(finalValue ?? '').slice(0, 600) : clean(finalValue, 600);

  syncLiveTrackingDraft(item);

  if (render) renderAll({ recalc: true, preserveScroll: true });
  else renderSelectedItemPreview(item);
}

function deleteSelectedItem() {
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item) return;
  if (!window.confirm(`Supprimer « ${item.title} » du cursus ?`)) return;
  timelineItems = timelineItems.filter((entry) => entry.id !== selectedItemId);
  selectedItemId = '';
  renderAll({ recalc: true, preserveScroll: true });
}

function resetEditor() {
  activeTemplateId = '';
  selectedItemId = '';
  pendingDeleteTemplateId = '';
  activeStackWeek = -1;
  timelineItems = [];
  if (dom.template) dom.template.value = '';
  if (dom.title) dom.title.value = '';
  setStatus('Nouveau cursus prêt.');
  renderAll({ recalc: true });
}

function loadTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) {
    resetEditor();
    return;
  }
  activeTemplateId = template.id;
  selectedItemId = '';
  pendingDeleteTemplateId = '';
  activeStackWeek = -1;
  if (template.formationId && formations.some((formation) => formation.id === template.formationId)) {
    dom.formation.value = template.formationId;
  }
  timelineItems = Array.isArray(template.items) ? template.items.map(normalizeItem) : [];
  if (dom.title) dom.title.value = template.title || '';
  setStatus(`Cursus « ${template.title || 'sans nom'} » chargé.`, 'success');
  renderAll({ recalc: true });
  if (Number(template.displayWeeks || 0) > 0) {
    window.dispatchEvent(new CustomEvent('sbi:cursus:display-weeks', { detail: { displayWeeks: Number(template.displayWeeks) } }));
  }
}

function buildTemplatePayload({ duplicate = false } = {}) {
  const formation = getSelectedFormation();
  const current = templates.find((item) => item.id === activeTemplateId) || null;
  const baseTitle = clean(dom.title?.value || current?.title || (formation.name ? `Cursus ${formation.name}` : 'Nouveau cursus'), 160) || 'Nouveau cursus';
  const title = duplicate && !baseTitle.toLowerCase().includes('copie') ? `${baseTitle} - copie` : baseTitle;
  if (dom.title && !dom.title.value) dom.title.value = title;
  const items = timelineItems.map((item, index) => ({
    ...item,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    layer: getTrackForItem(item),
    source: 'curriculum-timeline-redesign-v1'
  }));
  const weeksApi = window.SBI_CURSUS_WEEKS || null;
  const effectiveWeeks = Math.max(0, ...items.map((item) => getItemWeekStart(item) + getItemWeekSpan(item)), 0);
  const displayWeeks = Math.max(
    Number(weeksApi?.getDisplayWeeks?.() || 0),
    effectiveWeeks,
    getWeeksCount()
  );
  const effectiveDurationDays = Math.max(getTimelineDurationDays(), effectiveWeeks * 7);
  return {
    title,
    slug: slugify(title),
    formationId: formation.id,
    formationName: formation.name,
    status: current?.status || 'draft',
    version: 'curriculum-template-v1',
    uiModel: 'horizontal-multitrack-v1',
    items,
    itemCount: items.length,
    displayWeeks,
    effectiveWeeks,
    effectiveDurationDays,
    durationDays: getTimelineDurationDays(),
    updatedAt: serverTimestamp(),
    updatedBy: currentAdmin?.uid || '',
    updatedByEmail: currentAdmin?.email || ''
  };
}

async function saveTemplate({ duplicate = false } = {}) {
  if (!currentAdmin) return;
  if (!timelineItems.length) {
    setStatus('Ajoutez au moins un élément avant de sauvegarder.', 'error');
    return;
  }

  setStatus('Sauvegarde du cursus...');

  try {
    const payload = buildTemplatePayload({ duplicate });
    if (activeTemplateId && !duplicate) {
      await setDoc(doc(db, 'curriculumTemplates', activeTemplateId), payload, { merge: true });
      setStatus(`Cursus « ${payload.title} » mis à jour.`, 'success');
    } else {
      const ref = await addDoc(collection(db, 'curriculumTemplates'), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: currentAdmin.uid,
        createdByEmail: currentAdmin.email || ''
      });
      activeTemplateId = ref.id;
      setStatus(`Cursus « ${payload.title} » créé.`, 'success');
    }
    await loadTemplates();
    if (dom.template) dom.template.value = activeTemplateId;
  } catch (error) {
    console.warn('[SBI Cursus] Sauvegarde impossible :', error);
    setStatus('Sauvegarde impossible.', 'error');
  }
}

async function deleteTemplate() {
  const template = templates.find((item) => item.id === activeTemplateId);
  if (!template) {
    setStatus('Aucun cursus actif à supprimer.', 'error');
    return;
  }

  if (pendingDeleteTemplateId !== activeTemplateId) {
    pendingDeleteTemplateId = activeTemplateId;
    setStatus(`Cliquez encore sur Supprimer pour confirmer la suppression de « ${template.title || 'sans nom'} ».`, 'error');
    return;
  }

  try {
    await deleteDoc(doc(db, 'curriculumTemplates', activeTemplateId));
    setStatus(`Cursus « ${template.title || 'sans nom'} » supprimé.`, 'success');
    activeTemplateId = '';
    timelineItems = [];
    selectedItemId = '';
    activeStackWeek = -1;
    pendingDeleteTemplateId = '';
    await loadTemplates();
    renderAll({ recalc: true });
  } catch (error) {
    console.warn('[SBI Cursus] Suppression impossible :', error);
    setStatus('Suppression impossible.', 'error');
  }
}

async function loadFormations() {
  const snap = await getDocs(collection(db, 'formations'));
  formations = [];
  snap.forEach((docSnap) => formations.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  formations.sort((a, b) => getFormationLabel(a).localeCompare(getFormationLabel(b), 'fr', { sensitivity: 'base' }));
  renderFormationSelect();
}

async function loadCourses() {
  const snap = await getDocs(collection(db, 'courses'));
  courses = [];
  snap.forEach((docSnap) => {
    const course = { id: docSnap.id, ...(docSnap.data() || {}) };
    if (isCoursePublishedForCursus(course)) courses.push(course);
  });
  renderToolList();
}

async function loadTemplates() {
  const snap = await getDocs(collection(db, 'curriculumTemplates'));
  templates = [];
  snap.forEach((docSnap) => templates.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  templates.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' }));
  renderTemplateSelect();
}

async function loadCurrentAdmin(user) {
  if (!user) throw new Error('Authentification requise.');
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) throw new Error('Profil admin introuvable.');
  const profile = snap.data() || {};
  if (!isSbiAdminLike(profile)) throw new Error('Accès réservé aux administrateurs.');
  currentAdmin = {
    uid: user.uid,
    email: user.email || profile.email || '',
    profile
  };
}

function showUnauthorized(message) {
  const root = $('view-cursus');
  if (!root) return;
  root.innerHTML = `
    <div class="sbi-cursus-app" style="padding:1.4rem;min-height:auto;">
      <h2>Accès impossible</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function bindEvents() {
  dom.formation?.addEventListener('change', () => {
    activeTemplateId = '';
    selectedItemId = '';
    activeStackWeek = -1;
    renderAll({ recalc: true });
  });

  dom.template?.addEventListener('change', () => {
    loadTemplate(dom.template.value || '');
  });

  dom.title?.addEventListener('input', () => {
    pendingDeleteTemplateId = '';
  });

  dom.newBtn?.addEventListener('click', resetEditor);
  dom.resetBtn?.addEventListener('click', resetEditor);
  dom.saveBtn?.addEventListener('click', () => saveTemplate());
  dom.saveFooterBtn?.addEventListener('click', () => saveTemplate());
  dom.duplicateBtn?.addEventListener('click', () => saveTemplate({ duplicate: true }));
  dom.recalcBtn?.addEventListener('click', () => {
    renderAll({ recalc: true });
    setStatus('Timeline recalculée sans modifier les positions.', 'success');
  });
  dom.deleteBtn?.addEventListener('click', deleteTemplate);
  dom.search?.addEventListener('input', renderToolList);
  dom.sourceFilter?.addEventListener('change', renderToolList);
  dom.clearSelection?.addEventListener('click', () => {
    selectedItemId = '';
    activeStackWeek = -1;
    renderAll();
  });

  dom.zoomIn?.addEventListener('click', () => {
    zoomLevel = Math.min(1.55, zoomLevel + 0.12);
    renderAll();
  });
  dom.zoomOut?.addEventListener('click', () => {
    zoomLevel = Math.max(0.72, zoomLevel - 0.12);
    renderAll();
  });
  dom.gridToggle?.addEventListener('change', () => renderAll());

  document.querySelectorAll('[data-tool-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeToolFilter = button.dataset.toolFilter || 'all';
      document.querySelectorAll('[data-tool-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
      renderToolList();
    });
  });

  dom.toolList?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action="add-course"][data-id]');
    if (!button) return;
    addCourseToTimeline(button.dataset.id);
  });

  document.querySelectorAll('[data-add-type]').forEach((button) => {
    button.addEventListener('click', () => addItemByType(button.dataset.addType));
  });

  dom.tracks?.addEventListener('click', (event) => {
    const stackBlock = event.target.closest?.('[data-action="open-week-stack"][data-stack-week]');
    if (stackBlock) {
      event.preventDefault();
      stackBlock.blur?.();
      openWeekStackManager(stackBlock.dataset.stackWeek, stackBlock.dataset.id || '');
      return;
    }

    const block = event.target.closest?.('[data-action="select-item"][data-id]');
    if (!block) return;
    block.blur?.();
    selectedItemId = block.dataset.id || '';
    activeStackWeek = -1;
    renderAll({ preserveScroll: true });
  });

  dom.app?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-stack-action]');
    if (!button || !dom.app.contains(button)) return;

    const action = button.dataset.stackAction || '';
    if (action === 'close') {
      closeWeekStackManager();
      return;
    }
    if (action === 'select') {
      selectStackItem(button.dataset.id || '');
      return;
    }
    if (action === 'delete') {
      deleteStackItem(button.dataset.id || '');
    }
  });

  dom.inspector?.addEventListener('input', (event) => {
    const target = event.target.closest?.('[data-field]');
    if (!target) return;
    const softText = isSoftInspectorTextField(target);
    updateSelectedField(
      target.dataset.field,
      target.type === 'checkbox' ? target.checked : target.value,
      target.type === 'checkbox',
      { render: !softText, softText }
    );
  });

  dom.inspector?.addEventListener('change', (event) => {
    const target = event.target.closest?.('[data-field]');
    if (!target) return;
    updateSelectedField(target.dataset.field, target.type === 'checkbox' ? target.checked : target.value, target.type === 'checkbox');
  });

  dom.inspector?.addEventListener('keydown', (event) => {
    if (isSoftInspectorTextField(event.target)) event.stopPropagation();
  }, true);

  dom.inspector?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'delete-item') deleteSelectedItem();
  });

  if (window.__SBI_CURSUS_REPLACEMENT_EVENT_BOUND__ !== true) {
    window.__SBI_CURSUS_REPLACEMENT_EVENT_BOUND__ = true;
    window.addEventListener('sbi:cursus:placeholder-replaced', (event) => {
      applyPlaceholderReplacementToTimeline(event.detail || {});
    });
  }
}

async function initialiseData() {
  await Promise.all([loadFormations(), loadCourses(), loadTemplates()]);
  renderAll({ recalc: true });
}

export function mountAdminCursus() {
  const view = document.getElementById('view-cursus');
  if (!view) return () => {};

  // Déjà monté sur CE noeud DOM (double appel : auto-montage à l'import + appel
  // explicite par la route PJAX sur une vue fraîche) : ne pas re-binder.
  if (mounted && mountedView === view) return window.SBI_ADMIN_CURSUS_UNMOUNT || (() => {});

  // Nouveau noeud (retour via PJAX après un chargement standalone / F5, sans cleanup
  // shell enregistré) ou premier montage : on repart propre, en coupant un éventuel
  // listener auth resté actif d'un montage précédent.
  unsubscribeAuth?.();

  mounted = true;
  mountedView = view;
  cacheDom();
  bindEvents();
  renderAll({ recalc: true });

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    try {
      await loadCurrentAdmin(user);
      await initialiseData();
      setStatus('Cursus prêt.');
    } catch (error) {
      console.warn('[SBI Cursus] Accès refusé :', error);
      showUnauthorized(error?.message || 'Accès réservé aux administrateurs.');
    }
  });

  const cleanup = () => {
    mounted = false;
    mountedView = null;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };

  window.SBI_ADMIN_CURSUS_UNMOUNT = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountAdminCursus(), { once: true });
} else {
  mountAdminCursus();
}
