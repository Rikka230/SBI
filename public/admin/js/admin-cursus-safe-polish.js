/**
 * SBI 8.0P.167.107.5-GPT2.1
 * Cursus safe hardening - verrouillage UI progressif sans MutationObserver global.
 *
 * Correctif ciblé :
 * - après un drag, le bloc reste déverrouillé côté UI ;
 * - le checkbox ne se recoche plus visuellement après déplacement ;
 * - si l'admin reverrouille manuellement, le bloc est réellement bloqué au drag ;
 * - si l'admin redéverrouille, le bloc reste à sa semaine et peut être déplacé.
 *
 * Note : ce module évite de retoucher le gros coeur Cursus tant qu'il n'est pas refactoré.
 */

let installed = false;
let cleanupFrame = 0;
let draggedUnlockedItemId = '';
let forceUnlockUntil = 0;

const LOCK_STORAGE_PREFIX = 'sbi:cursus:ui-lock:';

function getRoot() {
  return document.getElementById('view-cursus');
}

function getTemplateId() {
  return document.getElementById('cursus-template-select')?.value || 'new';
}

function getFormationId() {
  return document.getElementById('cursus-formation-select')?.value || 'no-formation';
}

function getSelectedItemId() {
  return document.querySelector('.sbi-cursus-block.is-selected[data-id]')?.dataset?.id || '';
}

function getItemLockKey(itemId = '') {
  return `${LOCK_STORAGE_PREFIX}${getFormationId()}:${getTemplateId()}:${itemId}`;
}

function readLockState(itemId = '') {
  if (!itemId) return null;
  try {
    const raw = localStorage.getItem(getItemLockKey(itemId));
    if (raw === 'locked') return true;
    if (raw === 'unlocked') return false;
  } catch {}
  return null;
}

function writeLockState(itemId = '', locked = false) {
  if (!itemId) return;
  try {
    localStorage.setItem(getItemLockKey(itemId), locked ? 'locked' : 'unlocked');
  } catch {}
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'error'
    ? '#ff8fa3'
    : tone === 'success'
      ? '#75f29a'
      : '#9fb0cf';
}

function blockHasNativeLockBadge(block) {
  if (!block) return false;
  const badges = Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'));
  return badges.some((badge) => badge.textContent.trim() === 'L' && badge.style.display !== 'none');
}

function getBlock(itemId = '') {
  if (!itemId) return null;
  return document.querySelector(`.sbi-cursus-block[data-id="${CSS.escape(itemId)}"]`);
}

function getEffectiveLockStateForBlock(block) {
  const itemId = block?.dataset?.id || '';
  const stored = readLockState(itemId);
  if (stored !== null) return stored;
  return blockHasNativeLockBadge(block);
}

function getInspectorLockInput() {
  return document.querySelector('#cursus-inspector-content input[data-field="isLocked"]');
}

function forceItemUnlocked(itemId = '') {
  if (!itemId) return;
  writeLockState(itemId, false);
  forceUnlockUntil = Date.now() + 3500;

  const selectedId = getSelectedItemId();
  const input = getInspectorLockInput();
  if (input && selectedId === itemId) input.checked = false;

  const block = getBlock(itemId);
  if (block) {
    block.classList.remove('sbi-is-locked');
    block.classList.add('sbi-is-unlocked');
    block.dataset.sbiLocked = 'false';
    block.setAttribute('draggable', 'true');
    block.setAttribute('aria-disabled', 'false');
  }
}

function polishInspectorActions() {
  const inspector = document.getElementById('cursus-inspector-content');
  if (!inspector) return;

  inspector
    .querySelectorAll('button[data-action="move-left"], button[data-action="move-right"], button[data-action="order-up"], button[data-action="order-down"]')
    .forEach((button) => button.remove());
}

