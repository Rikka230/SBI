/**
 * SBI 8.0P.167.105.1-GPT2.1
 * Promotions cursus selector + prorata application.
 *
 * Base 8.0P.167.104.1 validée :
 * - pas de MutationObserver agressif ;
 * - chargement de curriculumTemplates au clic ;
 * - affichage et application des cursus sans freeze.
 *
 * Règle métier 8.0P.167.105.1 :
 * - Cursus = modèle pédagogique relatif ;
 * - Promotion = calendrier réel d'application ;
 * - la durée effective du cursus vient du dernier bloc pédagogique placé ;
 * - les semaines affichées mais vides ne prolongent pas le cursus ;
 * - si date début + date fin promotion existent, le coursePlan est daté au prorata dans cette plage ;
 * - si aucune date fin n'existe, une date fin est proposée depuis la durée effective du cursus.
 */

import { auth, db } from '/js/firebase-init.js';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let templates = [];
let loadingPromise = null;
let selectedTemplate = null;
let selectedPlan = [];
let lastRenderSignature = '';

function $(id) {
  return document.getElementById(id);
}

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getView() {
  return $('view-promotions');
}

function getSelectedFormation() {
  const select = $('promotion-formation');
  const formationId = select?.value || '';
  const selectedOption = select?.selectedOptions?.[0] || null;
  const formationName = formationId ? clean(selectedOption?.textContent || '', 180) : '';
  return { formationId, formationName };
}

function setText(id, value = '') {
  const node = $(id);
  if (node) node.textContent = value;
}

function setFormStatus(message = '', tone = 'muted') {
  const node = $('promotion-form-status');
  if (!node) return;
  node.textContent = message;
  node.style.color = tone === 'success'
    ? '#2ed573'
    : tone === 'error'
      ? '#ff4a4a'
      : 'var(--text-muted, #9ca3af)';
}

function setTemplateStatus(message = '') {
  const node = $('promotion-curriculum-template-status');
  if (node) node.textContent = message;
}

function formatDateFr(dateString = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return 'Non renseignée';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
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

function getItemType(item = {}) {
  const rawType = item.type || item.itemType || '';
  if (rawType === 'course') return item.courseId ? 'real_course' : 'placeholder_course';
  if (rawType === 'real_course') return 'real_course';
  if (rawType) return rawType;
  return item.courseId ? 'real_course' : 'placeholder_course';
}

function getPlanItemKey(item = {}) {
  return item.courseId || item.itemId || item.id || '';
}

function makePlanningItemId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDurationDays(item = {}) {
  return Math.max(1, Math.round(toNumber(
    item.relativeDurationDays || item.modelDurationDays || item.estimatedDurationDays || item.durationDays || item.estimatedDurationMinDays || 7,
    7
  )));
}

function isStructuralType(type = '') {
  return ['real_course', 'course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'].includes(type);
}

function isParallelType(type = '') {
  return ['assignment', 'exam', 'evaluation', 'live_session', 'workshop'].includes(type);
}

function isPedagogicalBlockType(type = '') {
  return [...['real_course', 'course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'], ...['assignment', 'exam', 'evaluation', 'live_session', 'workshop']].includes(type);
}

function getExplicitStartOffset(item = {}) {
  const candidates = [
    item.relativeStartOffsetDays,
    item.modelStartOffsetDays,
    item.startOffsetDays,
    item.offsetDays,
    item.startDays,
    item.startDay
  ];
  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number) && number >= 0) return Math.round(number);
  }
  return null;
}

function getEffectiveModelDurationDays(plan = []) {
  if (!Array.isArray(plan) || !plan.length) return 0;
  const ends = plan
    .filter((item) => isPedagogicalBlockType(getItemType(item)))
    .map((item) => {
      const start = Math.max(0, Number(item.relativeStartOffsetDays ?? item.modelStartOffsetDays ?? item.startOffsetDays ?? 0) || 0);
      return start + getDurationDays(item);
    });
  return Math.max(0, ...ends);
}

