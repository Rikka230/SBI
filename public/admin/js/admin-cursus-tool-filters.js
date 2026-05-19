/**
 * SBI 8.0P.167.109-GPT2.1
 * Cursus toolbox filters - Obligatoires / Optionnels.
 *
 * Périmètre volontairement réduit :
 * - branche les filtres rapides de la boîte à outils Cursus ;
 * - ne touche pas au drag & drop ;
 * - ne touche pas au verrouillage validé en 107.6 ;
 * - pas de MutationObserver global.
 */

import { db } from '/js/firebase-init.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let coursesLoaded = false;
let filterFrame = 0;
let refreshTimer = 0;
const courseRequirementMap = new Map();

function getRoot() {
  return document.getElementById('view-cursus');
}

function getToolList() {
  return document.getElementById('cursus-tool-list');
}

function getActiveFilter() {
  const root = getRoot();
  const active = root?.querySelector?.('[data-tool-filter].is-active');
  return active?.dataset?.toolFilter || 'all';
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isExplicitOptional(course = {}) {
  const stringFields = [
    course.requirement,
    course.requirementLevel,
    course.requiredLevel,
    course.obligationLevel,
    course.courseRequirement,
    course.moduleRequirement,
    course.typeRequirement,
    course.statusRequirement,
    course.importance
  ].map(normalizeText);

  return course.isRequired === false
    || course.required === false
    || course.mandatory === false
    || course.obligatoire === false
    || course.isOptional === true
    || course.optional === true
    || stringFields.some((value) => value.includes('optional') || value.includes('optionnel'));
}

function getCourseRequirement(course = {}) {
  return isExplicitOptional(course) ? 'optional' : 'required';
}

async function loadCourseRequirements() {
  if (coursesLoaded) return;
  coursesLoaded = true;

  try {
    const snap = await getDocs(collection(db, 'courses'));
    courseRequirementMap.clear();
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      courseRequirementMap.set(docSnap.id, getCourseRequirement(data));
    });
  } catch (error) {
    console.warn('[SBI Cursus Filters] Chargement des statuts obligatoire/optionnel impossible :', error);
  }
}

function getCardRequirement(card) {
  const courseId = card?.dataset?.courseId || '';
  return courseRequirementMap.get(courseId) || 'required';
}

function ensureEmptyMessage(toolList) {
  let empty = toolList.querySelector('[data-sbi-tool-filter-empty="true"]');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'sbi-cursus-empty sbi-cursus-filter-empty';
    empty.dataset.sbiToolFilterEmpty = 'true';
    toolList.appendChild(empty);
  }
  return empty;
}

function removeEmptyMessage(toolList) {
  toolList.querySelector('[data-sbi-tool-filter-empty="true"]')?.remove();
}

function applyToolFilter() {
  const root = getRoot();
  const toolList = getToolList();
  if (!root || !toolList) return;

  const filter = getActiveFilter();
  const cards = Array.from(toolList.querySelectorAll('.sbi-cursus-tool-card[data-course-id]'));
  if (!cards.length) {
    removeEmptyMessage(toolList);
    return;
  }

  let visibleCount = 0;
  cards.forEach((card) => {
    const requirement = getCardRequirement(card);
    const visible = filter === 'all' || requirement === filter;
    card.hidden = !visible;
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) visibleCount += 1;
  });

  const count = document.getElementById('cursus-course-count');
  if (count) count.textContent = String(visibleCount);

  if (!visibleCount && filter !== 'all') {
    const empty = ensureEmptyMessage(toolList);
    empty.textContent = filter === 'optional'
      ? 'Aucun cours optionnel ne correspond à ce filtre.'
      : 'Aucun cours obligatoire ne correspond à ce filtre.';
    return;
  }

  removeEmptyMessage(toolList);
}

function scheduleApply(delay = 0) {
  window.clearTimeout(refreshTimer);
  window.cancelAnimationFrame(filterFrame);
  refreshTimer = window.setTimeout(() => {
    filterFrame = window.requestAnimationFrame(applyToolFilter);
  }, delay);
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    if (!getRoot()) return;
    if (event.target?.closest?.('[data-tool-filter]')) scheduleApply(60);
    if (event.target?.closest?.('button[data-action="add-course"][data-id]')) scheduleApply(90);
  }, true);

  document.addEventListener('input', (event) => {
    if (!getRoot()) return;
    if (event.target?.id === 'cursus-search') scheduleApply(80);
  }, true);

  document.addEventListener('change', (event) => {
    if (!getRoot()) return;
    const id = event.target?.id || '';
    if (id === 'cursus-source-filter' || id === 'cursus-formation-select' || id === 'cursus-template-select') {
      scheduleApply(120);
    }
  }, true);

  window.addEventListener('sbi:app-shell:navigated', () => scheduleApply(180));
  window.addEventListener('sbi:app-shell:ready', () => scheduleApply(180));
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-tool-filters-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-tool-filters-style';
  style.textContent = `
    .sbi-cursus-tool-card[hidden] {
      display: none !important;
    }
    .sbi-cursus-filter-empty {
      margin-top: .55rem;
    }
  `;
  document.head.appendChild(style);
}

function primeInitialApply() {
  let attempts = 0;
  const tick = () => {
    if (!getRoot()) return;
    applyToolFilter();
    attempts += 1;
    if (attempts < 10) window.setTimeout(tick, 180);
  };
  tick();
}

export function initAdminCursusToolFilters() {
  if (installed) {
    scheduleApply(60);
    return;
  }

  installed = true;
  ensureStyles();
  bindEvents();

  loadCourseRequirements().then(() => {
    scheduleApply(80);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', primeInitialApply, { once: true });
  } else {
    primeInitialApply();
  }
}

initAdminCursusToolFilters();
