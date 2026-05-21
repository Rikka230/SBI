import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const SELECT_ID = 'teacher-courses-promotion-filter';
const STORAGE_KEY = 'sbi:teacher-courses:selected-promotion';
const STYLE_ID = 'teacher-promotion-planning-select-style-8-0p-167-144';
const ALL_PROMOTIONS_VALUE = '__all_promotions__';
const MAX_QUERY_VALUES = 10;

let activeCleanup = null;
let promotions = [];
let selectedPromotionId = ALL_PROMOTIONS_VALUE;
let rootObserver = null;

function clean(value = '') {
  return String(value ?? '').trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean)));
}

function chunkArray(items = [], size = MAX_QUERY_VALUES) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function escapeHtml(value = '') {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(ms));
  } catch {
    return '';
  }
}

function formatPlanDates(item = {}) {
  const start = formatDate(item.recommendedStartAt || item.plannedStartAt || item.startAt);
  const end = formatDate(item.recommendedEndAt || item.plannedEndAt || item.endAt);
  const deadline = formatDate(item.deadlineAt || item.dueAt);
  if (start && end && start !== end) return `${start} → ${end}`;
  if (start) return `Début ${start}`;
  if (deadline) return `Échéance ${deadline}`;
  return 'Dates à confirmer';
}

function getPriorityLabel(priority = 'normal') {
  const safe = clean(priority).toLowerCase();
  if (safe === 'urgent') return 'Priorité urgente';
  if (safe === 'high' || safe === 'haute') return 'Priorité haute';
  return 'Priorité normale';
}

function getPriorityTone(priority = 'normal') {
  const safe = clean(priority).toLowerCase();
  if (safe === 'urgent') return 'urgent';
  if (safe === 'high' || safe === 'haute') return 'high';
  return 'normal';
}

function isCoursePlanItem(item = {}) {
  const courseId = clean(item.courseId);
  if (!courseId) return false;
  const type = clean(item.type || item.itemType || 'real_course');
  return !['placeholder_course', 'buffer_period', 'revision_period', 'catchup_period', 'assignment', 'exam', 'evaluation', 'live_session', 'workshop'].includes(type);
}

function getPromotionLabel(promotion = {}) {
  return clean(promotion.name || promotion.promotionName || promotion.curriculumTitle || 'Promotion');
}

function getPromotionDateLabel(promotion = {}) {
  const start = formatDate(promotion.startDate);
  const end = formatDate(promotion.endDate);
  if (start && end) return `${start} → ${end}`;
  if (start) return `début ${start}`;
  return '';
}

