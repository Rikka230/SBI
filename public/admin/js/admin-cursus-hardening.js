/**
 * SBI 8.0P.167.107-GPT2.1
 * Cursus hardening bridge.
 *
 * Objectifs :
 * - persister displayWeeks / effectiveWeeks / effectiveDurationDays dans curriculumTemplates ;
 * - verrouiller réellement les blocs marqués isLocked ;
 * - nettoyer l’inspecteur ;
 * - brancher les filtres Obligatoire / Optionnel ;
 * - préparer la synchronisation Cursus -> Promotions sans toucher au côté élève final.
 */

import { auth, db } from '/js/firebase-init.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let observer = null;
let coursesById = new Map();
let saveTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getRoot() {
  return $('view-cursus');
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

function parseDate(value = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addDays(dateString = '', days = 0) {
  const date = parseDate(dateString);
  if (!date) return '';
  date.setDate(date.getDate() + Math.round(days || 0));
  return formatDate(date);
}

function daysBetweenInclusive(start = '', end = '') {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
}

function setStatus(message = '', tone = 'muted') {
  const status = $('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function getSelectedFormation() {
  const select = $('cursus-formation-select');
  const formationId = select?.value || '';
  const selectedOption = select?.selectedOptions?.[0] || null;
  const formationName = formationId ? clean(selectedOption?.textContent || '', 180) : '';
  return { formationId, formationName };
}

function getTemplateTitle() {
  return clean($('cursus-title-input')?.value || '', 180);
}

function getVisibleDisplayWeeks() {
  const apiWeeks = window.SBI_CURSUS_WEEKS?.getDisplayWeeks?.();
  if (Number.isFinite(Number(apiWeeks)) && Number(apiWeeks) > 0) return Number(apiWeeks);

  const canvas = $('cursus-timeline-canvas');
  const raw = canvas ? parseInt(getComputedStyle(canvas).getPropertyValue('--cursus-weeks'), 10) : 0;
  return Number.isFinite(raw) && raw > 0 ? raw : 52;
}

function getEffectiveFromItems(items = []) {
  const effectiveDurationDays = Math.max(0, ...items.map((item) => {
    const start = toNumber(item.startOffsetDays, 0);
    const duration = toNumber(item.estimatedDurationDays || item.durationDays, 1);
    return Math.max(0, start + Math.max(1, duration));
  }), 0);

  return {
    effectiveDurationDays,
    effectiveWeeks: Math.max(0, Math.ceil(effectiveDurationDays / 7))
  };
}

function isLockedBlock(block) {
  if (!block) return false;
  const badges = Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'))
    .map((node) => clean(node.textContent || '', 8));
  return badges.includes('L') || block.dataset.locked === 'true';
}

function markLockedBlocks() {
  if (!getRoot()) return;
  $all('.sbi-cursus-block[data-id]', getRoot()).forEach((block) => {
    const locked = isLockedBlock(block);
    block.dataset.sbiLocked = locked ? 'true' : 'false';
    if (locked) {
      block.setAttribute('draggable', 'false');
      block.classList.add('is-sbi-hard-locked');
      block.title = 'Bloc verrouillé : désactive “Dates / position verrouillées” pour le déplacer.';
    } else {
      block.classList.remove('is-sbi-hard-locked');
    }
  });
}

function cleanInspectorActions() {
  const inspector = $('cursus-inspector-content');
  if (!inspector) return;

  $all('button[data-action="move-left"], button[data-action="move-right"], button[data-action="order-up"], button[data-action="order-down"]', inspector)
    .forEach((button) => button.remove());

  const qualiopi = inspector.querySelector('input[data-field="isQualiopiEvidence"]');
  if (qualiopi) {
    const label = qualiopi.closest('label');
    if (label && !label.querySelector('[data-sbi-qualiopi-help]')) {
      const help = document.createElement('small');
      help.dataset.sbiQualiopiHelp = 'true';
      help.textContent = ' Marqueur pour futur audit / export pédagogique.';
      help.style.opacity = '.72';
      label.appendChild(help);
    }
  }
}

function rewriteCoherenceMessage() {
  const detail = $('cursus-coherence-detail');
  if (!detail) return;
  const text = detail.textContent || '';
  if (text.includes('Éléments parallèles sans cours lié') || text.includes('élément parallèle sans cours lié')) {
    detail.textContent = text.replace(/Éléments parallèles sans cours lié/gi, 'Un devoir, examen ou live n’est lié à aucun cours');
  }
}

function hardenDom() {
  if (!getRoot()) return;
  markLockedBlocks();
  cleanInspectorActions();
  rewriteCoherenceMessage();
  applyToolFilter();
}

async function loadCourseFlags() {
  try {
    const snap = await getDocs(collection(db, 'courses'));
    const next = new Map();
    snap.forEach((docSnap) => next.set(docSnap.id, docSnap.data() || {}));
    coursesById = next;
    applyToolFilter();
  } catch (error) {
    console.warn('[SBI Cursus hardening] Chargement cours impossible :', error);
  }
}

function getActiveToolFilter() {
  const active = document.querySelector('[data-tool-filter].is-active');
  return active?.dataset?.toolFilter || 'all';
}

function applyToolFilter() {
  const root = getRoot();
  const list = $('cursus-tool-list');
  if (!root || !list) return;

  const filter = getActiveToolFilter();
  const cards = $all('.sbi-cursus-tool-card[data-course-id]', list);
  let visible = 0;

  cards.forEach((card) => {
    const course = coursesById.get(card.dataset.courseId || '') || {};
    const isOptional = course.isRequired === false || course.optional === true || course.isOptional === true;
    const isRequired = !isOptional;
    const shouldShow = filter === 'all'
      || (filter === 'required' && isRequired)
      || (filter === 'optional' && isOptional);

    card.hidden = !shouldShow;
    card.style.display = shouldShow ? '' : 'none';
    if (shouldShow) visible += 1;
  });

  const count = $('cursus-course-count');
  if (count && cards.length) count.textContent = String(visible);
}

function getActiveTemplateId() {
  return $('cursus-template-select')?.value || '';
}

async function findTemplateIdFallback() {
  const active = getActiveTemplateId();
  if (active) return active;

  const title = getTemplateTitle();
  const formation = getSelectedFormation();
  if (!title) return '';

  try {
    const snap = await getDocs(collection(db, 'curriculumTemplates'));
    const rows = [];
    snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
    rows.sort((a, b) => toNumber(b.updatedAt?.seconds || b.updatedAt, 0) - toNumber(a.updatedAt?.seconds || a.updatedAt, 0));

    const exact = rows.find((row) => clean(row.title || '', 180) === title && (!formation.formationId || row.formationId === formation.formationId));
    return exact?.id || rows.find((row) => clean(row.title || '', 180) === title)?.id || '';
  } catch (error) {
    console.warn('[SBI Cursus hardening] Recherche template impossible :', error);
    return '';
  }
}

async function loadTemplate(templateId) {
  if (!templateId) return null;
  const snap = await getDoc(doc(db, 'curriculumTemplates', templateId));
  return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
}

function getItemType(item = {}) {
  const rawType = item.type || item.itemType || '';
  if (rawType === 'real_course') return 'course';
  return rawType || (item.courseId ? 'course' : 'placeholder_course');
}

function normalizePlanItem(item = {}, index = 0, context = {}) {
  const type = getItemType(item);
  const title = clean(item.courseTitle || item.title || item.label || 'Élément pédagogique', 180);
  return {
    ...item,
    type,
    itemId: item.itemId || item.id || `${type}-${index}`,
    courseId: clean(item.courseId || '', 180),
    courseTitle: title,
    title,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    durationDays: Math.max(1, toNumber(item.estimatedDurationDays || item.durationDays, 7)),
    displayContextFormationId: context.formationId || item.displayContextFormationId || '',
    displayContextFormationName: context.formationName || item.displayContextFormationName || '',
    source: 'curriculum-template-auto-synced-from-hardening-v107'
  };
}

function applyProrataDates(plan = [], promotion = {}, template = {}) {
  const startDate = promotion.startDate || '';
  const endDate = promotion.endDate || '';
  const metrics = getEffectiveFromItems(template.items || []);
  const modelDays = Math.max(1, metrics.effectiveDurationDays || toNumber(template.effectiveDurationDays, 0) || toNumber(template.durationDays, 0) || 7);
  const targetDays = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : modelDays;
  const scale = targetDays / modelDays;

  return plan.map((item) => {
    if (!startDate) return item;

    const startOffset = Math.max(0, Math.round(toNumber(item.startOffsetDays, 0) * scale));
    const duration = Math.max(1, Math.round(toNumber(item.durationDays || item.estimatedDurationDays, 7) * scale));
    const recommendedStartAt = addDays(startDate, startOffset);
    const recommendedEndAt = addDays(recommendedStartAt, duration - 1);

    return {
      ...item,
      recommendedStartAt,
      recommendedEndAt,
      deadlineAt: item.deadlineAt || item.dueAt || recommendedEndAt,
      dueAt: item.dueAt || item.deadlineAt || recommendedEndAt,
      prorataScale: scale
    };
  });
}

async function updateLinkedPromotions(template) {
  if (!template?.id) return 0;

  try {
    const snap = await getDocs(query(collection(db, 'promotions'), where('curriculumTemplateId', '==', template.id)));
    if (snap.empty) return 0;

    const metrics = getEffectiveFromItems(template.items || []);
    const context = {
      formationId: template.formationId || '',
      formationName: template.formationName || ''
    };

    let count = 0;
    for (const promotionSnap of snap.docs) {
      const promotion = promotionSnap.data() || {};
      const hasManualOverride = promotion.curriculumAutoSync === false || promotion.coursePlanManualOverride === true;

      if (hasManualOverride) {
        await setDoc(doc(db, 'promotions', promotionSnap.id), {
          curriculumTemplateOutdated: true,
          curriculumTemplateOutdatedAt: serverTimestamp(),
          curriculumTemplateOutdatedReason: 'Le cursus lié a été modifié.'
        }, { merge: true });
        continue;
      }

      const basePlan = (Array.isArray(template.items) ? template.items : [])
        .map((item, index) => normalizePlanItem(item, index, context));
      const coursePlan = applyProrataDates(basePlan, promotion, template);
      const startDate = promotion.startDate || '';
      const endDate = promotion.endDate || '';
      const targetDays = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : metrics.effectiveDurationDays;

      await setDoc(doc(db, 'promotions', promotionSnap.id), {
        curriculumTitle: template.title || promotion.curriculumTitle || '',
        curriculumTemplateId: template.id,
        curriculumTemplateSyncedAt: serverTimestamp(),
        curriculumTemplateOutdated: false,
        coursePlan,
        coursePlanCount: coursePlan.length,
        coursePlanVersion: 'promotion-course-plan-prorata-v107',
        coursePlanPreview: {
          templateId: template.id,
          templateTitle: template.title || '',
          modelDays: metrics.effectiveDurationDays,
          modelWeeks: metrics.effectiveWeeks,
          promotionDays: targetDays,
          promotionWeeks: Math.max(1, Math.ceil(Math.max(1, targetDays || metrics.effectiveDurationDays || 1) / 7)),
          startDate,
          endDate,
          syncedFromCursus: true
        },
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || promotion.updatedBy || '',
        updatedByEmail: auth.currentUser?.email || promotion.updatedByEmail || ''
      }, { merge: true });
      count += 1;
    }

    return count;
  } catch (error) {
    console.warn('[SBI Cursus hardening] Synchronisation promotions impossible :', error);
    return 0;
  }
}

async function mergeTemplateMetricsAndSync() {
  const templateId = await findTemplateIdFallback();
  if (!templateId) return;

  const template = await loadTemplate(templateId);
  if (!template) return;

  const metrics = getEffectiveFromItems(template.items || []);
  const displayWeeks = Math.max(getVisibleDisplayWeeks(), metrics.effectiveWeeks || 0, 52);

  await setDoc(doc(db, 'curriculumTemplates', templateId), {
    displayWeeks,
    effectiveWeeks: metrics.effectiveWeeks,
    effectiveDurationDays: metrics.effectiveDurationDays,
    curriculumMetricsVersion: 'cursus-hardening-v107',
    metricsUpdatedAt: serverTimestamp()
  }, { merge: true });

  const synced = await updateLinkedPromotions({ ...template, id: templateId, displayWeeks, ...metrics });
  if (synced > 0) {
    setStatus(`${synced} promotion${synced > 1 ? 's' : ''} liée${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}.`, 'success');
  }
}

function scheduleAfterSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    mergeTemplateMetricsAndSync().catch((error) => {
      console.warn('[SBI Cursus hardening] Post-sauvegarde impossible :', error);
    });
  }, 1600);
}

