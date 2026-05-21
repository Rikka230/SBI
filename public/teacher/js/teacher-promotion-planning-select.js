import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const SELECT_ID = 'teacher-courses-promotion-filter';
const STORAGE_KEY = 'sbi:teacher-courses:selected-promotion';
const STYLE_ID = 'teacher-promotion-planning-select-style';
const MAX_QUERY_VALUES = 10;

let promotions = [];
let selectedPromotionId = '';
let observer = null;

function clean(value = '') {
  return String(value ?? '').trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean)));
}

function chunkArray(items = [], size = MAX_QUERY_VALUES) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
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
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(ms));
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

  return rows
    .filter((promotion) => (promotion.status || 'active') !== 'archived')
    .sort((a, b) => {
      const aDate = toMillis(a.startDate);
      const bDate = toMillis(b.startDate);
      if (aDate || bDate) return bDate - aDate;
      return getPromotionLabel(a).localeCompare(getPromotionLabel(b), 'fr', { sensitivity: 'base' });
    });
}

function getSelectedPromotion() {
  return promotions.find((promotion) => promotion.id === selectedPromotionId) || null;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${SELECT_ID} {
      min-width: 230px;
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
  select.setAttribute('aria-label', 'Choisir la promotion pour les dates');

  const sort = document.getElementById('teacher-courses-sort');
  if (sort?.parentElement === toolbar) toolbar.insertBefore(select, sort.nextSibling);
  else toolbar.insertBefore(select, toolbar.firstChild);

  select.addEventListener('change', () => {
    selectedPromotionId = select.value;
    try { localStorage.setItem(STORAGE_KEY, selectedPromotionId); } catch {}
    applySelectedPromotionDates();
  });

  return select;
}

function renderSelect() {
  const select = ensureSelect();
  if (!select) return;

  const stored = (() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  })();

  if (!selectedPromotionId) {
    selectedPromotionId = promotions.some((promotion) => promotion.id === stored)
      ? stored
      : promotions[0]?.id || '';
  }

  if (!promotions.length) {
    select.innerHTML = '<option value="">Dates : aucune promotion</option>';
    select.value = '';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = promotions.map((promotion) => {
    const label = getPromotionLabel(promotion);
    const dates = getPromotionDateLabel(promotion);
    return `<option value="${escapeHtml(promotion.id)}">Dates : ${escapeHtml(label)}${dates ? ` · ${escapeHtml(dates)}` : ''}</option>`;
  }).join('');

  if (promotions.some((promotion) => promotion.id === selectedPromotionId)) select.value = selectedPromotionId;
  else {
    selectedPromotionId = promotions[0].id;
    select.value = selectedPromotionId;
  }
}

function findPlanForCourse(promotion = {}, courseId = '') {
  const safeCourseId = clean(courseId);
  if (!safeCourseId) return null;
  const plan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
  return plan
    .map((item, index) => ({ ...item, order: Number.isFinite(Number(item.order)) ? Number(item.order) : index }))
    .find((item) => isCoursePlanItem(item) && clean(item.courseId) === safeCourseId) || null;
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

function applySelectedPromotionDates() {
  const promotion = getSelectedPromotion();
  const cards = document.querySelectorAll('.teacher-course-card[data-course-id]');

  cards.forEach((card) => {
    const courseId = clean(card.dataset.courseId);
    const body = card.querySelector('.teacher-course-card__body');
    if (!body) return;

    card.querySelectorAll('.teacher-course-card__planning').forEach((node) => node.remove());

    const plan = promotion ? findPlanForCourse(promotion, courseId) : null;
    if (!plan) return;

    const signature = body.querySelector('.teacher-course-card__signature');
    const html = renderPlanningHtml(plan, promotion);
    if (signature) signature.insertAdjacentHTML('afterend', html);
    else body.insertAdjacentHTML('beforeend', html);
  });

  const count = promotion
    ? cards.length && Array.from(cards).filter((card) => findPlanForCourse(promotion, card.dataset.courseId)).length
    : 0;
  const helper = document.getElementById('teacher-courses-count');
  if (helper && promotion) {
    helper.textContent = `${helper.textContent.replace(/ · dates .*/, '')} · dates ${getPromotionLabel(promotion)} (${count})`;
  }
}

async function boot(user) {
  const profile = await loadProfile(user.uid);
  const formationIds = await loadTeacherFormationIds(user.uid, profile || {});
  promotions = await loadPromotionsForFormationIds(formationIds);
  renderSelect();
  applySelectedPromotionDates();

  const root = document.getElementById('teacher-courses-list-container');
  if (root && !observer) {
    observer = new MutationObserver(() => applySelectedPromotionDates());
    observer.observe(root, { childList: true, subtree: false });
  }
}

function autoMount() {
  if (!window.location.pathname.endsWith('/teacher/mes-cours.html')) return;
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    boot(user).catch((error) => console.warn('[SBI Teacher Promotion Select] Initialisation impossible :', error));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}