async function safeGetDocs(queryRef, label = 'requête') {
  try {
    return await getDocs(queryRef);
  } catch (error) {
    console.warn(`[SBI Teacher Promotion Select] ${label} ignorée :`, error);
    return null;
  }
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function loadTeacherFormationIds(uid, profile = {}) {
  const ids = new Set(normalizeList(profile.formationIds));

  for (const chunk of chunkArray(normalizeList(profile.formationsAcces))) {
    const snap = await safeGetDocs(
      query(collection(db, 'formations'), where('titre', 'in', chunk)),
      'formations titres professeur'
    );
    snap?.forEach((item) => ids.add(item.id));
  }

  const linkedSnap = await safeGetDocs(
    query(collection(db, 'formations'), where('profs', 'array-contains', uid)),
    'formations professeur'
  );
  linkedSnap?.forEach((item) => ids.add(item.id));

  return Array.from(ids).filter(Boolean);
}

async function loadPromotionsForFormationIds(formationIds = []) {
  const rows = [];
  for (const chunk of chunkArray(formationIds)) {
    const snap = await safeGetDocs(
      query(collection(db, 'promotions'), where('formationId', 'in', chunk)),
      'promotions par formation'
    );
    snap?.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  }

  const map = new Map();
  rows.forEach((promotion) => {
    if (!promotion?.id) return;
    if ((promotion.status || 'active') === 'archived') return;
    if (!Array.isArray(promotion.coursePlan) || !promotion.coursePlan.some(isCoursePlanItem)) return;
    map.set(promotion.id, promotion);
  });

  return Array.from(map.values()).sort((a, b) => {
    const aDate = toMillis(a.startDate);
    const bDate = toMillis(b.startDate);
    if (aDate || bDate) return bDate - aDate;
    return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
  });
}

function getSelectedPromotion() {
  if (selectedPromotionId === ALL_PROMOTIONS_VALUE) return null;
  return promotions.find((promotion) => promotion.id === selectedPromotionId) || null;
}

function getPlanItems(promotion = {}) {
  const plan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
  return plan
    .map((item, index) => ({ ...item, order: Number.isFinite(Number(item.order)) ? Number(item.order) : index }))
    .filter(isCoursePlanItem)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function getPlanMap(promotion = {}) {
  const map = new Map();
  getPlanItems(promotion).forEach((item) => map.set(clean(item.courseId), item));
  return map;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${SELECT_ID} {
      min-width: 260px;
      border-color: rgba(245,158,11,0.34);
      background: rgba(245,158,11,0.10);
      color: var(--text-main, #fff);
    }
    .teacher-course-card__planning[data-sbi-promotion-bridge="true"] {
      outline: 1px solid rgba(245,158,11,0.16);
      outline-offset: 2px;
      border-radius: 999px;
    }
  `;
  document.head.appendChild(style);
}

function ensureSelect() {
  injectStyle();
  let select = document.getElementById(SELECT_ID);
  if (select) return select;

  const toolbar = document.querySelector('.teacher-courses-toolbar__right');
  if (!toolbar) return null;

  select = document.createElement('select');
  select.id = SELECT_ID;
  select.className = 'teacher-courses-select';
  select.setAttribute('aria-label', 'Choisir une promotion pour filtrer le cursus');

  const sort = document.getElementById('teacher-courses-sort');
  if (sort?.parentElement === toolbar) toolbar.insertBefore(select, sort.nextSibling);
  else toolbar.insertBefore(select, toolbar.firstChild);

  select.addEventListener('change', () => {
    selectedPromotionId = select.value || ALL_PROMOTIONS_VALUE;
    try { localStorage.setItem(STORAGE_KEY, selectedPromotionId); } catch {}
    applySelectedPromotionContext();
  });

  return select;
}

function renderSelect() {
  const select = ensureSelect();
  if (!select) return false;

  const stored = (() => {
    try { return localStorage.getItem(STORAGE_KEY) || ALL_PROMOTIONS_VALUE; } catch { return ALL_PROMOTIONS_VALUE; }
  })();

  selectedPromotionId = stored === ALL_PROMOTIONS_VALUE || promotions.some((promotion) => promotion.id === stored)
    ? stored
    : ALL_PROMOTIONS_VALUE;

  const promotionOptions = promotions.map((promotion) => {
    const label = getPromotionLabel(promotion);
    const dates = getPromotionDateLabel(promotion);
    return `<option value="${escapeHtml(promotion.id)}">Cursus : ${escapeHtml(label)}${dates ? ` · ${escapeHtml(dates)}` : ''}</option>`;
  }).join('');

  select.disabled = false;
  select.innerHTML = `
    <option value="${ALL_PROMOTIONS_VALUE}">Toutes les promotions · sans dates</option>
    ${promotionOptions}
  `;
  select.value = selectedPromotionId;
  return true;
}

function removePlanning(card) {
  card.querySelectorAll('.teacher-course-card__planning').forEach((node) => node.remove());
}

function renderPlanningHtml(item = {}, promotion = {}) {
  const priorityTone = getPriorityTone(item.priorityLevel);
  return `
    <div class="teacher-course-card__planning" data-sbi-promotion-bridge="true">
      <span>${escapeHtml(formatPlanDates(item))}</span>
      <span class="teacher-course-priority teacher-course-priority--${escapeHtml(priorityTone)}">${escapeHtml(getPriorityLabel(item.priorityLevel))}</span>
      <span>${escapeHtml(getPromotionLabel(promotion))}</span>
    </div>
  `;
}

function updateCountText(totalVisible, promotion = null) {
  const helper = document.getElementById('teacher-courses-count');
  if (!helper) return;
  if (!promotion) {
    helper.textContent = `${totalVisible} cours affiché${totalVisible > 1 ? 's' : ''} · dates masquées`;
    return;
  }
  helper.textContent = `${totalVisible} cours du cursus · ${getPromotionLabel(promotion)}`;
}

function applySelectedPromotionContext() {
  const root = document.getElementById('teacher-courses-list-container');
  if (!root) return;

  const cards = Array.from(root.querySelectorAll('.teacher-course-card[data-course-id]'));
  const promotion = getSelectedPromotion();

  if (!promotion) {
    cards.forEach((card) => {
      removePlanning(card);
      card.style.display = '';
      card.style.order = '';
    });
    updateCountText(cards.length, null);
    return;
  }

  const planMap = getPlanMap(promotion);
  let visibleCount = 0;

  cards.forEach((card) => {
    const courseId = clean(card.dataset.courseId);
    const plan = planMap.get(courseId) || null;
    removePlanning(card);

    if (!plan) {
      card.style.display = 'none';
      card.style.order = '';
      return;
    }

    visibleCount += 1;
    card.style.display = '';
    card.style.order = String(Number(plan.order || 0));

    const body = card.querySelector('.teacher-course-card__body');
    const signature = body?.querySelector('.teacher-course-card__signature');
    const html = renderPlanningHtml(plan, promotion);
    if (signature) signature.insertAdjacentHTML('afterend', html);
    else body?.insertAdjacentHTML('beforeend', html);
  });

  updateCountText(visibleCount, promotion);
}

function installRootObserver() {
  const root = document.getElementById('teacher-courses-list-container');
  if (!root || rootObserver) return;
  rootObserver = new MutationObserver(() => {
    window.requestAnimationFrame(() => {
      renderSelect();
      applySelectedPromotionContext();
    });
  });
  rootObserver.observe(root, { childList: true, subtree: false });
}

function forceTeacherEditorNavigation(courseId = '') {
  const safeCourseId = clean(courseId);
  if (!safeCourseId) return;

  const baseUrl = '/teacher/mes-cours.html';
  const editUrl = `${baseUrl}?edit=${encodeURIComponent(safeCourseId)}`;

  try {
    window.history.replaceState({ sbiTeacherCourseTab: 'list' }, '', baseUrl);
    window.history.pushState({ sbiTeacherCourseTab: 'editor', courseId: safeCourseId }, '', editUrl);
    window.SBI_APP_SHELL_CURRENT_URL = window.location.href;
  } catch {}

  if (typeof window.switchCourseTab === 'function') window.switchCourseTab('tab-editor');

  if (typeof window.editCourse === 'function') {
    window.editCourse(safeCourseId);
  } else {
    window.location.href = editUrl;
  }
}

function handleTeacherEditorBridgeClick(event) {
  const button = event.target?.closest?.('[data-teacher-edit-course]');
  if (!button) return;
  const courseId = button.getAttribute('data-teacher-edit-course');
  if (!courseId) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  forceTeacherEditorNavigation(courseId);
}

function handleTeacherEditorPopState() {
  try {
    const url = new URL(window.location.href, window.location.origin);
    if (!url.pathname.endsWith('/teacher/mes-cours.html')) return;
    window.SBI_APP_SHELL_CURRENT_URL = window.location.href;
    if (!url.searchParams.get('edit') && typeof window.switchCourseTab === 'function') {
      window.switchCourseTab('tab-list');
      renderSelect();
      applySelectedPromotionContext();
    }
  } catch {}
}

async function bootForUser(user) {
  const profile = await loadProfile(user.uid);
  const formationIds = await loadTeacherFormationIds(user.uid, profile || {});
  promotions = await loadPromotionsForFormationIds(formationIds);
  renderSelect();
  installRootObserver();
  applySelectedPromotionContext();
}

function runLimitedRetry(disposedRef) {
  let count = 0;
  const timer = window.setInterval(() => {
    if (disposedRef.disposed || count >= 12) {
      window.clearInterval(timer);
      return;
    }
    count += 1;
    renderSelect();
    installRootObserver();
    applySelectedPromotionContext();
  }, 450);
  return timer;
}

export function mountTeacherPromotionPlanningSelect({ source = 'standard' } = {}) {
  activeCleanup?.({ reason: 'remount' });

  const disposedRef = { disposed: false };
  let unsubscribe = null;
  const retryTimer = runLimitedRetry(disposedRef);

  const remountAfterLibrary = () => {
    if (disposedRef.disposed) return;
    renderSelect();
    installRootObserver();
    applySelectedPromotionContext();
  };

  document.addEventListener('click', handleTeacherEditorBridgeClick, true);
  window.addEventListener('popstate', handleTeacherEditorPopState);
  window.addEventListener('sbi:teacher-library-mounted', remountAfterLibrary);
  window.addEventListener('sbi:teacher-library-refresh', remountAfterLibrary);

  unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!user || disposedRef.disposed) return;
    bootForUser(user).catch((error) => console.warn('[SBI Teacher Promotion Select] Initialisation impossible :', error));
  });

  const cleanup = () => {
    disposedRef.disposed = true;
    unsubscribe?.();
    window.clearInterval(retryTimer);
    document.removeEventListener('click', handleTeacherEditorBridgeClick, true);
    window.removeEventListener('popstate', handleTeacherEditorPopState);
    window.removeEventListener('sbi:teacher-library-mounted', remountAfterLibrary);
    window.removeEventListener('sbi:teacher-library-refresh', remountAfterLibrary);
    rootObserver?.disconnect();
    rootObserver = null;
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  activeCleanup = cleanup;
  return cleanup;
}

function autoMount() {
  const currentUrl = new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
  if (!currentUrl.pathname.endsWith('/teacher/mes-cours.html') && !document.getElementById('teacher-courses-list-container')) return;
  mountTeacherPromotionPlanningSelect({ source: 'auto' });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true });
else autoMount();
