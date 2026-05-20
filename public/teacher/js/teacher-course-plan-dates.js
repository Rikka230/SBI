/**
 * SBI 8.0P.167.125
 * Enrichissement non destructif de /teacher/mes-cours.html avec les dates
 * issues de promotions.coursePlan.
 */
import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {
  getCoursePlanBadgeHTML,
  loadTeacherCoursePlanContext
} from '/js/promotion-course-plan.js?v=8.0P.167.125';

let mounted = false;
let unsubscribeAuth = null;
let refreshButton = null;
let searchInput = null;
let coursePlanIndex = new Map();
let currentUid = '';

function injectStyle() {
  if (document.getElementById('sbi-teacher-course-plan-dates-css')) return;

  const style = document.createElement('style');
  style.id = 'sbi-teacher-course-plan-dates-css';
  style.textContent = `
    .teacher-course-plan-meta {
      display: flex;
      flex-wrap: wrap;
      gap: .4rem;
      margin-top: .1rem;
    }

    .teacher-course-plan-meta .sbi-course-plan-date-pill {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      max-width: 100%;
      border: 1px solid rgba(245, 158, 11, .28);
      border-radius: 999px;
      padding: .22rem .58rem;
      background: rgba(245, 158, 11, .1);
      color: var(--accent-orange, #f59e0b);
      font-size: .74rem;
      font-weight: 800;
      line-height: 1.3;
    }

    .teacher-course-card[data-sbi-course-plan-dated="true"] {
      border-color: rgba(245, 158, 11, .22);
    }
  `;
  document.head.appendChild(style);
}

function decorateTeacherCourseCard(card) {
  const courseId = card?.dataset?.courseId || '';
  if (!courseId) return;

  const entry = coursePlanIndex.get(courseId) || null;
  card.dataset.sbiCoursePlanDated = entry ? 'true' : 'false';

  let meta = card.querySelector('.teacher-course-plan-meta');

  if (!entry) {
    meta?.remove();
    return;
  }

  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'teacher-course-plan-meta';

    const signature = card.querySelector('.teacher-course-card__signature');
    const tags = card.querySelector('.teacher-course-card__tags');
    if (signature) signature.insertAdjacentElement('afterend', meta);
    else if (tags) tags.insertAdjacentElement('beforebegin', meta);
    else card.querySelector('.teacher-course-card__body')?.appendChild(meta);
  }

  meta.innerHTML = getCoursePlanBadgeHTML(entry, { includePromotion: true });
  card.dataset.sbiCoursePlanStart = String(entry.startMs || '');
  card.dataset.sbiCoursePlanOrder = String(entry.order || '');
  card.dataset.sbiPromotionId = entry.promotionId || '';
}

function decorateTeacherCourseCards() {
  document.querySelectorAll('.teacher-course-card[data-course-id]').forEach(decorateTeacherCourseCard);
}

async function loadPlanForCurrentTeacher(user) {
  if (!user?.uid) return;

  currentUid = user.uid;

  const context = await loadTeacherCoursePlanContext({
    db,
    uid: user.uid
  });

  coursePlanIndex = context.coursePlanIndex || new Map();

  window.SBI_TEACHER_COURSE_PLAN_DATES_DEBUG = () => ({
    uid: currentUid,
    promotions: context.promotions?.map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      formationId: promotion.formationId,
      coursePlanCount: Array.isArray(promotion.coursePlan) ? promotion.coursePlan.length : 0
    })) || [],
    courseIds: Array.from(coursePlanIndex.keys())
  });

  decorateTeacherCourseCards();
}

function scheduleDecorate() {
  window.setTimeout(decorateTeacherCourseCards, 80);
  window.setTimeout(decorateTeacherCourseCards, 280);
  window.setTimeout(decorateTeacherCourseCards, 700);
}

function bindLocalTeacherLibraryControls() {
  refreshButton = document.getElementById('teacher-courses-refresh');
  searchInput = document.getElementById('teacher-courses-search');

  refreshButton?.addEventListener('click', scheduleDecorate);
  searchInput?.addEventListener('input', scheduleDecorate);
}

function unbindLocalTeacherLibraryControls() {
  refreshButton?.removeEventListener('click', scheduleDecorate);
  searchInput?.removeEventListener('input', scheduleDecorate);
  refreshButton = null;
  searchInput = null;
}

export function mountTeacherCoursePlanDates({ source = 'standard' } = {}) {
  if (mounted) {
    scheduleDecorate();
    return () => {};
  }

  mounted = true;
  injectStyle();
  bindLocalTeacherLibraryControls();

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
      await loadPlanForCurrentTeacher(user);
      scheduleDecorate();
      window.dispatchEvent(new CustomEvent('sbi:teacher-course-plan-dates-mounted', {
        detail: { source, uid: user.uid }
      }));
    } catch (error) {
      console.warn('[SBI Teacher CoursePlan] Dates promotion indisponibles :', error);
    }
  });

  window.addEventListener('sbi:teacher-library-mounted', scheduleDecorate);
  window.addEventListener('sbi:teacher-library-refresh', scheduleDecorate);
  window.addEventListener('sbi:app-shell-rendered', scheduleDecorate);
  window.addEventListener('pageshow', scheduleDecorate);

  return () => {
    mounted = false;
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    unbindLocalTeacherLibraryControls();
    window.removeEventListener('sbi:teacher-library-mounted', scheduleDecorate);
    window.removeEventListener('sbi:teacher-library-refresh', scheduleDecorate);
    window.removeEventListener('sbi:app-shell-rendered', scheduleDecorate);
    window.removeEventListener('pageshow', scheduleDecorate);
  };
}

function autoMount() {
  if (!document.getElementById('teacher-courses-list-container')) return;
  mountTeacherCoursePlanDates({ source: 'auto' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}