async function hydrateDisplayWeeksFromTemplate() {
  const templateId = getActiveTemplateId();
  if (!templateId) return;

  try {
    const template = await loadTemplate(templateId);
    const displayWeeks = Number(template?.displayWeeks || 0);
    if (displayWeeks > 0) {
      window.dispatchEvent(new CustomEvent('sbi:cursus:display-weeks', { detail: { displayWeeks } }));
    }
  } catch (error) {
    console.warn('[SBI Cursus hardening] Hydratation displayWeeks impossible :', error);
  }
}

function ensureStyles() {
  if ($('sbi-cursus-hardening-style')) return;
  const style = document.createElement('style');
  style.id = 'sbi-cursus-hardening-style';
  style.textContent = `
    .sbi-cursus-block.is-sbi-hard-locked {
      cursor: not-allowed !important;
      outline: 1px solid rgba(255, 214, 102, .30);
    }
    .sbi-cursus-track-label {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
    }
    .sbi-cursus-track-count {
      justify-self: end;
      min-width: 1.9rem;
      text-align: center;
      flex: 0 0 auto;
    }
  `;
  document.head.appendChild(style);
}

function bindEvents() {
  if (document.body.dataset.sbiCursusHardeningV107 === 'true') return;
  document.body.dataset.sbiCursusHardeningV107 = 'true';

  document.addEventListener('click', (event) => {
    if (!getRoot()) return;

    const save = event.target.closest?.('#cursus-save-btn, #cursus-duplicate-btn');
    if (save) scheduleAfterSave();

    const filter = event.target.closest?.('[data-tool-filter]');
    if (filter) {
      window.setTimeout(applyToolFilter, 80);
      window.setTimeout(applyToolFilter, 250);
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (!getRoot()) return;
    if (event.target?.id === 'cursus-template-select') {
      window.setTimeout(hydrateDisplayWeeksFromTemplate, 550);
      window.setTimeout(hardenDom, 650);
    }
  }, true);

  document.addEventListener('dragstart', (event) => {
    const block = event.target?.closest?.('.sbi-cursus-block[data-id]');
    if (!block || !getRoot()) return;
    if (!isLockedBlock(block)) return;

    event.preventDefault();
    event.stopPropagation();
    setStatus('Bloc verrouillé : désactive “Dates / position verrouillées” pour le déplacer.', 'error');
  }, true);
}

function observeCursus() {
  observer?.disconnect();
  if (!getRoot()) return;

  hardenDom();
  loadCourseFlags();
  hydrateDisplayWeeksFromTemplate();

  observer = new MutationObserver(() => {
    window.requestAnimationFrame(hardenDom);
  });
  observer.observe(getRoot(), { childList: true, subtree: true, characterData: true });
}

export function initAdminCursusHardeningBridge() {
  if (installed) {
    observeCursus();
    return;
  }

  installed = true;
  ensureStyles();
  bindEvents();

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(observeCursus, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(observeCursus, 80));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeCursus, { once: true });
  } else {
    observeCursus();
  }
}

initAdminCursusHardeningBridge();
