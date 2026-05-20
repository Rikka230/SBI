/**
 * SBI 8.0P.167.125
 * Enrichissement non destructif de /student/mes-cours.html avec les dates
 * issues de promotions.coursePlan.
 */
import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  escapeHTML,
  getCoursePlanBadgeHTML,
  getCoursePlanSortValue,
  loadStudentCoursePlanContext
} from '/js/promotion-course-plan.js?v=8.0P.167.125';

let mounted = false;
let unsubscribeAuth = null;
let coursePlanIndex = new Map();
let currentUid = '';

function injectStyle() {
  if (document.getElementById('sbi-student-course-plan-dates-css')) return;

  const style = document.createElement('style');
  style.id = 'sbi-student-course-plan-dates-css';
  style.textContent = `
    .sbi-course-plan-meta {
      display: flex;
      flex-wrap: wrap;
      gap: .35rem;
      margin-top: .35rem;
    }

    .sbi-course-plan-date-pill {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      max-width: 100%;
      border: 1px solid rgba(42, 87, 255, .22);
      border-radius: 999px;
      padding: .18rem .52rem;
      background: rgba(42, 87, 255, .08);
      color: var(--accent-blue, #2A57FF);
      font-size: .72rem;
      font-weight: 800;
      line-height: 1.3;
    }

    .course-item[data-sbi-course-plan-dated="true"] {
      border-color: rgba(42, 87, 255, .18);
    }

    .bloc-title[data-sbi-course-plan-sorted="true"]::after {
      content: " · tri planning";
      color: var(--text-muted, #9ca3af);
      font-size: .75rem;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

function getCourseIdFromItem(item) {
  if (!item) return '';
  const direct = item.dataset.courseId || item.dataset.sbiCourseId || '';
  if (direct) return direct;

  const onclick = item.getAttribute('onclick') || '';
  const match = onclick.match(/cours-viewer\.html\?id=([^'"\s&]+)/);
  const courseId = match ? decodeURIComponent(match[1]) : '';

  if (courseId) item.dataset.courseId = courseId;
  return courseId;
}

function getCourseTitleFromItem(item) {
  return item?.querySelector?.('.course-title')?.textContent?.trim() || '';
}

function getPlanEntryForItem(item) {
  const courseId = getCourseIdFromItem(item);
  return courseId ? coursePlanIndex.get(courseId) || null : null;
}

function decorateCourseItem(item) {
  const courseId = getCourseIdFromItem(item);
  if (!courseId) return;

  const entry = coursePlanIndex.get(courseId) || null;
  item.dataset.sbiCoursePlanDated = entry ? 'true' : 'false';

  const textZone = item.querySelector('.course-title')?.parentElement || item.firstElementChild || item;
  let meta = item.querySelector('.sbi-course-plan-meta');

  if (!entry) {
    meta?.remove();
    return;
  }

  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'sbi-course-plan-meta';
    textZone.appendChild(meta);
  }

  meta.innerHTML = getCoursePlanBadgeHTML(entry, { includePromotion: true });
  item.dataset.sbiCoursePlanStart = String(entry.startMs || '');
  item.dataset.sbiCoursePlanOrder = String(entry.order || '');
  item.dataset.sbiPromotionId = entry.promotionId || '';
}

function compareCourseItems(a, b) {
  const entryA = getPlanEntryForItem(a);
  const entryB = getPlanEntryForItem(b);
  const valueA = getCoursePlanSortValue(entryA);
  const valueB = getCoursePlanSortValue(entryB);

  if (valueA !== valueB) return valueA - valueB;

  return getCourseTitleFromItem(a).localeCompare(getCourseTitleFromItem(b), 'fr', {
    sensitivity: 'base'
  });
}

function sortCoursesInsideVisibleFormation() {
  const container = document.getElementById('courses-list');
  if (!container || !coursePlanIndex.size) return;

  const children = Array.from(container.children);
  const blocTitles = children.filter((node) => node.classList?.contains('bloc-title'));

  blocTitles.forEach((titleNode) => {
    const courseItems = [];
    let cursor = titleNode.nextElementSibling;

    while (cursor && !cursor.classList?.contains('bloc-title')) {
      if (cursor.classList?.contains('course-item')) {
        courseItems.push(cursor);
      }
      cursor = cursor.nextElementSibling;
    }

    if (courseItems.length <= 1) return;

    const sorted = [...courseItems].sort(compareCourseItems);
    sorted.forEach((item) => container.insertBefore(item, cursor));
    titleNode.dataset.sbiCoursePlanSorted = 'true';
  });
}

function decorateAndSortCourses() {
  document.querySelectorAll('.course-item').forEach(decorateCourseItem);
  sortCoursesInsideVisibleFormation();
}

function patchOpenFormation() {
  if (typeof window.openFormation !== 'function') return false;
  if (window.openFormation.__sbiCoursePlanDatesPatched === true) return true;

  const originalOpenFormation = window.openFormation;
  const patched = function patchedOpenFormation(...args) {
    const result = originalOpenFormation.apply(this, args);
    window.setTimeout(decorateAndSortCourses, 40);
    window.setTimeout(decorateAndSortCourses, 220);
    return result;
  };

  patched.__sbiCoursePlanDatesPatched = true;
  window.openFormation = patched;
  return true;
}

function schedulePatchOpenFormation() {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    if (patchOpenFormation()) return;
    if (attempts < 40) window.setTimeout(tick, 100);
  };
  tick();
}

async function loadPlanForCurrentUser(user) {
  if (!user?.uid) return;

  currentUid = user.uid;

  const context = await loadStudentCoursePlanContext({
    db,
    uid: user.uid
  });

  coursePlanIndex = context.coursePlanIndex || new Map();

  window.SBI_STUDENT_COURSE_PLAN_DATES_DEBUG = () => ({
    uid: currentUid,
    promotions: context.promotions?.map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      coursePlanCount: Array.isArray(promotion.coursePlan) ? promotion.coursePlan.length : 0
    })) || [],
    courseIds: Array.from(coursePlanIndex.keys())
  });

  decorateAndSortCourses();
}

export function mountStudentCoursePlanDates({ source = 'standard' } = {}) {
  if (mounted) {
    schedulePatchOpenFormation();
    decorateAndSortCourses();
    return () => {};
  }

  mounted = true;
  injectStyle();
  schedulePatchOpenFormation();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
      await loadPlanForCurrentUser(user);
      window.dispatchEvent(new CustomEvent('sbi:student-course-plan-dates-mounted', {
        detail: { source, uid: user.uid }
      }));
    } catch (error) {
      console.warn('[SBI Student CoursePlan] Dates promotion indisponibles :', error);
    }
  });

  window.addEventListener('sbi:app-shell-rendered', decorateAndSortCourses);
  window.addEventListener('pageshow', decorateAndSortCourses);

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    window.removeEventListener('sbi:app-shell-rendered', decorateAndSortCourses);
    window.removeEventListener('pageshow', decorateAndSortCourses);
  };
}

function autoMount() {
  if (!document.getElementById('courses-list') && !document.getElementById('formations-list')) return;
  mountStudentCoursePlanDates({ source: 'auto' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}