function polishLockCheckbox() {
  const inspector = document.getElementById('cursus-inspector-content');
  if (!inspector) return;

  const input = inspector.querySelector('input[data-field="isLocked"]');
  if (!input) return;

  const itemId = getSelectedItemId();
  const stored = readLockState(itemId);
  if (stored !== null) input.checked = stored;

  const row = input.closest('.sbi-cursus-check-row');
  if (row) {
    row.title = input.checked
      ? 'Bloc verrouillé : il ne peut pas être déplacé.'
      : 'Bloc déverrouillé : il reste à sa position actuelle et peut être déplacé.';
  }
}

function polishLockedBlocks() {
  const root = getRoot();
  if (!root) return;

  root.querySelectorAll('.sbi-cursus-block[data-id]').forEach((block) => {
    const locked = getEffectiveLockStateForBlock(block);
    block.classList.toggle('sbi-is-locked', locked);
    block.classList.toggle('sbi-is-unlocked', !locked);
    block.dataset.sbiLocked = locked ? 'true' : 'false';
    block.setAttribute('draggable', locked ? 'false' : 'true');
    block.setAttribute('aria-disabled', locked ? 'true' : 'false');
    block.title = locked
      ? 'Bloc verrouillé : décoche “Dates / position verrouillées” pour le déplacer.'
      : 'Bloc déverrouillé : glisse pour déplacer le bloc.';

    const badges = Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'));
    badges.forEach((badge) => {
      if (badge.textContent.trim() === 'L') badge.style.display = locked ? '' : 'none';
    });
  });
}

function polishCoherenceMessage() {
  const detail = document.getElementById('cursus-coherence-detail');
  if (!detail) return;

  detail.textContent = detail.textContent
    .replace(/Éléments parallèles sans cours lié/g, 'Un devoir, examen ou live n’est lié à aucun cours')
    .replace(/Elements parallèles sans cours lié/g, 'Un devoir, examen ou live n’est lié à aucun cours');
}

function runPolish() {
  polishInspectorActions();
  polishLockCheckbox();
  polishLockedBlocks();
  polishCoherenceMessage();
}

function schedulePolish(delay = 0) {
  window.cancelAnimationFrame(cleanupFrame);
  if (delay > 0) {
    window.setTimeout(() => {
      cleanupFrame = window.requestAnimationFrame(runPolish);
    }, delay);
    return;
  }
  cleanupFrame = window.requestAnimationFrame(runPolish);
}

function handleManualLockToggle(event) {
  const root = getRoot();
  if (!root) return;

  const target = event.target?.closest?.('input[data-field="isLocked"]');
  if (!target || !root.contains(target)) return;

  const itemId = getSelectedItemId();
  if (!itemId) return;

  // Les events synthétiques viennent du drag natif. Ils ne doivent pas recoller le verrou visuel.
  if (!event.isTrusted && Date.now() < forceUnlockUntil && target.checked) {
    event.stopImmediatePropagation();
    forceItemUnlocked(itemId);
    setStatus('Bloc déplacé : il reste déverrouillé. Verrouille-le manuellement si besoin.', 'success');
    schedulePolish();
    return;
  }

  // Seul le geste utilisateur décide de l'état final du verrou.
  if (event.isTrusted) {
    writeLockState(itemId, Boolean(target.checked));
    if (target.checked) {
      setStatus('Bloc verrouillé : il ne peut plus être déplacé.', 'success');
    } else {
      setStatus('Bloc déverrouillé : il reste à sa position actuelle et peut être déplacé.', 'success');
    }
    schedulePolish();
  }
}

function handleStartWeekSyntheticChange(event) {
  const root = getRoot();
  if (!root || !draggedUnlockedItemId) return;

  const target = event.target?.closest?.('input[data-field="startWeek"]');
  if (!target || !root.contains(target)) return;
  if (event.isTrusted) return;

  // Le vieux coeur Cursus coche le verrou après un déplacement via le champ startWeek.
  // On laisse la position se mettre à jour, puis on réimpose l'état déverrouillé côté UI.
  forceUnlockUntil = Date.now() + 3500;
  window.setTimeout(() => {
    forceItemUnlocked(draggedUnlockedItemId);
    schedulePolish();
  }, 35);
  window.setTimeout(() => {
    forceItemUnlocked(draggedUnlockedItemId);
    schedulePolish();
  }, 180);
}

