/**
 * SBI 8.0P.167.107.6-GPT2.1
 * Cursus timeline drag & drop bridge.
 *
 * Verrouillage corrigé :
 * - un bloc verrouillé ne part jamais en drag ;
 * - un déplacement ne coche jamais le verrou ;
 * - les blocs verrouillés ne sont pas poussés par insertion/décalage.
 */

let installed = false;
let draggedItemId = '';
let dragStartedAt = 0;

const MARGIN_TYPES = new Set(['buffer_period', 'revision_period', 'catchup_period']);
const COURSE_TYPES = new Set(['course', 'placeholder_course']);

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getCursusRoot() {
  return document.getElementById('view-cursus');
}

function getTimelineCanvas() {
  return document.getElementById('cursus-timeline-canvas');
}

function getWeekWidth() {
  const canvas = getTimelineCanvas();
  if (!canvas) return 120;
  const value = parseFloat(getComputedStyle(canvas).getPropertyValue('--cursus-week-width'));
  return Number.isFinite(value) && value > 20 ? value : 120;
}

function getWeeksCount() {
  const canvas = getTimelineCanvas();
  if (!canvas) return 8;
  const value = parseInt(getComputedStyle(canvas).getPropertyValue('--cursus-weeks'), 10);
  return Number.isFinite(value) && value > 0 ? value : 8;
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function getBlockType(block) {
  if (!block) return '';
  const match = Array.from(block.classList || []).find((name) => name.startsWith('type-'));
  return match ? match.replace(/^type-/, '') : '';
}

function isMarginBlock(block) {
  return MARGIN_TYPES.has(getBlockType(block));
}

function isCourseBlock(block) {
  return COURSE_TYPES.has(getBlockType(block));
}

function isLockedBlock(block) {
  if (!block) return false;
  if (block.dataset.sbiLocked === 'true') return true;
  return Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'))
    .some((badge) => badge.textContent.trim() === 'L');
}

function markBlocksDraggable() {
  const root = getCursusRoot();
  if (!root) return;

  $all('.sbi-cursus-block[data-id]', root).forEach((block) => {
    const locked = isLockedBlock(block);
    block.setAttribute('draggable', locked ? 'false' : 'true');
    block.setAttribute('aria-grabbed', 'false');
    block.setAttribute('aria-disabled', locked ? 'true' : 'false');
    block.title = locked
      ? 'Bloc verrouillé : décoche “Dates / position verrouillées” pour le déplacer.'
      : isMarginBlock(block)
        ? 'Glisser pour déplacer cette marge comme un trou pédagogique'
        : 'Glisser horizontalement pour insérer ou déplacer le bloc dans la timeline';
  });
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-dnd-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-dnd-style';
  style.textContent = `
    .sbi-cursus-block[draggable="true"] { cursor: grab; }
    .sbi-cursus-block[draggable="true"]:active { cursor: grabbing; }
    .sbi-cursus-block[draggable="false"],
    .sbi-cursus-block[data-sbi-locked="true"] { cursor: not-allowed; }
    .sbi-cursus-block.is-dragging {
      opacity: .72;
      transform: translateY(-2px) scale(.995);
      outline: 2px solid rgba(117, 242, 154, .72);
      box-shadow: 0 0 0 6px rgba(117, 242, 154, .14), 0 22px 42px rgba(0, 0, 0, .34);
    }
    .sbi-cursus-track-body.is-drop-target {
      background-color: rgba(42, 87, 255, .12);
      box-shadow: inset 0 0 0 1px rgba(117, 242, 154, .32);
    }
    .sbi-cursus-track-body.is-drop-insert {
      background-color: rgba(255, 167, 74, .12);
      box-shadow: inset 0 0 0 1px rgba(255, 167, 74, .42);
    }
    .sbi-cursus-track-body.is-drop-forbidden {
      background-color: rgba(255, 74, 104, .10);
      box-shadow: inset 0 0 0 1px rgba(255, 74, 104, .34);
    }
  `;
  document.head.appendChild(style);
}

function parseCssNumber(node, propertyName, fallback = 0) {
  if (!node) return fallback;
  const value = parseFloat(getComputedStyle(node).getPropertyValue(propertyName));
  return Number.isFinite(value) ? value : fallback;
}

function getBlockStartWeekZero(block) {
  return Math.max(0, Math.round(parseCssNumber(block, '--start-week', 0)));
}

function getBlockSpanWeeks(block) {
  return Math.max(1, Math.round(parseCssNumber(block, '--span-week', 1)));
}

function computeDropWeek(event, trackBody) {
  const rect = trackBody.getBoundingClientRect();
  const x = Math.max(0, event.clientX - rect.left);
  const weekWidth = getWeekWidth();
  return Math.max(1, Math.floor(x / weekWidth) + 1);
}

function rangesOverlap(startA, spanA, startB, spanB) {
  const endA = startA + spanA;
  const endB = startB + spanB;
  return startA < endB && startB < endA;
}

function getBlockByItemId(itemId) {
  if (!itemId) return null;
  return $(`.sbi-cursus-block[data-id="${CSS.escape(itemId)}"]`);
}

function getOriginalTrackBody(itemId) {
  const block = getBlockByItemId(itemId);
  return block?.closest?.('.sbi-cursus-track-body') || null;
}

function getDraggedSpan(itemId) {
  return getBlockSpanWeeks(getBlockByItemId(itemId));
}

function getAllBlocks(excludedItemId = '') {
  return $all('.sbi-cursus-block[data-id]', getCursusRoot() || document)
    .filter((block) => (block.dataset.id || '') !== excludedItemId);
}

function rangeFromBlock(block) {
  return {
    id: block.dataset.id || '',
    start: getBlockStartWeekZero(block),
    span: getBlockSpanWeeks(block),
    type: getBlockType(block),
    locked: isLockedBlock(block),
    title: block.textContent?.trim() || ''
  };
}

function getOccupiedRanges(trackBody, excludedItemId = '') {
  if (!trackBody) return [];

  return $all('.sbi-cursus-block[data-id]', trackBody)
    .filter((block) => (block.dataset.id || '') !== excludedItemId)
    .map(rangeFromBlock)
    .filter((range) => range.id && range.span > 0)
    .sort((a, b) => (a.start - b.start) || a.title.localeCompare(b.title, 'fr'));
}

function getGlobalStructuralRanges(excludedItemId = '') {
  return getAllBlocks(excludedItemId)
    .filter((block) => COURSE_TYPES.has(getBlockType(block)) || MARGIN_TYPES.has(getBlockType(block)))
    .map(rangeFromBlock)
    .filter((range) => range.id)
    .sort((a, b) => (a.start - b.start) || a.title.localeCompare(b.title, 'fr'));
}

function overlapsExistingMargin(itemId, insertedStart, insertedSpan) {
  return getGlobalStructuralRanges(itemId)
    .filter((range) => MARGIN_TYPES.has(range.type))
    .some((range) => rangesOverlap(insertedStart, insertedSpan, range.start, range.span));
}

function buildMarginSlidePlan(itemId, targetWeek, dropTrackBody) {
  const block = getBlockByItemId(itemId);
  if (isLockedBlock(block)) {
    return { itemId, allowed: false, reason: 'Bloc verrouillé : désactive le verrouillage pour le déplacer.', insertedWeek: targetWeek, shifts: [], hasCollision: false, isMarginSlide: true };
  }

  const originalTrackBody = getOriginalTrackBody(itemId);
  const targetTrackBody = dropTrackBody || originalTrackBody;
  const targetWeekSafe = Math.max(1, Number(targetWeek) || 1);
  const targetStart = targetWeekSafe - 1;
  const oldStart = getBlockStartWeekZero(block);
  const span = getDraggedSpan(itemId);

  if (!originalTrackBody || !targetTrackBody || originalTrackBody !== targetTrackBody) {
    return { itemId, allowed: false, reason: 'Le déplacement vertical entre pistes n’est pas encore actif.', insertedWeek: targetWeekSafe, shifts: [], hasCollision: false, isMarginSlide: true };
  }

  if (targetStart === oldStart) {
    return { itemId, allowed: true, reason: '', insertedWeek: targetWeekSafe, shifts: [], hasCollision: false, isMarginSlide: true };
  }

  const ranges = getGlobalStructuralRanges(itemId);
  const shifts = [];

  if (targetStart > oldStart) {
    ranges.forEach((range) => {
      if (range.start >= oldStart + span && range.start < targetStart + span) {
        shifts.push({ id: range.id, fromWeek: range.start + 1, toWeek: Math.max(1, range.start - span + 1), span: range.span, type: range.type, title: range.title, locked: range.locked });
      }
    });
  } else {
    ranges.slice().reverse().forEach((range) => {
      if (range.start >= targetStart && range.start < oldStart) {
        shifts.push({ id: range.id, fromWeek: range.start + 1, toWeek: range.start + span + 1, span: range.span, type: range.type, title: range.title, locked: range.locked });
      }
    });
  }

  if (shifts.some((shift) => shift.locked)) {
    return { itemId, allowed: false, reason: 'Déplacement impossible : un bloc verrouillé serait déplacé.', insertedWeek: targetWeekSafe, shifts: [], hasCollision: true, isMarginSlide: true };
  }

  return { itemId, allowed: true, reason: '', insertedWeek: targetWeekSafe, insertedSpan: span, shifts, hasCollision: shifts.length > 0, isMarginSlide: true, requiredWeeks: getWeeksCount() };
}

function buildInsertionPlan(itemId, targetWeek, dropTrackBody) {
  const block = getBlockByItemId(itemId);
  if (isLockedBlock(block)) {
    return { itemId, allowed: false, reason: 'Bloc verrouillé : désactive le verrouillage pour le déplacer.', targetWeek, insertedWeek: targetWeek, insertedSpan: 1, shifts: [], hasCollision: false };
  }

  const originalTrackBody = getOriginalTrackBody(itemId);
  const targetTrackBody = dropTrackBody || originalTrackBody;
  const targetWeekSafe = Math.max(1, Number(targetWeek) || 1);
  const insertedStart = targetWeekSafe - 1;
  const insertedSpan = getDraggedSpan(itemId);

  if (isMarginBlock(block)) return buildMarginSlidePlan(itemId, targetWeekSafe, dropTrackBody);

  if (!originalTrackBody || !targetTrackBody || originalTrackBody !== targetTrackBody) {
    return { itemId, allowed: false, reason: 'Le déplacement vertical entre pistes n’est pas encore actif.', targetWeek: targetWeekSafe, insertedWeek: targetWeekSafe, insertedSpan, shifts: [], hasCollision: false };
  }

  if (isCourseBlock(block) && overlapsExistingMargin(itemId, insertedStart, insertedSpan)) {
    return { itemId, allowed: false, reason: 'Déplacement impossible : une marge occupe cette semaine. Déplace d’abord la marge.', targetWeek: targetWeekSafe, insertedWeek: targetWeekSafe, insertedSpan, shifts: [], hasCollision: true };
  }

  const ranges = getOccupiedRanges(originalTrackBody, itemId);
  let cursor = insertedStart + insertedSpan;
  const shifts = [];
  let hasCollision = ranges.some((range) => rangesOverlap(insertedStart, insertedSpan, range.start, range.span));

  ranges.forEach((range) => {
    const rangeEnd = range.start + range.span;
    if (rangeEnd <= insertedStart) return;
    if (range.start < cursor) {
      shifts.push({ id: range.id, fromWeek: range.start + 1, toWeek: cursor + 1, span: range.span, title: range.title, locked: range.locked });
      cursor += range.span;
      hasCollision = true;
      return;
    }
    cursor = Math.max(cursor, rangeEnd);
  });

  if (shifts.some((shift) => shift.locked)) {
    return { itemId, allowed: false, reason: 'Déplacement impossible : un bloc verrouillé serait décalé.', targetWeek: targetWeekSafe, insertedWeek: targetWeekSafe, insertedSpan, shifts: [], hasCollision: true };
  }

  return { itemId, allowed: true, reason: '', targetWeek: targetWeekSafe, insertedWeek: targetWeekSafe, insertedSpan, shifts, hasCollision, requiredWeeks: Math.max(getWeeksCount(), cursor) };
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function dispatchField(target, eventName = 'input') {
  target.dispatchEvent(new Event(eventName, { bubbles: true }));
}

async function selectItem(itemId) {
  const block = getBlockByItemId(itemId);
  if (!block) return false;
  block.click();
  await waitFrame();
  return Boolean($(`#cursus-inspector-content [data-field]`));
}

async function setSelectedItemStartWeek(week) {
  const inspector = document.getElementById('cursus-inspector-content');
  if (!inspector) return false;

  const lockInput = $('input[data-field="isLocked"]', inspector);
  if (lockInput?.checked) return false;

  const startWeekInput = inspector.querySelector('input[data-field="startWeek"]');
  if (!startWeekInput || startWeekInput.disabled) return false;

  startWeekInput.value = String(week);
  dispatchField(startWeekInput, 'input');
  dispatchField(startWeekInput, 'change');
  return true;
}

async function setItemStartWeek(itemId, week) {
  const selected = await selectItem(itemId);
  if (!selected) return false;
  const moved = await setSelectedItemStartWeek(week);
  await waitFrame();
  return moved;
}

async function applyInsertionPlan(plan) {
  if (!plan?.allowed) {
    setStatus(plan?.reason || 'Déplacement impossible.', 'error');
    return;
  }

  const moved = await setItemStartWeek(plan.itemId, plan.insertedWeek);
  if (!moved) {
    setStatus('Déplacement impossible : élément verrouillé ou inspecteur indisponible.', 'error');
    return;
  }

  for (const shift of plan.shifts) {
    const shifted = await setItemStartWeek(shift.id, shift.toWeek);
    if (!shifted) {
      setStatus('Déplacement partiel : un bloc à repositionner est verrouillé ou introuvable. Vérifie puis sauvegarde.', 'error');
      markBlocksDraggable();
      return;
    }
  }

  await waitFrame();
  markBlocksDraggable();

  if (plan.isMarginSlide) {
    setStatus(plan.shifts.length
      ? `Marge déplacée en S${plan.insertedWeek}. Le contenu traversé a glissé dans l’espace libéré. Pense à sauvegarder.`
      : `Marge déplacée en S${plan.insertedWeek}. Pense à sauvegarder.`, 'success');
    return;
  }

  if (plan.shifts.length) {
    setStatus(`Bloc inséré en S${plan.insertedWeek}. ${plan.shifts.length} bloc${plan.shifts.length > 1 ? 's' : ''} décalé${plan.shifts.length > 1 ? 's' : ''}. Pense à sauvegarder.`, 'success');
    return;
  }

  setStatus(`Bloc déplacé en S${plan.insertedWeek}. Pense à sauvegarder le cursus.`, 'success');
}

function clearDropTargets() {
  $all('.sbi-cursus-track-body.is-drop-target, .sbi-cursus-track-body.is-drop-insert, .sbi-cursus-track-body.is-drop-forbidden').forEach((node) => {
    node.classList.remove('is-drop-target', 'is-drop-insert', 'is-drop-forbidden');
  });
}

function handleDragStart(event) {
  const block = event.target?.closest?.('.sbi-cursus-block[data-id]');
  if (!block || !getCursusRoot()) return;

  if (isLockedBlock(block)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus('Bloc verrouillé : désactive le verrouillage pour le déplacer.', 'error');
    return;
  }

  draggedItemId = block.dataset.id || '';
  dragStartedAt = Date.now();
  block.classList.add('is-dragging');
  block.setAttribute('aria-grabbed', 'true');

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedItemId);
  setStatus(isMarginBlock(block)
    ? 'Déplacement de marge : le trou pédagogique va glisser dans la timeline.'
    : 'Déplacement en cours : dépose le bloc sur la semaine voulue.');
}

function handleDragEnd() {
  $all('.sbi-cursus-block.is-dragging').forEach((block) => {
    block.classList.remove('is-dragging');
    block.setAttribute('aria-grabbed', 'false');
  });
  clearDropTargets();
  draggedItemId = '';
  window.requestAnimationFrame(markBlocksDraggable);
}

function handleDragOver(event) {
  if (!draggedItemId) return;
  const trackBody = event.target?.closest?.('.sbi-cursus-track-body');
  if (!trackBody || !getCursusRoot()) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearDropTargets();

  const targetWeek = computeDropWeek(event, trackBody);
  const plan = buildInsertionPlan(draggedItemId, targetWeek, trackBody);

  if (!plan.allowed) {
    trackBody.classList.add('is-drop-forbidden');
    event.dataTransfer.dropEffect = 'none';
    return;
  }

  trackBody.classList.add(plan.hasCollision ? 'is-drop-insert' : 'is-drop-target');
}

function handleDrop(event) {
  if (!draggedItemId || !getCursusRoot()) return;
  const trackBody = event.target?.closest?.('.sbi-cursus-track-body');
  if (!trackBody) return;

  event.preventDefault();
  const droppedId = event.dataTransfer.getData('text/plain') || draggedItemId;
  const targetWeek = computeDropWeek(event, trackBody);
  const plan = buildInsertionPlan(droppedId, targetWeek, trackBody);
  const elapsed = Date.now() - dragStartedAt;
  clearDropTargets();

  if (!droppedId || elapsed < 80) return;
  applyInsertionPlan(plan);
}

function installListeners() {
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('dragend', handleDragEnd, true);
  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || !event.target?.closest?.('.sbi-cursus-track-body')) clearDropTargets();
  }, true);
  document.addEventListener('drop', handleDrop, true);

  ['click', 'input', 'change'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      const root = getCursusRoot();
      if (root && event.target && root.contains(event.target)) {
        window.requestAnimationFrame(markBlocksDraggable);
      }
    }, true);
  });

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(markBlocksDraggable, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(markBlocksDraggable, 80));
}

export function initAdminCursusDndBridge() {
  if (installed) {
    markBlocksDraggable();
    return;
  }

  installed = true;
  ensureStyles();
  installListeners();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markBlocksDraggable, { once: true });
  } else {
    markBlocksDraggable();
  }
}

initAdminCursusDndBridge();
