/**
 * SBI 8.0P.167.101.2-GPT2.1
 * Cursus timeline drag & drop bridge.
 *
 * Périmètre : déplacement horizontal par semaine avec insertion intelligente.
 * Si la période visée est occupée sur la même piste, le bloc est inséré à
 * l'endroit demandé et les blocs qui se chevauchent sont décalés vers la droite.
 */

let installed = false;
let observer = null;
let draggedItemId = '';
let dragStartedAt = 0;

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
  const styles = getComputedStyle(canvas);
  const value = parseFloat(styles.getPropertyValue('--cursus-week-width'));
  return Number.isFinite(value) && value > 20 ? value : 120;
}

function getWeeksCount() {
  const canvas = getTimelineCanvas();
  if (!canvas) return 8;
  const styles = getComputedStyle(canvas);
  const value = parseInt(styles.getPropertyValue('--cursus-weeks'), 10);
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

function markBlocksDraggable() {
  const root = getCursusRoot();
  if (!root) return;

  $all('.sbi-cursus-block[data-id]', root).forEach((block) => {
    block.setAttribute('draggable', 'true');
    block.setAttribute('aria-grabbed', 'false');
    block.title = 'Glisser horizontalement pour insérer ou déplacer le bloc dans la timeline';
  });
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-dnd-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-dnd-style';
  style.textContent = `
    .sbi-cursus-block[draggable="true"] { cursor: grab; }
    .sbi-cursus-block[draggable="true"]:active { cursor: grabbing; }
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
  const styles = getComputedStyle(node);
  const value = parseFloat(styles.getPropertyValue(propertyName));
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

function getOccupiedRanges(trackBody, excludedItemId = '') {
  if (!trackBody) return [];

  return $all('.sbi-cursus-block[data-id]', trackBody)
    .filter((block) => (block.dataset.id || '') !== excludedItemId)
    .map((block) => ({
      id: block.dataset.id || '',
      start: getBlockStartWeekZero(block),
      span: getBlockSpanWeeks(block),
      title: block.textContent?.trim() || ''
    }))
    .filter((range) => range.id && range.span > 0)
    .sort((a, b) => (a.start - b.start) || a.title.localeCompare(b.title, 'fr'));
}

function buildInsertionPlan(itemId, targetWeek, dropTrackBody) {
  const originalTrackBody = getOriginalTrackBody(itemId);
  const targetTrackBody = dropTrackBody || originalTrackBody;
  const targetWeekSafe = Math.max(1, Number(targetWeek) || 1);
  const insertedStart = targetWeekSafe - 1;
  const insertedSpan = getDraggedSpan(itemId);

  if (!originalTrackBody || !targetTrackBody || originalTrackBody !== targetTrackBody) {
    return {
      itemId,
      allowed: false,
      reason: 'Le déplacement vertical entre pistes n’est pas encore actif.',
      targetWeek: targetWeekSafe,
      insertedWeek: targetWeekSafe,
      insertedSpan,
      shifts: [],
      hasCollision: false
    };
  }

  const ranges = getOccupiedRanges(originalTrackBody, itemId);
  let cursor = insertedStart + insertedSpan;
  const shifts = [];
  let hasCollision = ranges.some((range) => rangesOverlap(insertedStart, insertedSpan, range.start, range.span));

  ranges.forEach((range) => {
    const rangeEnd = range.start + range.span;

    if (rangeEnd <= insertedStart) return;

    if (range.start < cursor) {
      shifts.push({
        id: range.id,
        fromWeek: range.start + 1,
        toWeek: cursor + 1,
        span: range.span,
        title: range.title
      });
      cursor += range.span;
      hasCollision = true;
      return;
    }

    cursor = Math.max(cursor, rangeEnd);
  });

  return {
    itemId,
    allowed: true,
    reason: '',
    targetWeek: targetWeekSafe,
    insertedWeek: targetWeekSafe,
    insertedSpan,
    shifts,
    hasCollision,
    requiredWeeks: Math.max(getWeeksCount(), cursor)
  };
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
  if (lockInput && !lockInput.checked) {
    lockInput.checked = true;
    dispatchField(lockInput, 'input');
    dispatchField(lockInput, 'change');
    await waitFrame();
  }

  const refreshedInspector = document.getElementById('cursus-inspector-content');
  const startWeekInput = refreshedInspector?.querySelector('input[data-field="startWeek"]');
  if (!startWeekInput) return false;

  startWeekInput.disabled = false;
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
    setStatus('Déplacement impossible : élément introuvable ou inspecteur indisponible.', 'error');
    return;
  }

  for (const shift of plan.shifts) {
    const shifted = await setItemStartWeek(shift.id, shift.toWeek);
    if (!shifted) {
      setStatus('Insertion partielle : un bloc à décaler est introuvable. Vérifie puis sauvegarde.', 'error');
      markBlocksDraggable();
      return;
    }
  }

  await waitFrame();
  markBlocksDraggable();

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

  draggedItemId = block.dataset.id || '';
  dragStartedAt = Date.now();
  block.classList.add('is-dragging');
  block.setAttribute('aria-grabbed', 'true');

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedItemId);
  setStatus('Déplacement en cours : dépose le bloc sur la semaine voulue. Les blocs gênants seront décalés.');
}

function handleDragEnd() {
  $all('.sbi-cursus-block.is-dragging').forEach((block) => {
    block.classList.remove('is-dragging');
    block.setAttribute('aria-grabbed', 'false');
  });
  clearDropTargets();
  draggedItemId = '';
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

function observeCursus() {
  observer?.disconnect();
  const root = getCursusRoot();
  if (!root) return;

  markBlocksDraggable();
  observer = new MutationObserver(() => markBlocksDraggable());
  observer.observe(root, { childList: true, subtree: true });
}

function installListeners() {
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('dragend', handleDragEnd, true);
  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || !event.target?.closest?.('.sbi-cursus-track-body')) clearDropTargets();
  }, true);
  document.addEventListener('drop', handleDrop, true);

  window.addEventListener('sbi:app-shell:navigated', () => {
    window.setTimeout(observeCursus, 80);
  });

  window.addEventListener('sbi:app-shell:ready', () => {
    window.setTimeout(observeCursus, 80);
  });
}

export function initAdminCursusDndBridge() {
  if (installed) {
    observeCursus();
    return;
  }

  installed = true;
  ensureStyles();
  installListeners();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeCursus, { once: true });
  } else {
    observeCursus();
  }
}

initAdminCursusDndBridge();
