/**
 * SBI 8.0P.167.98 / P2I.5-H
 * Page Cursus dédiée : timeline horizontale multi-pistes issue du mockup validé.
 *
 * Périmètre :
 * - CRUD curriculumTemplates côté admin ;
 * - vraie timeline horizontale multi-pistes ;
 * - modèle sans dates fixes, uniquement semaines / durées estimées ;
 * - ne touche pas au panneau connexion élève GPT2 ;
 * - ne touche pas à teacherCourseAccess.
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

const STRUCTURAL_TYPES = new Set(['course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period']);
const COURSE_TRACK_TYPES = new Set(['course', 'placeholder_course']);
const MARGIN_TRACK_TYPES = new Set(['buffer_period', 'revision_period', 'catchup_period']);
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

function getDefaultDuration(type = '') {
  if (type === 'exam' || type === 'evaluation') return 2;
  if (type === 'live_session' || type === 'workshop') return 1;
  if (type === 'assignment') return 7;
  if (type === 'revision_period' || type === 'catchup_period' || type === 'buffer_period') return 7;
  return 7;
}

function normalizeItem(raw = {}, index = 0) {
  const type = raw.type || (raw.courseId ? 'course' : 'placeholder_course');
  const duration = Math.max(1, Number(raw.estimatedDurationDays || raw.durationDays || getDefaultDuration(type)) || getDefaultDuration(type));
  return {
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
}

function getStructuralItems() {
  return timelineItems
    .filter((item) => STRUCTURAL_TYPES.has(item.type))
    .sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)) || a.title.localeCompare(b.title, 'fr'));
}

function recalcStructuralOffsets() {
  let cursor = 0;
  getStructuralItems().forEach((item, index) => {
    item.order = index;
    if (!item.isLocked || item.startOffsetDays === undefined) {
      item.startOffsetDays = cursor;
    }
    cursor = Math.max(cursor, Number(item.startOffsetDays || 0) + Number(item.estimatedDurationDays || 1));
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
      const matchesLinked = courseMatchesSelectedFormation(course);
      const courseFormation = findCourseFormation(course);
      const isShared = Boolean(course.sharedCourse || course.isSharedCourse || normalizeArray(course.linkedFormationIds).length);
      if (source === 'linked' && !matchesLinked) return false;
      if (source === 'shared' && !isShared) return false;
      if (source === 'other' && (matchesLinked || !courseFormation)) return false;
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
  const badges = [
    item.isRequired ? 'O' : '',
    item.isBlocking || item.isBlockingPrerequisite ? 'B' : '',
    item.isLocked ? 'L' : '',
    item.isSharedCourse ? '↗' : ''
  ].filter(Boolean).map((badge) => `<span>${escapeHtml(badge)}</span>`).join('');
  const subtitle = `${getItemPeriodLabel(item)} · ${Number(item.estimatedDurationDays || 1)} j${item.blockTitle ? ` · ${item.blockTitle}` : ''}${item.isSharedCourse ? ' · Accès cursus' : ''}`;

  return `
    <button type="button" class="sbi-cursus-block type-${escapeHtml(item.type)} ${selected ? 'is-selected' : ''}" data-action="select-item" data-id="${escapeHtml(item.id)}" style="--start-week:${start};--span-week:${span};">
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
  if (timelineItems.some((item) => PARALLEL_TYPES.has(item.type) && !item.relatedCourseId)) warnings.push('Éléments parallèles sans cours lié');

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
          <input type="number" min="1" max="99" data-field="startWeek" value="${startWeek}" ${STRUCTURAL_TYPES.has(item.type) && !item.isLocked ? 'disabled' : ''}>
          <small>${STRUCTURAL_TYPES.has(item.type) && !item.isLocked ? 'Calculée par l’ordre du cursus.' : 'Placement manuel relatif.'}</small>
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
      <label class="sbi-cursus-check-row">Dates / position verrouillées <input type="checkbox" data-field="isLocked" ${item.isLocked ? 'checked' : ''}></label>
      <label class="sbi-cursus-check-row">Preuve Qualiopi <input type="checkbox" data-field="isQualiopiEvidence" ${item.isQualiopiEvidence ? 'checked' : ''}></label>
      <div class="sbi-cursus-form-row">
        <label>Notes</label>
        <textarea rows="4" data-field="notes">${escapeHtml(item.notes || '')}</textarea>
      </div>
      <div class="sbi-cursus-inline-actions">
        <button type="button" data-action="move-left">← Déplacer</button>
        <button type="button" data-action="move-right">Déplacer →</button>
        ${STRUCTURAL_TYPES.has(item.type) ? '<button type="button" data-action="order-up">↑ Ordre</button><button type="button" data-action="order-down">↓ Ordre</button>' : ''}
        <button type="button" data-action="delete-item" class="is-danger">Supprimer</button>
      </div>
    </div>
  `;
}

function renderAll({ recalc = false } = {}) {
  if (recalc) recalcStructuralOffsets();
  const weeks = getWeeksCount();
  renderRuler(weeks);
  renderTracks();
  renderToolList();
  renderInspector();
  renderStats();
  renderTemplateSelect();
  if (dom.app) dom.app.classList.toggle('show-grid', Boolean(dom.gridToggle?.checked));
  if (dom.activeStatus) {
    const template = templates.find((item) => item.id === activeTemplateId);
    const status = template?.status || 'draft';
    dom.activeStatus.textContent = status === 'active' ? 'Actif' : status === 'archived' ? 'Archivé' : 'Brouillon';
    dom.activeStatus.style.borderColor = status === 'active' ? 'rgba(64,223,128,.32)' : status === 'archived' ? 'rgba(255,255,255,.18)' : 'rgba(42,87,255,.28)';
  }
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
    priorityLevel: course.priorityLevel || 'normal',
    isSharedCourse: sourceFormation && context.id && sourceFormation.id !== context.id,
    grantedByCurriculum: true,
    order: getStructuralItems().length
  });
  timelineItems.push(item);
  selectedItemId = item.id;
  setStatus(`Cours « ${item.title} » ajouté.`, 'success');
  renderAll({ recalc: true });
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
    startOffsetDays: STRUCTURAL_TYPES.has(type) ? 0 : Math.max(0, getTimelineDurationDays() - getDefaultDuration(type)),
    formationId: context.id,
    formationName: context.name,
    displayContextFormationId: context.id,
    displayContextFormationName: context.name,
    order: STRUCTURAL_TYPES.has(type) ? structuralCount : timelineItems.length
  });
  timelineItems.push(item);
  selectedItemId = item.id;
  renderAll({ recalc: true });
}

function updateSelectedField(field, value, isCheckbox = false) {
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item) return;
  const finalValue = isCheckbox ? Boolean(value) : value;

  if (field === 'title') item.title = clean(finalValue, 180) || getTypeLabel(item.type);
  if (field === 'estimatedDurationDays') item.estimatedDurationDays = Math.max(1, Number(finalValue || 1));
  if (field === 'startWeek') {
    item.startOffsetDays = Math.max(0, (Number(finalValue || 1) - 1) * 7);
    item.isLocked = true;
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
  if (field === 'notes') item.notes = clean(finalValue, 600);

  renderAll({ recalc: true });
}

function moveSelected(deltaDays) {
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item) return;
  item.startOffsetDays = Math.max(0, Number(item.startOffsetDays || 0) + deltaDays);
  item.isLocked = true;
  renderAll({ recalc: true });
}

function reorderSelected(delta) {
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item || !STRUCTURAL_TYPES.has(item.type)) return;
  const structural = getStructuralItems();
  const index = structural.findIndex((entry) => entry.id === item.id);
  const swap = structural[index + delta];
  if (!swap) return;
  const oldOrder = item.order;
  item.order = swap.order;
  swap.order = oldOrder;
  renderAll({ recalc: true });
}

function deleteSelectedItem() {
  const item = timelineItems.find((entry) => entry.id === selectedItemId);
  if (!item) return;
  if (!window.confirm(`Supprimer « ${item.title} » du cursus ?`)) return;
  timelineItems = timelineItems.filter((entry) => entry.id !== selectedItemId);
  selectedItemId = '';
  renderAll({ recalc: true });
}

function resetEditor() {
  activeTemplateId = '';
  selectedItemId = '';
  pendingDeleteTemplateId = '';
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
  if (template.formationId && formations.some((formation) => formation.id === template.formationId)) {
    dom.formation.value = template.formationId;
  }
  timelineItems = Array.isArray(template.items) ? template.items.map(normalizeItem) : [];
  if (dom.title) dom.title.value = template.title || '';
  setStatus(`Cursus « ${template.title || 'sans nom'} » chargé.`, 'success');
  renderAll({ recalc: true });
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
  snap.forEach((docSnap) => courses.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
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
    setStatus('Timeline recalculée.', 'success');
  });
  dom.deleteBtn?.addEventListener('click', deleteTemplate);
  dom.search?.addEventListener('input', renderToolList);
  dom.sourceFilter?.addEventListener('change', renderToolList);
  dom.clearSelection?.addEventListener('click', () => {
    selectedItemId = '';
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
    const block = event.target.closest?.('[data-action="select-item"][data-id]');
    if (!block) return;
    selectedItemId = block.dataset.id || '';
    renderAll();
  });

  dom.inspector?.addEventListener('input', (event) => {
    const target = event.target.closest?.('[data-field]');
    if (!target) return;
    updateSelectedField(target.dataset.field, target.type === 'checkbox' ? target.checked : target.value, target.type === 'checkbox');
  });

  dom.inspector?.addEventListener('change', (event) => {
    const target = event.target.closest?.('[data-field]');
    if (!target) return;
    updateSelectedField(target.dataset.field, target.type === 'checkbox' ? target.checked : target.value, target.type === 'checkbox');
  });

  dom.inspector?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'move-left') moveSelected(-7);
    if (action === 'move-right') moveSelected(7);
    if (action === 'order-up') reorderSelected(-1);
    if (action === 'order-down') reorderSelected(1);
    if (action === 'delete-item') deleteSelectedItem();
  });
}

async function initialiseData() {
  await Promise.all([loadFormations(), loadCourses(), loadTemplates()]);
  renderAll({ recalc: true });
}

export function mountAdminCursus() {
  if (mounted && document.getElementById('view-cursus')) return window.SBI_ADMIN_CURSUS_UNMOUNT || (() => {});
  if (!document.getElementById('view-cursus')) return () => {};

  mounted = true;
  cacheDom();
  bindEvents();
  renderAll({ recalc: true });

  unsubscribeAuth?.();
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
