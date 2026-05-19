/**
 * SBI 8.0P.167.108-GPT2.1
 * Cursus metrics persistence - patch ciblé sans MutationObserver global.
 *
 * Objectif :
 * - persister displayWeeks / effectiveWeeks / effectiveDurationDays dans curriculumTemplates ;
 * - restaurer displayWeeks au chargement d'un cursus ;
 * - clarifier le footer : période affichée vs durée effective.
 *
 * Important : ce module n'intercepte pas le rendu Cursus et n'observe pas toute la page.
 * Il agit uniquement sur événements ciblés : sélection cursus, clic sauvegarde, clics timeline.
 */

import { db } from '/js/firebase-init.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let footerFrame = 0;
let lastHydratedTemplateId = '';
let lastPersistSignature = '';

const VERSION = '8.0P.167.108-GPT2.1';
const DEFAULT_DISPLAY_WEEKS = 52;

function getRoot() {
  return document.getElementById('view-cursus');
}

function getTemplateSelect() {
  return document.getElementById('cursus-template-select');
}

function getTemplateId() {
  return getTemplateSelect()?.value || '';
}

function parseCssNumber(node, propertyName, fallback = 0) {
  if (!node) return fallback;
  const value = parseFloat(getComputedStyle(node).getPropertyValue(propertyName));
  return Number.isFinite(value) ? value : fallback;
}