function handleDragStart(event) {
  const root = getRoot();
  if (!root) return;

  const block = event.target?.closest?.('.sbi-cursus-block[data-id]');
  if (!block || !root.contains(block)) return;

  const locked = getEffectiveLockStateForBlock(block);

  if (!locked) {
    draggedUnlockedItemId = block.dataset.id || '';
    forceItemUnlocked(draggedUnlockedItemId);
    forceUnlockUntil = Date.now() + 3500;
    return;
  }

  draggedUnlockedItemId = '';
  event.preventDefault();
  event.stopImmediatePropagation();
  block.classList.add('sbi-is-locked');
  block.dataset.sbiLocked = 'true';
  block.setAttribute('draggable', 'false');
  setStatus('Bloc verrouillé : désactive le verrouillage pour le déplacer.', 'error');
}

function handleDragEndOrDrop() {
  if (!draggedUnlockedItemId) return;
  const itemId = draggedUnlockedItemId;
  forceUnlockUntil = Date.now() + 3500;

  window.setTimeout(() => {
    forceItemUnlocked(itemId);
    schedulePolish();
  }, 60);
  window.setTimeout(() => {
    forceItemUnlocked(itemId);
    schedulePolish();
  }, 240);
  window.setTimeout(() => {
    forceItemUnlocked(itemId);
    if (draggedUnlockedItemId === itemId) draggedUnlockedItemId = '';
    schedulePolish();
  }, 700);
}

function bindEvents() {
  document.addEventListener('input', handleManualLockToggle, true);
  document.addEventListener('change', handleManualLockToggle, true);
  document.addEventListener('input', handleStartWeekSyntheticChange, true);
  document.addEventListener('change', handleStartWeekSyntheticChange, true);
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('drop', handleDragEndOrDrop, true);
  document.addEventListener('dragend', handleDragEndOrDrop, true);

  ['click', 'keyup'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      const root = getRoot();
      if (!root) return;
      if (event.target && root.contains(event.target)) schedulePolish();
    }, true);
  });

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(schedulePolish, 90));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(schedulePolish, 90));
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-safe-polish-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-safe-polish-style';
  style.textContent = `
    #cursus-inspector-content button[data-action="move-left"],
    #cursus-inspector-content button[data-action="move-right"],
    #cursus-inspector-content button[data-action="order-up"],
    #cursus-inspector-content button[data-action="order-down"] {
      display: none !important;
    }

    .sbi-cursus-block.sbi-is-locked,
    .sbi-cursus-block[data-sbi-locked="true"] {
      cursor: not-allowed !important;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16), 0 14px 28px rgba(0, 0, 0, .28);
    }

    .sbi-cursus-block.sbi-is-unlocked,
    .sbi-cursus-block[data-sbi-locked="false"] {
      cursor: grab !important;
    }

    .sbi-cursus-block.sbi-is-locked .sbi-cursus-block-handle,
    .sbi-cursus-block[data-sbi-locked="true"] .sbi-cursus-block-handle {
      opacity: .35;
    }

    .sbi-cursus-block.sbi-is-unlocked .sbi-cursus-block-handle,
    .sbi-cursus-block[data-sbi-locked="false"] .sbi-cursus-block-handle {
      opacity: .95;
    }
  `;
  document.head.appendChild(style);
}

export function initAdminCursusSafePolish() {
  if (installed) {
    schedulePolish();
    return;
  }

  installed = true;
  ensureStyles();
  bindEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedulePolish, { once: true });
  } else {
    schedulePolish();
  }
}

initAdminCursusSafePolish();
