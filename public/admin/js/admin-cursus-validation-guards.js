/**
 * SBI 8.0P.167.185
 * Gardes ciblées Cursus :
 * 1. la boîte à outils Cursus ne doit proposer que les cours validés/publiés ;
 * 2. les remplacements de “Cours futur” doivent conserver leurs marqueurs
 *    jusque dans promotions.coursePlan pour que reviewCourseValidation puisse
 *    notifier les élèves lors de la mise en ligne.
 */

import { db } from '/js/firebase-init.js';
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

const VERSION = '8.0P.167.185';
let observer = null;
let uiScheduled = false;
let markerPatchTimer = 0;
let markerPatchRunning = false;

function clean(value = '', max = 220) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value = '') {
  return clean(value, 240)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getRoot() {
  return document.getElementById('view-cursus');
}

function setStatus(message = '', tone = 'muted') {
  if (!message) return;
  const status = document.getElementById('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function getCurrentTemplateId() {
  return document.getElementById('cursus-template-select')?.value || '';
}

function isPublishedCourseCard(card) {
  if (!card) return false;
  const statusLine = clean(card.querySelector('small')?.textContent || '', 220);
  const normalized = normalize(statusLine);
  return normalized.startsWith('publie') || normalized.includes('statut publie');
}

function removeGuardEmptyMessage(list) {
  list.querySelector('.sbi-cursus-published-only-empty')?.remove();
}

function ensureGuardEmptyMessage(list) {
  if (list.querySelector('.sbi-cursus-published-only-empty')) return;
  const empty = document.createElement('div');
  empty.className = 'sbi-cursus-empty sbi-cursus-published-only-empty';
  empty.textContent = 'Aucun cours validé ne correspond à ce filtre.';
  list.appendChild(empty);
}

function applyPublishedOnlyToolboxFilter() {
  const root = getRoot();
  const list = document.getElementById('cursus-tool-list');
  if (!root || !list) return;

  const cards = Array.from(list.querySelectorAll('.sbi-cursus-tool-card'));
  if (!cards.length) {
    removeGuardEmptyMessage(list);
    return;
  }

  let visibleCount = 0;
  cards.forEach((card) => {
    const published = isPublishedCourseCard(card);
    card.hidden = !published;
    card.setAttribute('aria-hidden', published ? 'false' : 'true');
    card.dataset.sbiPublishedOnlyGuard = published ? 'visible' : 'hidden';

    const button = card.querySelector('button[data-action][data-id]');
    if (!published) {
      if (button) {
        button.disabled = true;
        button.title = 'Cours non validé : invisible dans Cursus.';
      }
      return;
    }

    visibleCount += 1;
    if (button && button.title === 'Cours non validé : invisible dans Cursus.') {
      button.disabled = false;
      button.title = '';
    }
  });

  const count = document.getElementById('cursus-course-count');
  if (count) count.textContent = String(visibleCount);

  if (visibleCount === 0) ensureGuardEmptyMessage(list);
  else removeGuardEmptyMessage(list);
}

function hasReplacementMarker(item = {}) {
  const source = normalize(`${item.replacementSource || ''} ${item.source || ''}`);
  return Boolean(clean(item.replacedPlaceholderId || item.placeholderId || '', 180))
    || source.includes('placeholder-replace')
    || source.includes('placeholder-replaced')
    || item.fromPlaceholderReplacement === true;
}

function buildReplacementMarkersFromTemplate(template = {}) {
  const markers = new Map();
  const items = Array.isArray(template.items) ? template.items : [];

  items.forEach((item) => {
    const courseId = clean(item.courseId || '', 180);
    if (!courseId || !hasReplacementMarker(item)) return;

    markers.set(courseId, {
      courseId,
      title: clean(item.courseTitle || item.title || '', 180),
      replacedPlaceholderId: clean(item.replacedPlaceholderId || item.placeholderId || item.id || item.itemId || '', 180),
      replacementSource: 'placeholder-replace-v2',
      replacementMarkedBy: VERSION
    });
  });

  return markers;
}

function patchPlanItemWithMarker(item = {}, marker = null) {
  if (!marker || clean(item.courseId || '', 180) !== marker.courseId) return { item, changed: false };

  const next = {
    ...item,
    source: 'placeholder-replace-v2',
    replacementSource: 'placeholder-replace-v2',
    replacedPlaceholderId: clean(item.replacedPlaceholderId || marker.replacedPlaceholderId || '', 180),
    fromPlaceholderReplacement: true,
    replacementMarkerSource: VERSION
  };

  const changed = item.source !== next.source
    || item.replacementSource !== next.replacementSource
    || item.replacedPlaceholderId !== next.replacedPlaceholderId
    || item.fromPlaceholderReplacement !== true
    || item.replacementMarkerSource !== VERSION;

  return { item: next, changed };
}

async function waitForTemplateId(timeoutMs = 7000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const templateId = getCurrentTemplateId();
    if (templateId) return templateId;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }
  return '';
}

async function patchLinkedPromotionCoursePlans(templateId = '') {
  if (!templateId || markerPatchRunning) return { updated: 0, markers: 0 };
  markerPatchRunning = true;

  try {
    const templateSnap = await getDoc(doc(db, 'curriculumTemplates', templateId));
    if (!templateSnap.exists()) return { updated: 0, markers: 0 };

    const template = { id: templateSnap.id, ...(templateSnap.data() || {}) };
    const markers = buildReplacementMarkersFromTemplate(template);
    if (!markers.size) return { updated: 0, markers: 0 };

    const promotionsSnap = await getDocs(query(
      collection(db, 'promotions'),
      where('curriculumTemplateId', '==', templateId)
    ));

    let updated = 0;
    for (const promotionSnap of promotionsSnap.docs) {
      const promotion = promotionSnap.data() || {};
      if (clean(promotion.status || 'active', 40).toLowerCase() === 'archived') continue;

      const coursePlan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
      let changed = false;
      const patchedPlan = coursePlan.map((item) => {
        const marker = markers.get(clean(item.courseId || '', 180));
        const result = patchPlanItemWithMarker(item, marker);
        if (result.changed) changed = true;
        return result.item;
      });

      if (!changed) continue;

      await updateDoc(doc(db, 'promotions', promotionSnap.id), {
        coursePlan: patchedPlan,
        coursePlanReplacementMarkersFixedAt: serverTimestamp(),
        coursePlanReplacementMarkersFixedBy: VERSION,
        updatedAt: serverTimestamp()
      });
      updated += 1;
    }

    if (updated > 0) {
      setStatus(`${updated} promotion${updated > 1 ? 's' : ''} préparée${updated > 1 ? 's' : ''} pour les notifications élèves.`, 'success');
    }

    return { updated, markers: markers.size };
  } catch (error) {
    console.warn('[SBI Cursus] Correction marqueurs coursePlan impossible :', error);
    setStatus('Cursus sauvegardé, mais marqueurs de notification élèves à vérifier.', 'error');
    return { updated: 0, markers: 0, error };
  } finally {
    markerPatchRunning = false;
  }
}

async function patchCurrentTemplateMarkers() {
  const templateId = await waitForTemplateId();
  if (!templateId) return;
  await patchLinkedPromotionCoursePlans(templateId);
}

function scheduleMarkerPatch(delay = 2400) {
  window.clearTimeout(markerPatchTimer);
  markerPatchTimer = window.setTimeout(() => {
    void patchCurrentTemplateMarkers();
  }, delay);
}

function scheduleUiFilter() {
  if (uiScheduled) return;
  uiScheduled = true;
  window.requestAnimationFrame(() => {
    uiScheduled = false;
    applyPublishedOnlyToolboxFilter();
  });
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('#cursus-save-btn')) {
      scheduleMarkerPatch(2600);
      window.setTimeout(() => scheduleMarkerPatch(5200), 0);
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target?.closest?.('#cursus-template-select')) {
      scheduleMarkerPatch(1800);
      scheduleUiFilter();
    }
    if (event.target?.closest?.('#cursus-formation-select, #cursus-source-filter')) {
      scheduleUiFilter();
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.closest?.('#cursus-search')) scheduleUiFilter();
  }, true);
}

function observeCursus() {
  observer?.disconnect?.();
  const root = getRoot();
  if (!root) return;

  observer = new MutationObserver(scheduleUiFilter);
  observer.observe(root, { childList: true, subtree: true });
  scheduleUiFilter();
  scheduleMarkerPatch(2600);
}

function init() {
  bindEvents();
  observeCursus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(observeCursus, 100));
window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(observeCursus, 100));
