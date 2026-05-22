/**
 * SBI 8.0P.167.186
 * Cursus → Promotions automatic coursePlan sync.
 *
 * Périmètre :
 * - déclenché après sauvegarde d'un cursus depuis /admin/admin-cursus.html ;
 * - relit le curriculumTemplate sauvegardé ;
 * - met à jour les promotions actives liées par curriculumTemplateId ;
 * - recalcule les dates au prorata selon startDate / endDate de chaque promotion ;
 * - aucune modification DnD / verrou / semaines / élèves.
 */

import { auth, db } from '/js/firebase-init.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let syncTimer = 0;
let syncRunning = false;

const VERSION = '8.0P.167.114';
const STRUCTURAL_TYPES = ['real_course', 'course', 'placeholder_course', 'buffer_period', 'revision_period', 'catchup_period'];
const PARALLEL_TYPES = ['assignment', 'exam', 'evaluation', 'live_session', 'workshop'];

function getRoot() {
  return document.getElementById('view-cursus');
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

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getTemplateId() {
  return document.getElementById('cursus-template-select')?.value || '';
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById('cursus-save-status');
  if (!status || !message) return;
  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function getSaveStatusText() {
  return String(document.getElementById('cursus-save-status')?.textContent || '').toLowerCase();
}

function shouldSkipBecauseSaveFailed() {
  const text = getSaveStatusText();
  return text.includes('impossible') || text.includes('ajoutez') || text.includes('erreur');
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

function isStructuralType(type = '') {
  return STRUCTURAL_TYPES.includes(type);
}

function isParallelType(type = '') {
  return PARALLEL_TYPES.includes(type);
}

function isPedagogicalType(type = '') {
  return isStructuralType(type) || isParallelType(type);
}

function getLayerForType(type = '') {
  if (['real_course', 'course', 'placeholder_course'].includes(type)) return 'courses';
  if (type === 'assignment') return 'assignments';
  if (['exam', 'evaluation'].includes(type)) return 'assessments';
  if (['live_session', 'workshop'].includes(type)) return 'lives';
  return 'buffers';
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

function makeStableItemId(templateId = '', type = 'item', index = 0) {
  return `${type}-${templateId || 'template'}-${index}`.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120);
}

function getPlanItemKey(item = {}) {
  return item.courseId || item.itemId || item.id || '';
}

function getDurationDays(item = {}) {
  const type = getItemType(item);
  const fallback = isParallelType(type) ? (type === 'assignment' ? 3 : 1) : 7;
  return Math.max(1, Math.round(toNumber(
    item.relativeDurationDays ||
    item.modelDurationDays ||
    item.estimatedDurationDays ||
    item.durationDays ||
    item.estimatedDurationMinDays ||
    fallback,
    fallback
  )));
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

function buildPlanFromTemplate(template = {}) {
  const sourceItems = Array.isArray(template.items) ? template.items : [];
  let structuralCursor = 0;
  const knownStructuralOffsets = new Map();

  const ordered = sourceItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => toNumber(a.item.order, a.index) - toNumber(b.item.order, b.index));

  return ordered.map(({ item, index }) => {
    const type = getItemType(item);
    const isCourse = type === 'real_course' || type === 'course';
    const duration = getDurationDays(item);
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

    const key = isCourse ? clean(item.courseId || '', 180) : clean(item.itemId || item.id || makeStableItemId(template.id, type, index), 180);
    if (key) knownStructuralOffsets.set(key, relativeStart);
    if (item.courseId) knownStructuralOffsets.set(item.courseId, relativeStart);

    const title = clean(item.courseTitle || item.title || item.label || (isCourse ? 'Cours sans titre' : getTypeLabel(type)), 180);

    return {
      type: type === 'course' ? 'real_course' : type,
      layer: item.layer || getLayerForType(type),
      itemId: isCourse ? '' : key,
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
      replacedPlaceholderId: clean(item.replacedPlaceholderId || '', 180),
      replacementSource: clean(item.replacementSource || '', 120),
      isRequired: item.isRequired !== false,
      isLocked: false,
      isBlockingPrerequisite: item.isBlockingPrerequisite === true || item.isBlocking === true,
      isBlocking: item.isBlocking === true || item.isBlockingPrerequisite === true,
      isQualiopiEvidence: item.isQualiopiEvidence === true,
      sourceFormationId: clean(item.sourceFormationId || template.formationId || '', 160),
      sourceFormationName: clean(item.sourceFormationName || template.formationName || '', 180),
      displayContextFormationId: clean(item.displayContextFormationId || '', 160),
      displayContextFormationName: clean(item.displayContextFormationName || '', 180),
      isSharedCourse: item.isSharedCourse === true,
      grantedByCurriculum: item.grantedByCurriculum === false ? false : true,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      source: (item.replacedPlaceholderId || String(item.replacementSource || '').includes('placeholder-replace'))
        ? 'placeholder-replace-v2'
        : 'curriculum-template-auto-sync-v1'
    };
  }).sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
    .map((item, index) => ({ ...item, order: index }));
}

function getEffectiveModelDurationDays(plan = [], template = {}) {
  const explicit = Number(template.effectiveDurationDays || template.durationDays || 0);
  const ends = Array.isArray(plan)
    ? plan
      .filter((item) => isPedagogicalType(getItemType(item)))
      .map((item) => Math.max(0, Number(item.relativeStartOffsetDays ?? item.modelStartOffsetDays ?? item.startOffsetDays ?? 0) || 0) + getDurationDays(item))
    : [];
  return Math.max(0, explicit, ...ends);
}

function buildPreview(plan = [], template = {}, promotion = {}) {
  const startDate = promotion.startDate || '';
  const manualEndDate = promotion.endDate || '';
  const modelDurationDays = Math.max(1, getEffectiveModelDurationDays(plan, template));
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
    templateTitle: template.title || '',
    source: 'curriculum-auto-sync-v1'
  };
}

function mapExistingPlan(plan = []) {
  const map = new Map();
  if (!Array.isArray(plan)) return map;
  plan.forEach((item) => {
    const key = getPlanItemKey(item);
    if (key) map.set(key, item);
    if (item.courseId) map.set(item.courseId, item);
  });
  return map;
}

function recalculatePlanDates(plan = [], template = {}, promotion = {}) {
  const startDate = promotion.startDate || '';
  if (!startDate || !Array.isArray(plan) || !plan.length) return plan;

  const preview = buildPreview(plan, template, promotion);
  const modelDuration = Math.max(1, preview.modelDurationDays);
  const targetDuration = Math.max(1, preview.targetDurationDays || modelDuration);
  const scale = targetDuration / modelDuration;
  const existingMap = mapExistingPlan(promotion.coursePlan || []);
  const structuralMap = new Map();

  const dated = plan.map((item) => {
    const key = getPlanItemKey(item);
    const existing = existingMap.get(key) || null;
    const rawStart = Math.max(0, Number(item.relativeStartOffsetDays ?? item.modelStartOffsetDays ?? item.startOffsetDays ?? 0) || 0);
    const rawDuration = getDurationDays(item);

    if (existing?.isLocked === true && existing.recommendedStartAt && existing.recommendedEndAt) {
      const locked = {
        ...item,
        isLocked: true,
        durationDays: Math.max(1, toNumber(existing.durationDays, item.durationDays || rawDuration)),
        recommendedStartAt: existing.recommendedStartAt || '',
        recommendedEndAt: existing.recommendedEndAt || '',
        deadlineAt: existing.deadlineAt || existing.dueAt || existing.recommendedEndAt || '',
        dueAt: existing.dueAt || existing.deadlineAt || existing.recommendedEndAt || '',
        prorataScale: Number(scale.toFixed(6)),
        modelStartOffsetDays: rawStart,
        modelDurationDays: rawDuration,
        targetStartOffsetDays: toNumber(existing.targetStartOffsetDays, Math.round(rawStart * scale)),
        targetDurationDays: toNumber(existing.targetDurationDays, existing.durationDays || rawDuration)
      };
      if (isStructuralType(getItemType(locked))) {
        structuralMap.set(key, locked);
        if (locked.courseId) structuralMap.set(locked.courseId, locked);
      }
      return locked;
    }

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
      deadlineAt: end,
      dueAt: end,
      prorataScale: Number(scale.toFixed(6)),
      modelStartOffsetDays: rawStart,
      modelDurationDays: rawDuration,
      targetStartOffsetDays: scaledStartOffset,
      targetDurationDays: scaledDuration
    };

    if (isStructuralType(getItemType(next))) {
      structuralMap.set(key, next);
      if (next.courseId) structuralMap.set(next.courseId, next);
    }
    return next;
  });

  return dated.map((item) => {
    if (!isParallelType(getItemType(item))) return item;
    if (item.isLocked === true && item.recommendedStartAt && item.recommendedEndAt) return item;
    const related = item.relatedCourseId ? structuralMap.get(item.relatedCourseId) : null;
    if (!related) return item;
    return {
      ...item,
      relatedCourseTitle: related.courseTitle || related.title || item.relatedCourseTitle || '',
      deadlineAt: related.recommendedEndAt || item.recommendedEndAt || item.deadlineAt || '',
      dueAt: related.recommendedEndAt || item.recommendedEndAt || item.dueAt || ''
    };
  });
}

function buildPromotionUpdate(template = {}, promotion = {}) {
  const basePlan = buildPlanFromTemplate(template);
  const coursePlan = recalculatePlanDates(basePlan, template, promotion);
  const preview = buildPreview(coursePlan, template, promotion);
  const user = auth.currentUser;
  const title = clean(template.title || promotion.curriculumTitle || promotion.name || 'Cursus', 140);

  return {
    curriculumId: slugify(title || promotion.name || 'cursus'),
    curriculumTitle: title,
    curriculumTemplateId: template.id || promotion.curriculumTemplateId || '',
    coursePlan,
    coursePlanVersion: 'promotion-course-plan-prorata-v1',
    coursePlanCount: coursePlan.length,
    coursePlanPreview: {
      ...preview,
      source: 'curriculum-auto-sync-v1'
    },
    modelDurationDays: preview.modelDurationDays,
    modelWeeks: preview.modelWeeks,
    promotionDurationDays: preview.targetDurationDays,
    promotionWeeks: preview.targetWeeks,
    prorataScale: Number(preview.scale.toFixed(6)),
    lastCurriculumSyncAt: serverTimestamp(),
    lastCurriculumSyncSource: VERSION,
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid || promotion.updatedBy || '',
    updatedByEmail: user?.email || promotion.updatedByEmail || ''
  };
}

async function loadTemplate(templateId = '') {
  if (!templateId) return null;
  const snap = await getDoc(doc(db, 'curriculumTemplates', templateId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

async function loadLinkedPromotions(templateId = '') {
  if (!templateId) return [];
  const snap = await getDocs(query(
    collection(db, 'promotions'),
    where('curriculumTemplateId', '==', templateId)
  ));
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
  return rows.filter((promotion) => (promotion.status || 'active') !== 'archived');
}

async function syncPromotionsForCurrentTemplate(attempt = 0) {
  if (!getRoot()) return;
  if (syncRunning) return;
  if (shouldSkipBecauseSaveFailed()) return;

  const templateId = getTemplateId();
  if (!templateId) {
    if (attempt < 4) scheduleSync(attempt + 1);
    return;
  }

  syncRunning = true;
  try {
    const template = await loadTemplate(templateId);
    if (!template) return;

    const promotions = await loadLinkedPromotions(templateId);
    if (!promotions.length) {
      setStatus('Cursus sauvegardé. Aucune promotion active liée à synchroniser.', 'success');
      return;
    }

    setStatus(`Synchro des promotions liées (${promotions.length})...`, 'muted');

    let updated = 0;
    for (const promotion of promotions) {
      const payload = buildPromotionUpdate(template, promotion);
      await updateDoc(doc(db, 'promotions', promotion.id), payload);
      updated += 1;
    }

    setStatus(`${updated} promotion${updated > 1 ? 's' : ''} synchronisée${updated > 1 ? 's' : ''} avec le cursus.`, 'success');
  } catch (error) {
    console.warn('[SBI Cursus Sync] Synchronisation promotions impossible :', error);
    setStatus('Cursus sauvegardé, mais synchro promotions impossible.', 'error');
  } finally {
    syncRunning = false;
  }
}

function scheduleSync(attempt = 0) {
  window.clearTimeout(syncTimer);
  const delays = [1450, 900, 1200, 1600, 2200];
  syncTimer = window.setTimeout(() => syncPromotionsForCurrentTemplate(attempt), delays[attempt] || 1600);
}

function bindSaveButton() {
  const button = document.getElementById('cursus-save-btn');
  if (!button || button.dataset.sbiPromotionSyncBound === 'true') return;
  button.dataset.sbiPromotionSyncBound = 'true';
  button.addEventListener('click', () => scheduleSync(0), true);
}

export function initAdminCursusPromotionSync() {
  if (installed) {
    bindSaveButton();
    return;
  }

  installed = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSaveButton, { once: true });
  } else {
    bindSaveButton();
  }

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(bindSaveButton, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(bindSaveButton, 80));
}

initAdminCursusPromotionSync();
