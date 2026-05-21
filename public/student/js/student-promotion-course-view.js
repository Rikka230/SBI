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

let currentUser = null;
let currentProfile = null;
let mounted = false;

function clean(value = '') { return String(value ?? '').trim(); }
function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean)));
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
  } catch { return ''; }
}
function formatPlanDates(item = {}) {
  const start = formatDate(item.recommendedStartAt || item.plannedStartAt || item.startAt);
  const end = formatDate(item.recommendedEndAt || item.plannedEndAt || item.endAt);
  const due = formatDate(item.deadlineAt || item.dueAt);
  if (start && end && start !== end) return `${start} → ${end}`;
  if (start) return `Début ${start}`;
  if (due) return `Échéance ${due}`;
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
function getCourseTitle(course = {}, item = {}) {
  return clean(course.titre || course.title || item.courseTitle || item.title || 'Cours');
}
function getCourseBloc(course = {}, item = {}) {
  return clean(course.bloc || course.blockTitle || course.blockName || item.blockTitle || 'Cours sans bloc');
}
async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
function getProfilePromotionIds(profile = {}) {
  return normalizeList([
    profile.promotionId,
    profile.currentPromotionId,
    profile.cohortId,
    ...(Array.isArray(profile.promotionIds) ? profile.promotionIds : [])
  ]);
}
async function getPromotionById(id) {
  try {
    const snap = await getDoc(doc(db, 'promotions', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('[SBI Student Promotion View] Promotion ignorée :', id, error);
    return null;
  }
}
async function queryPromotionsByFormation(formationId = '') {
  if (!formationId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'promotions'), where('formationId', '==', formationId)));
    const rows = [];
    snap.forEach((item) => rows.push({ id: item.id, ...item.data() }));
    return rows;
  } catch (error) {
    console.warn('[SBI Student Promotion View] Promotions par formation ignorées :', error);
    return [];
  }
}
async function loadCandidatePromotions(folder) {
  const formationId = clean(folder.dataset.formationId);
  const formationTitle = clean(folder.dataset.formationTitle);
  const profileIds = getProfilePromotionIds(currentProfile || {});
  const byProfile = (await Promise.all(profileIds.map(getPromotionById))).filter(Boolean);
  const byFormation = await queryPromotionsByFormation(formationId);
  return Array.from(new Map([...byProfile, ...byFormation].map((promotion) => [promotion.id, promotion])).values())
    .filter((promotion) => (promotion.status || 'active') !== 'archived')
    .filter((promotion) => {
      if (!formationId && !formationTitle) return true;
      return clean(promotion.formationId) === formationId || clean(promotion.formationName) === formationTitle || profileIds.includes(promotion.id);
    })
    .sort((a, b) => (toMillis(b.startDate) || 0) - (toMillis(a.startDate) || 0));
}
async function fetchCourse(courseId = '') {
  try {
    const snap = await getDoc(doc(db, 'courses', courseId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('[SBI Student Promotion View] Cours non lisible :', courseId, error);
    return null;
  }
}
async function hydratePlanItems(promotion = {}) {
  const plan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];
  const items = plan
    .map((item, index) => ({ ...item, order: Number.isFinite(Number(item.order)) ? Number(item.order) : index }))
    .filter(isCoursePlanItem)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const courses = await Promise.all(items.map((item) => fetchCourse(clean(item.courseId))));
  return items.map((item, index) => ({ item, course: courses[index] }));
}
function getReturnUrl(folder, promotion = {}) {
  const formId = clean(folder.dataset.formationId || promotion.formationId || promotion.id);
  const params = new URLSearchParams();
  if (formId) params.set('formId', formId);
  if (promotion.id) params.set('promotionId', promotion.id);
  return `/student/mes-cours.html${params.toString() ? `?${params.toString()}` : ''}`;
}
function buildCourseCard({ item, course }, promotion, folder) {
  const title = getCourseTitle(course || {}, item);
  const bloc = getCourseBloc(course || {}, item);
  const courseId = clean(item.courseId);
  const disabled = !course;
  const returnTo = getReturnUrl(folder, promotion);
  const href = disabled ? '' : `/student/cours-viewer.html?id=${encodeURIComponent(courseId)}&returnTo=${encodeURIComponent(returnTo)}`;
  const priorityTone = getPriorityTone(item.priorityLevel);
  return `
    <article class="course-item student-course-card ${disabled ? 'is-disabled' : ''}" ${href ? `data-href="${escapeHtml(href)}"` : ''} data-sbi-no-pjax="true" data-search="${escapeHtml(`${title} ${bloc}`)}">
      <div class="student-course-card__main">
        <div class="student-course-card__icon" aria-hidden="true"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        <div class="student-course-card__content">
          <div class="course-title student-course-card__title">${escapeHtml(title)}</div>
          <div class="student-course-card__meta"><span>${escapeHtml(bloc)}</span>${item.sourceFormationName ? `<span>Source : ${escapeHtml(item.sourceFormationName)}</span>` : ''}</div>
          <div class="student-course-card__plan">
            <span>${escapeHtml(formatPlanDates(item))}</span>
            <span class="student-course-priority student-course-priority--${escapeHtml(priorityTone)}">${escapeHtml(getPriorityLabel(item.priorityLevel))}</span>
          </div>
          ${disabled ? '<div class="student-course-card__plan"><span>Document du cours non lisible. Vérifier les règles ou la publication.</span></div>' : ''}
        </div>
      </div>
      <div class="student-course-card__side"><span class="student-course-badge student-course-badge--todo">${disabled ? 'À vérifier' : 'Ouvrir'}</span></div>
    </article>
  `;
}
function renderPromotionCourseView(folder, promotion, rows = []) {
  const viewFormations = document.getElementById('view-formations');
  const viewCourses = document.getElementById('view-courses');
  const title = document.getElementById('current-formation-title');
  const container = document.getElementById('courses-list');
  const summary = document.getElementById('student-course-summary');
  const formationTitle = clean(folder.dataset.formationTitle || promotion.formationName || getPromotionLabel(promotion));

  if (viewFormations) viewFormations.style.display = 'none';
  if (viewCourses) viewCourses.style.display = 'flex';
  if (title) title.textContent = formationTitle;
  if (summary) {
    summary.innerHTML = `
      <div class="student-course-stat"><strong>${rows.length}</strong><span>Cours planifiés</span></div>
      <div class="student-course-stat"><strong>${escapeHtml(getPromotionLabel(promotion))}</strong><span>Promotion</span></div>
      <div class="student-course-stat"><strong>${formatDate(promotion.startDate) || '—'}</strong><span>Début</span></div>
      <div class="student-course-stat"><strong>${formatDate(promotion.endDate) || '—'}</strong><span>Fin</span></div>
    `;
  }
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = '<div class="student-library-empty"><strong>Aucun cours dans le planning de cette promotion.</strong><span>Vérifiez le cursus appliqué à la promotion.</span></div>';
    return;
  }
  container.innerHTML = `
    <section class="student-course-section student-course-section--planned">
      <div class="student-course-section__head">
        <div><strong>Parcours défini par la promotion</strong><span>Liste datée du cursus appliqué à cette promotion.</span></div>
        <em>${rows.length} cours</em>
      </div>
      <div class="student-course-bloc__list">${rows.map((row) => buildCourseCard(row, promotion, folder)).join('')}</div>
    </section>
    <section class="student-course-section student-course-section--library">
      <div class="student-course-section__head">
        <div><strong>Bibliothèque de la formation</strong><span>Les contenus hors planning restent accessibles depuis la bibliothèque principale.</span></div>
        <em>séparé du parcours daté</em>
      </div>
    </section>
  `;
  container.querySelectorAll('.course-item[data-href]').forEach((item) => {
    item.addEventListener('click', () => { window.location.href = item.dataset.href; });
  });
}
async function openFolderFromPromotion(folder) {
  const promotions = await loadCandidatePromotions(folder);
  const promotion = promotions.find((row) => Array.isArray(row.coursePlan) && row.coursePlan.some(isCoursePlanItem));
  if (!promotion) return false;
  const rows = await hydratePlanItems(promotion);
  renderPromotionCourseView(folder, promotion, rows);
  return true;
}
function installCapture() {
  if (mounted) return;
  mounted = true;
  document.addEventListener('click', async (event) => {
    const folder = event.target.closest?.('.formation-folder');
    if (!folder || !folder.closest('#formations-list')) return;
    if (!currentUser || !currentProfile) return;

    const handled = await openFolderFromPromotion(folder).catch((error) => {
      console.warn('[SBI Student Promotion View] Ouverture promotion impossible :', error);
      return false;
    });
    if (!handled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
}
function autoOpenFromUrl() {
  const params = new URL(window.location.href).searchParams;
  const target = clean(params.get('formId') || params.get('formationId') || '');
  if (!target) return;
  window.setTimeout(() => {
    const folder = Array.from(document.querySelectorAll('.formation-folder')).find((item) => {
      return clean(item.dataset.formationId) === target || clean(item.dataset.formationTitle) === target;
    });
    if (folder) openFolderFromPromotion(folder);
  }, 700);
}
function boot() {
  if (!window.location.pathname.endsWith('/student/mes-cours.html')) return;
  installCapture();
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    currentProfile = user ? await loadProfile(user.uid) : null;
    if (currentProfile) autoOpenFromUrl();
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