function getEffectiveModelWeeks(plan = []) {
  return Math.max(1, Math.ceil(Math.max(1, getEffectiveModelDurationDays(plan)) / 7));
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

function getLayerForType(type = '') {
  if (['real_course', 'course', 'placeholder_course'].includes(type)) return 'courses';
  if (type === 'assignment') return 'assignments';
  if (['exam', 'evaluation'].includes(type)) return 'assessments';
  if (['live_session', 'workshop'].includes(type)) return 'lives';
  return 'buffers';
}

function templateMatchesFormation(template = {}, formation = getSelectedFormation()) {
  if (!formation.formationId && !formation.formationName) return false;

  const templateRefs = [
    template.formationId,
    template.formationName,
    template.displayContextFormationId,
    template.displayContextFormationName,
    template.sourceFormationId,
    template.sourceFormationName
  ].map(normalize).filter(Boolean);

  const probes = [formation.formationId, formation.formationName].map(normalize).filter(Boolean);
  return probes.some((probe) => templateRefs.includes(probe));
}

function sortTemplatesForFormation(rows = [], formation = getSelectedFormation()) {
  return [...rows]
    .filter((template) => (template.status || 'draft') !== 'archived')
    .sort((a, b) => {
      const aMatch = templateMatchesFormation(a, formation) ? 0 : 1;
      const bMatch = templateMatchesFormation(b, formation) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' });
    });
}

function getVisibleTemplates() {
  const formation = getSelectedFormation();
  const rows = sortTemplatesForFormation(templates, formation);
  const matching = rows.filter((template) => templateMatchesFormation(template, formation));
  return matching.length ? matching : rows;
}

async function loadTemplates({ force = false } = {}) {
  if (loadingPromise) return loadingPromise;
  if (!force && templates.length) return templates;

  loadingPromise = getDocs(collection(db, 'curriculumTemplates'))
    .then((snap) => {
      templates = [];
      snap.forEach((docSnap) => templates.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
      return templates;
    })
    .catch((error) => {
      console.warn('[SBI Promotions] Bridge cursus : chargement impossible', error);
      templates = [];
      setTemplateStatus('Chargement des cursus impossible.');
      return templates;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

function buildPlanFromTemplate(template = {}) {
  const sourceItems = Array.isArray(template.items) ? template.items : [];
  const formation = getSelectedFormation();
  let structuralCursor = 0;
  const knownStructuralOffsets = new Map();

  const ordered = sourceItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => toNumber(a.item.order, a.index) - toNumber(b.item.order, b.index));

  return ordered.map(({ item, index }) => {
    const type = getItemType(item);
    const isCourse = type === 'real_course' || type === 'course';
    const fallbackTitle = isCourse ? 'Cours sans titre' : getTypeLabel(type);
    const title = clean(item.courseTitle || item.title || item.label || fallbackTitle, 180);
    const duration = Math.max(1, Math.round(toNumber(
      item.relativeDurationDays || item.modelDurationDays || item.estimatedDurationDays || item.durationDays || item.estimatedDurationMinDays || 7,
      7
    )));
    const explicitStart = getExplicitStartOffset(item);
    let relativeStart = 0;

    if (explicitStart !== null) {
      relativeStart = explicitStart;
    } else if (isStructuralType(type)) {
      relativeStart = structuralCursor;
    } else if (item.relatedCourseId && knownStructuralOffsets.has(item.relatedCourseId)) {
      relativeStart = knownStructuralOffsets.get(item.relatedCourseId);
    } else {
      relativeStart = Math.max(0, structuralCursor - duration);
    }

    if (isStructuralType(type)) {
      structuralCursor = Math.max(structuralCursor, relativeStart + duration);
    }

    const key = isCourse ? clean(item.courseId || '', 180) : clean(item.itemId || item.id || '', 180);
    if (key) knownStructuralOffsets.set(key, relativeStart);

    return {
      type: type === 'course' ? 'real_course' : type,
      layer: item.layer || getLayerForType(type),
      itemId: isCourse ? '' : (item.itemId || item.id || makePlanningItemId(type)),
      courseId: isCourse ? clean(item.courseId || '', 180) : '',
      courseTitle: title,
      title,
      courseStatus: clean(item.courseStatus || item.status || (isCourse ? 'Cours' : getTypeLabel(type)), 80),
      blockTitle: clean(item.blockTitle || item.blockName || '', 120),
      durationDays: duration,
      estimatedDurationDays: duration,
      relativeDurationDays: duration,
      modelDurationDays: duration,
      startOffsetDays: relativeStart,
      relativeStartOffsetDays: relativeStart,
      modelStartOffsetDays: relativeStart,
      recommendedStartAt: '',
      recommendedEndAt: '',
      deadlineAt: '',
      dueAt: '',
      relatedCourseId: clean(item.relatedCourseId || '', 160),
      relatedCourseTitle: clean(item.relatedCourseTitle || '', 180),
      priorityLevel: ['normal', 'high', 'urgent'].includes(item.priorityLevel) ? item.priorityLevel : 'normal',
      isRequired: item.isRequired !== false,
      isLocked: false,
      isBlockingPrerequisite: item.isBlockingPrerequisite === true || item.isBlocking === true,
      isBlocking: item.isBlocking === true || item.isBlockingPrerequisite === true,
      isQualiopiEvidence: item.isQualiopiEvidence === true,
      sourceFormationId: clean(item.sourceFormationId || template.formationId || '', 160),
      sourceFormationName: clean(item.sourceFormationName || template.formationName || '', 180),
      displayContextFormationId: clean(formation.formationId || item.displayContextFormationId || '', 160),
      displayContextFormationName: clean(formation.formationName || item.displayContextFormationName || '', 180),
      isSharedCourse: item.isSharedCourse === true,
      grantedByCurriculum: item.grantedByCurriculum === false ? false : true,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      source: 'curriculum-template-applied-prorata-v1'
    };
  }).sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
    .map((item, index) => ({ ...item, order: index }));
}

function buildPreview(plan = selectedPlan, template = selectedTemplate) {
  const startDate = $('promotion-start-date')?.value || '';
  const manualEndDate = $('promotion-end-date')?.value || '';
  const modelDurationDays = Math.max(1, getEffectiveModelDurationDays(plan));
  const modelWeeks = Math.max(1, Math.ceil(modelDurationDays / 7));
  const targetDurationDays = startDate && manualEndDate
    ? diffDaysInclusive(startDate, manualEndDate)
    : modelDurationDays;
  const safeTargetDurationDays = Math.max(1, targetDurationDays || modelDurationDays);
  const targetWeeks = Math.max(1, Math.ceil(safeTargetDurationDays / 7));
  const proposedEndDate = startDate ? addDaysToDateString(startDate, modelDurationDays - 1) : '';
  const effectiveEndDate = startDate
    ? (manualEndDate && targetDurationDays > 0 ? manualEndDate : proposedEndDate)
    : '';
  const scale = modelDurationDays > 0 ? safeTargetDurationDays / modelDurationDays : 1;

  return {
    startDate,
    manualEndDate,
    endDate: effectiveEndDate,
    proposedEndDate,
    modelDurationDays,
    modelWeeks,
    targetDurationDays: safeTargetDurationDays,
    targetWeeks,
    scale,
    mode: manualEndDate && startDate && targetDurationDays > 0 ? 'prorata' : 'proposal',
    items: plan.length,
    templateTitle: template?.title || ''
  };
}

function getPreviewLabel(preview = buildPreview(selectedPlan)) {
  const model = `modèle ${preview.modelDurationDays} j / ${preview.modelWeeks} sem.`;
  const target = `promotion ${preview.targetDurationDays} j / ${preview.targetWeeks} sem.`;
  if (!preview.startDate) return `${preview.items} élément${preview.items > 1 ? 's' : ''} · ${model} · renseignez une date de début`;
  if (preview.mode === 'prorata') return `${preview.items} élément${preview.items > 1 ? 's' : ''} · ${model} → ${target} · ${formatDateFr(preview.startDate)} → ${formatDateFr(preview.endDate)}`;
  return `${preview.items} élément${preview.items > 1 ? 's' : ''} · ${model} · fin proposée ${formatDateFr(preview.proposedEndDate)}`;
}

function recalculatePlanDates(plan = selectedPlan) {
  const startDate = $('promotion-start-date')?.value || '';
  if (!startDate || !Array.isArray(plan) || !plan.length) return plan;

  const preview = buildPreview(plan, selectedTemplate);
  const modelDuration = Math.max(1, preview.modelDurationDays);
  const targetDuration = Math.max(1, preview.targetDurationDays || modelDuration);
  const scale = targetDuration / modelDuration;

  const structuralMap = new Map();
  const byKey = new Map();

  const nextPlan = plan.map((item) => {
    const key = getPlanItemKey(item);
    const rawStart = Math.max(0, Number(item.relativeStartOffsetDays ?? item.modelStartOffsetDays ?? item.startOffsetDays ?? 0) || 0);
    const rawDuration = getDurationDays(item);
    const scaledStartOffset = Math.max(0, Math.round(rawStart * scale));
    const scaledEndExclusive = Math.max(scaledStartOffset + 1, Math.round((rawStart + rawDuration) * scale));
    const scaledDuration = Math.max(1, scaledEndExclusive - scaledStartOffset);
    const start = addDaysToDateString(startDate, scaledStartOffset) || startDate;
    const end = addDaysToDateString(start, scaledDuration - 1) || start;

    const next = {
      ...item,
      durationDays: scaledDuration,
      recommendedStartAt: start,
      recommendedEndAt: end,
      deadlineAt: item.deadlineAt || item.dueAt || end,
      dueAt: item.dueAt || item.deadlineAt || end,
      prorataScale: Number(scale.toFixed(6)),
      modelStartOffsetDays: rawStart,
      modelDurationDays: rawDuration,
      targetStartOffsetDays: scaledStartOffset,
      targetDurationDays: scaledDuration
    };

    byKey.set(key, next);
    if (isStructuralType(getItemType(next))) {
      structuralMap.set(key, next);
      if (next.courseId) structuralMap.set(next.courseId, next);
    }
    return next;
  });

  return nextPlan.map((item) => {
    if (!isParallelType(getItemType(item))) return item;
    const related = item.relatedCourseId ? structuralMap.get(item.relatedCourseId) : null;
    if (!related) return item;
    return {
      ...item,
      relatedCourseTitle: related.courseTitle || related.title || item.relatedCourseTitle || '',
      deadlineAt: item.deadlineAt || item.dueAt || related.recommendedEndAt || item.recommendedEndAt,
      dueAt: item.dueAt || item.deadlineAt || related.recommendedEndAt || item.recommendedEndAt
    };
  });
}

function syncEndDateFromPreview({ force = false } = {}) {
  const endInput = $('promotion-end-date');
  if (!endInput) return;

  const preview = buildPreview(selectedPlan, selectedTemplate);
  if (!preview.proposedEndDate) return;

  const canWrite = force || !endInput.value || endInput.dataset.sbiAutoCursusEnd === 'true';
  if (!canWrite) return;

  endInput.value = preview.proposedEndDate;
  endInput.dataset.sbiAutoCursusEnd = 'true';
}

function refreshSelectedPreview({ forceEndDate = false } = {}) {
  if (!selectedTemplate) return;

  syncEndDateFromPreview({ force: forceEndDate });
  selectedPlan = recalculatePlanDates(selectedPlan);

  const preview = buildPreview(selectedPlan, selectedTemplate);
  setText('promotion-planning-summary-title', selectedTemplate.title || 'Cursus sélectionné');
  setText('promotion-planning-summary-meta', `${getPreviewLabel(preview)} · sauvegardez la promotion pour confirmer.`);

  const footer = $('promotion-planning-footer-status');
  if (footer) footer.textContent = `Aperçu promotion : ${getPreviewLabel(preview)}.`;
}

function renderTemplateList() {
  const list = $('promotion-curriculum-template-list');
  const status = $('promotion-curriculum-template-status');
  if (!getView() || !list || !status) return;

  const formation = getSelectedFormation();
  if (!formation.formationId) {
    status.textContent = 'Sélectionnez une formation liée pour afficher les cursus disponibles.';
    list.innerHTML = '<div class="sbi-promotions-empty">Aucune formation liée.</div>';
    lastRenderSignature = '';
    return;
  }

  const rows = getVisibleTemplates();
  const matchingCount = rows.filter((template) => templateMatchesFormation(template, formation)).length;
  const startDate = $('promotion-start-date')?.value || '';
  const endDate = $('promotion-end-date')?.value || '';
  const signature = JSON.stringify({
    formationId: formation.formationId,
    startDate,
    endDate,
    selected: selectedTemplate?.id || '',
    rows: rows.map((template) => [template.id, template.title, template.updatedAt?.seconds || template.updatedAt || ''])
  });

  if (signature === lastRenderSignature && list.dataset.sbiBridgeRendered === 'true') return;
  lastRenderSignature = signature;
  list.dataset.sbiBridgeRendered = 'true';

  status.textContent = rows.length
    ? `${rows.length} cursus disponible${rows.length > 1 ? 's' : ''}${matchingCount ? ` · ${matchingCount} lié${matchingCount > 1 ? 's' : ''} à ${formation.formationName || 'cette formation'}` : ' · affichage de secours tous cursus non archivés'}.`
    : 'Aucun cursus sauvegardé disponible.';

  if (!rows.length) {
    list.innerHTML = '<div class="sbi-promotions-empty">Aucun cursus disponible. Créez-le depuis l’onglet Cursus, puis revenez le sélectionner ici.</div>';
    return;
  }

  list.innerHTML = rows.map((template) => {
    const plan = buildPlanFromTemplate(template);
    const preview = buildPreview(plan, template);
    const isLinked = templateMatchesFormation(template, formation);
    const isActive = selectedTemplate?.id === template.id;
    const targetBadge = preview.startDate
      ? preview.mode === 'prorata'
        ? `${formatDateFr(preview.startDate)} → ${formatDateFr(preview.endDate)}`
        : `Fin proposée ${formatDateFr(preview.proposedEndDate)}`
      : 'Date début à renseigner';

    return `
      <article class="sbi-curriculum-template-row ${isActive ? 'is-active-template' : ''}" data-sbi-bridge-template-id="${escapeHtml(template.id)}">
        <div>
          <strong>${escapeHtml(template.title || 'Cursus sans nom')}</strong>
          <small>
            <span>${escapeHtml(template.formationName || 'Formation non renseignée')}</span>
            <span>${preview.items} élément${preview.items > 1 ? 's' : ''}</span>
            <span>Modèle : ${preview.modelDurationDays} j / ${preview.modelWeeks} sem.</span>
            <span>${preview.mode === 'prorata' ? `Prorata : ${preview.targetWeeks} sem.` : 'Durée modèle'}</span>
            <span>${escapeHtml(targetBadge)}</span>
            <span>${isLinked ? 'Formation liée' : 'Autre formation / secours'}</span>
          </small>
        </div>
        <div class="sbi-curriculum-template-actions">
          <button type="button" data-sbi-bridge-apply-template="${escapeHtml(template.id)}">Appliquer</button>
        </div>
      </article>
    `;
  }).join('');
}

async function refreshAndRenderTemplates({ force = false } = {}) {
  if (!getView()) return;
  setTemplateStatus('Chargement des cursus...');
  await loadTemplates({ force });
  renderTemplateList();
}

function scheduleTemplateRender() {
  window.setTimeout(() => refreshAndRenderTemplates({ force: true }), 80);
  window.setTimeout(() => renderTemplateList(), 260);
  window.setTimeout(() => renderTemplateList(), 700);
}

function closeTemplateModal() {
  const modal = $('promotion-curriculum-template-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function applyTemplate(templateId = '') {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  selectedTemplate = template;
  selectedPlan = buildPlanFromTemplate(template);
  syncEndDateFromPreview({ force: false });
  selectedPlan = recalculatePlanDates(selectedPlan);

  const titleInput = $('promotion-curriculum-title');
  if (titleInput) titleInput.value = template.title || '';

  refreshSelectedPreview({ forceEndDate: false });

  const preview = buildPreview(selectedPlan, selectedTemplate);
  setFormStatus(`Cursus « ${template.title || 'sans nom'} » sélectionné. ${getPreviewLabel(preview)}. Sauvegardez la promotion.`, 'success');
  closeTemplateModal();
}

function getPromotionPayload() {
  const name = clean($('promotion-name')?.value || '', 120);
  if (!name) throw new Error('Le nom de la promotion est obligatoire.');

  const formation = getSelectedFormation();
  const title = clean($('promotion-curriculum-title')?.value || selectedTemplate?.title || formation.formationName || name, 140);
  syncEndDateFromPreview({ force: false });
  selectedPlan = recalculatePlanDates(selectedPlan);

  const coursePlan = selectedPlan.length ? selectedPlan : [];
  const preview = buildPreview(coursePlan, selectedTemplate);
  const user = auth.currentUser;

  return {
    name,
    slug: slugify(name),
    status: $('promotion-status')?.value === 'archived' ? 'archived' : 'active',
    formationId: formation.formationId,
    formationName: formation.formationName,
    startDate: $('promotion-start-date')?.value || '',
    endDate: $('promotion-end-date')?.value || '',
    curriculumId: slugify(title || name),
    curriculumTitle: title,
    curriculumTemplateId: selectedTemplate?.id || '',
    coursePlan,
    coursePlanVersion: 'promotion-course-plan-prorata-v1',
    coursePlanCount: coursePlan.length,
    coursePlanPreview: {
      ...preview,
      source: 'curriculum-prorata-v1'
    },
    modelDurationDays: preview.modelDurationDays,
    modelWeeks: preview.modelWeeks,
    promotionDurationDays: preview.targetDurationDays,
    promotionWeeks: preview.targetWeeks,
    prorataScale: Number(preview.scale.toFixed(6)),
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || '',
    updatedByEmail: user?.email || ''
  };
}

async function savePromotionWithSelectedTemplate(event) {
  if (!selectedTemplate) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const submit = $('promotion-submit-btn');
  if (submit) {
    submit.disabled = true;
    submit.style.opacity = '0.65';
  }

  setFormStatus('Sauvegarde de la promotion avec le cursus proratisé...');

  try {
    const payload = getPromotionPayload();
    const editingId = $('promotion-id')?.value || '';
    const user = auth.currentUser;

    if (editingId) {
      await setDoc(doc(db, 'promotions', editingId), payload, { merge: true });
      setFormStatus('Promotion mise à jour avec le cursus adapté au calendrier.', 'success');
    } else {
      await addDoc(collection(db, 'promotions'), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || '',
        createdByEmail: user?.email || ''
      });
      setFormStatus('Promotion créée avec le cursus adapté au calendrier.', 'success');
    }
  } catch (error) {
    console.warn('[SBI Promotions] Bridge cursus : sauvegarde impossible', error);
    setFormStatus(error?.message || 'Sauvegarde impossible.', 'error');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.style.opacity = '';
    }
  }
}

function clearSelection() {
  selectedTemplate = null;
  selectedPlan = [];
  lastRenderSignature = '';
}

function bindEvents() {
  if (document.body.dataset.sbiPromotionsCursusProrataV1051 === 'true') return;
  document.body.dataset.sbiPromotionsCursusProrataV1051 = 'true';

  document.addEventListener('click', (event) => {
    if (!getView()) return;

    const open = event.target.closest?.('#promotion-planning-open-btn, #promotion-curriculum-load-btn');
    if (open) {
      lastRenderSignature = '';
      scheduleTemplateRender();
      return;
    }

    const apply = event.target.closest?.('[data-sbi-bridge-apply-template]');
    if (apply) {
      event.preventDefault();
      event.stopPropagation();
      applyTemplate(apply.dataset.sbiBridgeApplyTemplate || '');
      return;
    }

    const edit = event.target.closest?.('button[data-action="edit"][data-id]');
    if (edit) {
      clearSelection();
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (!getView()) return;
    if (event.target?.id !== 'promotion-form') return;
    savePromotionWithSelectedTemplate(event);
  }, true);

  document.addEventListener('change', (event) => {
    if (!getView()) return;

    if (event.target?.id === 'promotion-formation') {
      clearSelection();
      if ($('promotion-curriculum-template-modal')?.classList.contains('is-open')) {
        scheduleTemplateRender();
      }
      return;
    }

    if (event.target?.id === 'promotion-start-date') {
      if (selectedTemplate) refreshSelectedPreview({ forceEndDate: false });
      if ($('promotion-curriculum-template-modal')?.classList.contains('is-open')) {
        lastRenderSignature = '';
        renderTemplateList();
      }
      return;
    }

    if (event.target?.id === 'promotion-end-date') {
      event.target.dataset.sbiAutoCursusEnd = 'false';
      if (selectedTemplate) refreshSelectedPreview({ forceEndDate: false });
      if ($('promotion-curriculum-template-modal')?.classList.contains('is-open')) {
        lastRenderSignature = '';
        renderTemplateList();
      }
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (!getView()) return;
    if (event.target?.id === 'promotion-end-date') {
      event.target.dataset.sbiAutoCursusEnd = 'false';
      if (selectedTemplate) refreshSelectedPreview({ forceEndDate: false });
    }
  }, true);
}

export function initAdminPromotionsCursusSelectorFix() {
  if (installed) {
    bindEvents();
    return;
  }

  installed = true;
  bindEvents();

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(bindEvents, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(bindEvents, 80));
}

initAdminPromotionsCursusSelectorFix();