function getCanvasWeeks() {
  const canvas = document.getElementById('cursus-timeline-canvas');
  if (!canvas) return 0;
  const raw = parseInt(getComputedStyle(canvas).getPropertyValue('--cursus-weeks'), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function getBlocks() {
  const root = getRoot();
  if (!root) return [];
  return Array.from(root.querySelectorAll('.sbi-cursus-block[data-id]'));
}

function getBlockStart(block) {
  return Math.max(0, Math.round(parseCssNumber(block, '--start-week', 0)));
}

function getBlockSpan(block) {
  return Math.max(1, Math.round(parseCssNumber(block, '--span-week', 1)));
}

function computeEffectiveWeeksFromDom() {
  const blocks = getBlocks();
  if (!blocks.length) return 0;
  return blocks.reduce((max, block) => Math.max(max, getBlockStart(block) + getBlockSpan(block)), 0);
}

function computeMetrics() {
  const api = window.SBI_CURSUS_WEEKS || null;
  const effectiveWeeks = Math.max(
    0,
    Number(api?.getEffectiveWeeks?.() || 0),
    computeEffectiveWeeksFromDom()
  );
  const displayWeeks = Math.max(
    DEFAULT_DISPLAY_WEEKS,
    Number(api?.getDisplayWeeks?.() || 0),
    getCanvasWeeks(),
    effectiveWeeks
  );
  const effectiveDurationDays = Math.max(
    0,
    Number(api?.getEffectiveDurationDays?.() || 0),
    effectiveWeeks * 7
  );

  return {
    displayWeeks,
    effectiveWeeks,
    effectiveDurationDays
  };
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

function updateFooterLabels() {
  const periodStrong = document.getElementById('cursus-stat-period');
  const durationStrong = document.getElementById('cursus-stat-duration');
  const periodLabel = periodStrong?.parentElement?.querySelector('span');
  const durationLabel = durationStrong?.parentElement?.querySelector('span');
  const metrics = computeMetrics();

  if (periodStrong) {
    periodStrong.textContent = `S1 → S${metrics.displayWeeks}`;
    periodStrong.title = `${metrics.displayWeeks} semaines affichées sur la timeline.`;
  }
  if (durationStrong) {
    durationStrong.textContent = `${metrics.effectiveDurationDays} j`;
    durationStrong.title = `${metrics.effectiveWeeks} semaine${metrics.effectiveWeeks > 1 ? 's' : ''} effective${metrics.effectiveWeeks > 1 ? 's' : ''}, calculée${metrics.effectiveWeeks > 1 ? 's' : ''} depuis le dernier bloc placé.`;
  }
  if (periodLabel) periodLabel.textContent = 'période affichée';
  if (durationLabel) durationLabel.textContent = 'durée effective';
}

function scheduleFooterUpdate(delay = 0) {
  window.cancelAnimationFrame(footerFrame);
  if (delay > 0) {
    window.setTimeout(() => scheduleFooterUpdate(), delay);
    return;
  }
  footerFrame = window.requestAnimationFrame(updateFooterLabels);
}

async function hydrateDisplayWeeksFromTemplate(templateId = getTemplateId()) {
  if (!templateId || templateId === lastHydratedTemplateId) return;
  lastHydratedTemplateId = templateId;

  try {
    const snap = await getDoc(doc(db, 'curriculumTemplates', templateId));
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const displayWeeks = Math.max(0, Number(data.displayWeeks || data.timelineDisplayWeeks || 0));
    if (displayWeeks > 0) {
      window.dispatchEvent(new CustomEvent('sbi:cursus:display-weeks', {
        detail: { displayWeeks, source: 'curriculumTemplates', templateId }
      }));
    }
    scheduleFooterUpdate(120);
  } catch (error) {
    console.warn('[SBI Cursus Metrics] Impossible de restaurer displayWeeks :', error);
  }
}

async function persistMetricsForTemplate(templateId = getTemplateId(), attempt = 0) {
  if (!getRoot()) return;

  const safeTemplateId = templateId || getTemplateId();
  if (!safeTemplateId) {
    if (attempt < 4) window.setTimeout(() => persistMetricsForTemplate('', attempt + 1), 450);
    return;
  }

  const metrics = computeMetrics();
  const signature = `${safeTemplateId}:${metrics.displayWeeks}:${metrics.effectiveWeeks}:${metrics.effectiveDurationDays}`;
  if (signature === lastPersistSignature && attempt > 0) return;

  try {
    await updateDoc(doc(db, 'curriculumTemplates', safeTemplateId), {
      displayWeeks: metrics.displayWeeks,
      effectiveWeeks: metrics.effectiveWeeks,
      effectiveDurationDays: metrics.effectiveDurationDays,
      timelineMetricsVersion: VERSION,
      timelineMetricsUpdatedAt: serverTimestamp()
    });
    lastPersistSignature = signature;
    setStatus('Cursus sauvegardé avec semaines affichées et durée effective.', 'success');
    scheduleFooterUpdate();
  } catch (error) {
    if (attempt < 4) {
      window.setTimeout(() => persistMetricsForTemplate('', attempt + 1), 650);
      return;
    }
    console.warn('[SBI Cursus Metrics] Persistance metrics impossible :', error);
  }
}

function schedulePersistAfterSave() {
  [450, 1100, 1900, 2900].forEach((delay, index) => {
    window.setTimeout(() => persistMetricsForTemplate('', index), delay);
  });
}

function bindEvents() {
  document.addEventListener('change', (event) => {
    const root = getRoot();
    if (!root) return;

    const target = event.target;
    if (target?.id === 'cursus-template-select') {
      lastHydratedTemplateId = '';
      window.setTimeout(() => hydrateDisplayWeeksFromTemplate(), 260);
      window.setTimeout(() => scheduleFooterUpdate(), 420);
      return;
    }

    if (target && root.contains(target)) scheduleFooterUpdate(80);
  }, true);

  document.addEventListener('input', (event) => {
    const root = getRoot();
    if (!root) return;
    if (event.target && root.contains(event.target)) scheduleFooterUpdate(80);
  }, true);

  document.addEventListener('click', (event) => {
    const root = getRoot();
    if (!root) return;

    const target = event.target;
    const saveButton = target?.closest?.('#cursus-save-btn, #cursus-duplicate-btn');
    if (saveButton) schedulePersistAfterSave();

    if (target && root.contains(target)) {
      scheduleFooterUpdate(120);
      scheduleFooterUpdate(420);
    }
  }, true);

  document.addEventListener('drop', (event) => {
    const root = getRoot();
    if (!root) return;
    if (event.target && root.contains(event.target)) {
      scheduleFooterUpdate(180);
      scheduleFooterUpdate(520);
    }
  }, true);

  window.addEventListener('sbi:app-shell:navigated', () => {
    window.setTimeout(() => {
      lastHydratedTemplateId = '';
      hydrateDisplayWeeksFromTemplate();
      scheduleFooterUpdate();
    }, 180);
  });

  window.addEventListener('sbi:app-shell:ready', () => {
    window.setTimeout(() => {
      hydrateDisplayWeeksFromTemplate();
      scheduleFooterUpdate();
    }, 180);
  });
}

export function initAdminCursusMetricsPersistence() {
  if (installed) {
    scheduleFooterUpdate();
    hydrateDisplayWeeksFromTemplate();
    return;
  }

  installed = true;
  bindEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      hydrateDisplayWeeksFromTemplate();
      scheduleFooterUpdate();
    }, { once: true });
  } else {
    hydrateDisplayWeeksFromTemplate();
    scheduleFooterUpdate();
  }
}

initAdminCursusMetricsPersistence();
