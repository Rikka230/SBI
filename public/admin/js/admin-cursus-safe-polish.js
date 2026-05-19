/**
 * SBI 8.0P.167.107.3-GPT2.1
 * Cursus safe hardening - verrouillage UI progressif sans MutationObserver global.
 *
 * Objectifs :
 * - garder uniquement le bouton Supprimer dans l'inspecteur ;
 * - reformuler le message des éléments parallèles sans cours lié ;
 * - corriger le comportement verrouillé / déverrouillé sans recalcul violent ;
 * - empêcher le drag d'un bloc explicitement verrouillé ;
 * - laisser un bloc déverrouillé à sa position actuelle et déplaçable.
 *
 * Note technique : le champ natif `isLocked` de l'ancien module sert aussi à autoriser
 * le placement manuel. Pour éviter les retours en S1 et les empilements, ce module
 * intercepte uniquement le checkbox de verrouillage et gère un verrou UI stable par item.
 */

let installed = false;
let cleanupFrame = 0;

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
  return badges.some((badge) => badge.textContent.trim() === 'L');
}

function getEffectiveLockStateForBlock(block) {
  const itemId = block?.dataset?.id || '';
  const stored = readLockState(itemId);
  if (stored !== null) return stored;
  return blockHasNativeLockBadge(block);
}

function getEffectiveLockStateForSelectedInspector() {
  const itemId = getSelectedItemId();
  const stored = readLockState(itemId);
  if (stored !== null) return stored;
  const input = document.querySelector('#cursus-inspector-content input[data-field="isLocked"]');
  return Boolean(input?.checked);
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
      if (badge.textContent.trim() === 'L') {
        badge.style.display = locked ? '' : 'none';
      }
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

function schedulePolish() {
  window.cancelAnimationFrame(cleanupFrame);
  cleanupFrame = window.requestAnimationFrame(runPolish);
}

function handleLockToggle(event) {
  const root = getRoot();
  if (!root) return;

  const target = event.target?.closest?.('input[data-field="isLocked"]');
  if (!target || !root.contains(target)) return;

  const itemId = getSelectedItemId();
  if (!itemId) return;

  // On empêche l'ancien handler de transformer le déverrouillage en recalcul complet.
  event.stopImmediatePropagation();

  writeLockState(itemId, Boolean(target.checked));
  target.checked = Boolean(target.checked);

  if (target.checked) {
    setStatus('Bloc verrouillé : il ne peut plus être déplacé.', 'success');
  } else {
    setStatus('Bloc déverrouillé : il reste à sa position actuelle et peut être déplacé.', 'success');
  }

  schedulePolish();
}

function handleDragStart(event) {
  const root = getRoot();
  if (!root) return;

  const block = event.target?.closest?.('.sbi-cursus-block[data-id]');
  if (!block || !root.contains(block)) return;

  if (!getEffectiveLockStateForBlock(block)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  block.classList.add('sbi-is-locked');
  block.dataset.sbiLocked = 'true';
  block.setAttribute('draggable', 'false');
  setStatus('Bloc verrouillé : désactive le verrouillage pour le déplacer.', 'error');
}

function bindEvents() {
  document.addEventListener('input', handleLockToggle, true);
  document.addEventListener('change', handleLockToggle, true);
  document.addEventListener('dragstart', handleDragStart, true);

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
