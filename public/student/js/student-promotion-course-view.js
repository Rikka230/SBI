/**
 * SBI 8.0P.167.141
 * Vue élève : programme de promotion et bibliothèque de formation séparés par switch.
 */
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
import { getUserLearningProgress } from '/js/course-engine.js';
import { isCourseVisible, uniqById } from '/js/learning-access.js';

const STYLE_ID = 'sbi-student-promotion-switch-style-8-0p-167-141';
const STATE_KEY = 'sbi:student-courses:last-context';
const MAX_QUERY_VALUES = 10;

let currentUser = null;
let currentProfile = null;
let currentProgress = { courses: {} };
let mounted = false;
let originalOpenFormation = null;
let opening = false;

function clean(value = '') { return String(value ?? '').trim(); }
function lower(value = '') { return clean(value).toLowerCase(); }
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
  const safe = lower(priority);
  if (safe === 'urgent') return 'Priorité urgente';
  if (safe === 'high' || safe === 'haute') return 'Priorité haute';
  return 'Priorité normale';
}
function getPriorityTone(priority = 'normal') {
  const safe = lower(priority);
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
  return clean(course.bloc || course.blockTitle || course.blockName || item.blockTitle || item.bloc || 'Cours sans bloc');
}
function getChaptersCount(course = {}) {
  return Array.isArray(course.chapitres) ? course.chapitres.length : Number(course.lessonCount || 0) || 0;
}
async function safeGetDocs(queryRef, label = 'requête') {
  try { return await getDocs(queryRef); }
  catch (error) {
    console.warn(`[SBI Student Promotion View] ${label} ignorée :`, error);
    return null;
  }
}
function snapToArray(snapshot) {
  const rows = [];
  snapshot?.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  return rows;
}
async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
async function ensureProfile() {
  if (currentProfile) return currentProfile;
  const user = auth.currentUser || currentUser;
  if (!user) return null;
  currentProfile = await loadProfile(user.uid);
  return currentProfile;
}
async function ensureProgress() {
  if (currentProgress?.__loaded) return currentProgress;
  const user = auth.currentUser || currentUser;
  if (!user) return { courses: {} };
  currentProgress = await getUserLearningProgress(user.uid);
  if (!currentProgress.courses) currentProgress.courses = {};
  currentProgress.__loaded = true;
  return currentProgress;
}
function getProfilePromotionIds(profile = {}) {
  return normalizeList([
    profile.promotionId,
    profile.currentPromotionId,
    profile.cohortId,
    ...(Array.isArray(profile.promotionIds) ? profile.promotionIds : [])
  ]);
}
function getUrlParams() {
  try { return new URL(window.location.href).searchParams; } catch { return new URLSearchParams(); }
}
function getUrlPromotionId() { return clean(getUrlParams().get('promotionId') || ''); }
async function getPromotionById(id) {
  const safeId = clean(id);
  if (!safeId) return null;
  try {
    const snap = await getDoc(doc(db, 'promotions', safeId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('[SBI Student Promotion View] Promotion ignorée :', safeId, error);
    return null;
  }
}
async function queryPromotionsByField(field, value) {
  const safeValue = clean(value);
  if (!field || !safeValue) return [];
  const snap = await safeGetDocs(query(collection(db, 'promotions'), where(field, '==', safeValue)), `promotions par ${field}`);
  return snapToArray(snap);
}
function getFolderInfo(folder) {
  return {
    formationId: clean(folder?.dataset?.formationId || ''),
    formationTitle: clean(folder?.dataset?.formationTitle || '')
  };
}
async function loadCandidatePromotions(folder) {
  const profile = await ensureProfile();
  if (!profile) return [];

  const { formationId, formationTitle } = getFolderInfo(folder);
  const explicitIds = normalizeList([getUrlPromotionId(), ...getProfilePromotionIds(profile)]);

  const byExplicit = (await Promise.all(explicitIds.map(getPromotionById))).filter(Boolean);
  const byFormationId = await queryPromotionsByField('formationId', formationId);
  const byFormationName = await queryPromotionsByField('formationName', formationTitle);

  return Array.from(new Map([...byExplicit, ...byFormationId, ...byFormationName].map((promotion) => [promotion.id, promotion])).values())
    .filter((promotion) => (promotion.status || 'active') !== 'archived')
    .filter((promotion) => Array.isArray(promotion.coursePlan) && promotion.coursePlan.some(isCoursePlanItem))
    .sort((a, b) => (toMillis(b.startDate) || 0) - (toMillis(a.startDate) || 0));
}
function promotionMatchesFolder(promotion = {}, folder) {
  const { formationId, formationTitle } = getFolderInfo(folder);
  if (!formationId && !formationTitle) return true;
  return clean(promotion.formationId) === formationId
    || clean(promotion.formationName) === formationTitle
    || clean(promotion.id) === formationId;
}
function pickPromotion(promotions = [], folder) {
  if (!promotions.length) return null;
  const urlPromotionId = getUrlPromotionId();
  if (urlPromotionId) {
    const fromUrl = promotions.find((promotion) => promotion.id === urlPromotionId);
    if (fromUrl) return fromUrl;
  }
  const exact = promotions.find((promotion) => promotionMatchesFolder(promotion, folder));
  if (exact) return exact;
  const profileIds = getProfilePromotionIds(currentProfile || {});
  const fromProfile = promotions.filter((promotion) => profileIds.includes(promotion.id));
  if (fromProfile.length === 1) return fromProfile[0];
  return promotions[0];
}
async function fetchCourse(courseId = '') {
  const safeId = clean(courseId);
  if (!safeId) return null;
  try {
    const snap = await getDoc(doc(db, 'courses', safeId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('[SBI Student Promotion View] Cours non lisible :', safeId, error);
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
function courseHasAny(course = {}, fields = []) {
  return fields.some((field) => {
    const values = normalizeList(course[field]);
    return values.length > 0;
  });
}
function courseMatchesFormation(course = {}, formation = {}) {
  const formationId = clean(formation.formationId);
  const title = clean(formation.formationTitle);
  const ids = normalizeList([...(course.formationIds || []), ...(course.formationsIds || []), ...(course.targetFormationIds || [])]);
  const refs = normalizeList([...(course.formations || []), ...(course.targetFormationTitles || [])]);
  return Boolean(
    (formationId && (ids.includes(formationId) || refs.includes(formationId)))
    || (title && refs.includes(title))
  );
}
async function queryCoursesByArrayField(field, values = []) {
  const safeValues = normalizeList(values);
  if (!field || !safeValues.length) return [];
  const rows = [];
  for (const chunk of chunkArray(safeValues)) {
    const op = chunk.length === 1 ? 'array-contains' : 'array-contains-any';
    const value = chunk.length === 1 ? chunk[0] : chunk;
    const snap = await safeGetDocs(query(collection(db, 'courses'), where(field, op, value)), `cours par ${field}`);
    rows.push(...snapToArray(snap));
  }
  return rows;
}
async function loadLibraryCoursesForFolder(folder, plannedIds = new Set()) {
  const formation = getFolderInfo(folder);
  const keys = normalizeList([formation.formationId, formation.formationTitle]);
  if (!keys.length) return [];

  const rows = [
    ...(await queryCoursesByArrayField('formationIds', [formation.formationId])),
    ...(await queryCoursesByArrayField('formationsIds', [formation.formationId])),
    ...(await queryCoursesByArrayField('targetFormationIds', [formation.formationId])),
    ...(await queryCoursesByArrayField('formations', keys)),
    ...(await queryCoursesByArrayField('targetFormationTitles', [formation.formationTitle]))
  ];

  return uniqById(rows)
    .filter((course) => !plannedIds.has(course.id))
    .filter((course) => courseMatchesFormation(course, formation))
    .filter((course) => isCourseVisible(course, { allowProgress: true }) || course.actif === true)
    .sort((a, b) => getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' }));
}
function getReturnUrl(folder, promotion = {}, view = 'programme') {
  const { formationId } = getFolderInfo(folder);
  const formId = clean(formationId || promotion.formationId || promotion.id);
  const params = new URLSearchParams();
  if (formId) params.set('formId', formId);
  if (promotion.id) params.set('promotionId', promotion.id);
  if (view) params.set('view', view);
  return `/student/mes-cours.html${params.toString() ? `?${params.toString()}` : ''}`;
}
function buildProgressBadge(course = {}) {
  const progress = currentProgress?.courses?.[course.id] || { status: 'todo', completedChapters: [] };
  const total = getChaptersCount(course);
  const done = Array.isArray(progress.completedChapters) ? progress.completedChapters.length : 0;
  if (progress.status === 'done') return '<span class="student-course-badge student-course-badge--done">Terminé</span>';
  if (progress.status === 'in_progress') return `<span class="student-course-badge student-course-badge--progress">En cours (${done}/${total})</span>`;
  return '<span class="student-course-badge student-course-badge--todo">À commencer</span>';
}
function buildCourseCard({ item = {}, course = null }, promotion, folder, source = 'programme') {
  const title = getCourseTitle(course || {}, item);
  const bloc = getCourseBloc(course || {}, item);
  const courseId = clean(course?.id || item.courseId);
  const readable = Boolean(course && courseId);
  const returnTo = getReturnUrl(folder, promotion, source);
  const href = readable ? `/student/cours-viewer.html?id=${encodeURIComponent(courseId)}&returnTo=${encodeURIComponent(returnTo)}` : '';
  const priorityTone = getPriorityTone(item.priorityLevel);
  const chapters = readable ? getChaptersCount(course) : 0;
  const planMeta = source === 'programme'
    ? `<div class="student-course-card__plan">
        <span>${escapeHtml(formatPlanDates(item))}</span>
        <span class="student-course-priority student-course-priority--${escapeHtml(priorityTone)}">${escapeHtml(getPriorityLabel(item.priorityLevel))}</span>
      </div>`
    : '';
  const unavailable = !readable
    ? '<div class="student-course-card__plan"><span>Cours indisponible pour le moment.</span></div>'
    : '';

  return `
    <article class="course-item student-course-card ${!readable ? 'is-disabled' : ''}" ${href ? `data-href="${escapeHtml(href)}"` : ''} data-sbi-no-pjax="true" data-search="${escapeHtml(`${title} ${bloc}`)}">
      <div class="student-course-card__main">
        <div class="student-course-card__icon" aria-hidden="true"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        <div class="student-course-card__content">
          <div class="course-title student-course-card__title">${escapeHtml(title)}</div>
          <div class="student-course-card__meta"><span>${chapters} étape${chapters > 1 ? 's' : ''}</span><span>${escapeHtml(bloc)}</span></div>
          ${planMeta}
          ${unavailable}
        </div>
      </div>
      <div class="student-course-card__side">${readable ? buildProgressBadge(course) : '<span class="student-course-badge student-course-badge--todo">Indisponible</span>'}</div>
    </article>
  `;
}
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sbi-student-course-switch { display:flex; flex-wrap:wrap; gap:.55rem; margin:1rem 0 1.1rem; }
    .sbi-student-course-switch button { min-height:42px; border-radius:999px; padding:.65rem 1rem; border:1px solid rgba(42,87,255,.22); background:rgba(42,87,255,.08); color:var(--text-main); font-weight:950; cursor:pointer; }
    .sbi-student-course-switch button.is-active { background:var(--accent-blue,#2A57FF); color:#fff; border-color:transparent; }
    .sbi-student-course-view[hidden] { display:none !important; }
    .course-item.student-course-card.is-disabled { opacity:.62; cursor:not-allowed; }
  `;
  document.head.appendChild(style);
}
function showLoadingCourseView(folder) {
  const viewFormations = document.getElementById('view-formations');
  const viewCourses = document.getElementById('view-courses');
  const title = document.getElementById('current-formation-title');
  const container = document.getElementById('courses-list');
  const summary = document.getElementById('student-course-summary');
  const { formationTitle } = getFolderInfo(folder);
  if (viewFormations) viewFormations.style.display = 'none';
  if (viewCourses) viewCourses.style.display = 'flex';
  if (title) title.textContent = formationTitle || 'Formation';
  if (summary) summary.innerHTML = '<div class="student-course-stat"><strong>…</strong><span>Chargement</span></div>';
  if (container) container.innerHTML = '<div class="student-library-loading">Chargement du parcours…</div>';
}
function saveContext(folder, promotion = {}, view = 'programme') {
  try {
    const { formationId, formationTitle } = getFolderInfo(folder);
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ formationId, formationTitle, promotionId: promotion.id || '', view }));
  } catch {}
}
function setActiveView(view = 'programme') {
  const safeView = view === 'library' ? 'library' : 'programme';
  document.querySelectorAll('[data-sbi-student-course-switch]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.sbiStudentCourseSwitch === safeView);
  });
  document.querySelectorAll('[data-sbi-student-course-view]').forEach((node) => {
    node.hidden = node.dataset.sbiStudentCourseView !== safeView;
  });
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('view', safeView);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}
function buildCourseSection(title, subtitle, count, cardsHtml, emptyText = 'Aucun cours disponible.') {
  return `
    <section class="student-course-section">
      <div class="student-course-section__head">
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>
        <em>${count} cours</em>
      </div>
      ${count ? `<div class="student-course-bloc__list">${cardsHtml}</div>` : `<div class="student-library-empty"><strong>${escapeHtml(emptyText)}</strong></div>`}
    </section>
  `;
}
async function renderPromotionCourseView(folder, promotion, rows = []) {
  injectStyle();
  await ensureProgress();

  const viewFormations = document.getElementById('view-formations');
  const viewCourses = document.getElementById('view-courses');
  const title = document.getElementById('current-formation-title');
  const container = document.getElementById('courses-list');
  const summary = document.getElementById('student-course-summary');
  const { formationId, formationTitle } = getFolderInfo(folder);
  const displayTitle = formationTitle || promotion.formationName || getPromotionLabel(promotion);
  const plannedIds = new Set(rows.map((row) => clean(row.item.courseId)).filter(Boolean));
  const libraryCourses = await loadLibraryCoursesForFolder(folder, plannedIds);
  const initialView = getUrlParams().get('view') === 'library' ? 'library' : 'programme';

  if (viewFormations) viewFormations.style.display = 'none';
  if (viewCourses) viewCourses.style.display = 'flex';
  if (title) {
    title.textContent = displayTitle;
    title.dataset.formationId = clean(formationId || promotion.formationId || promotion.id);
  }
  if (summary) {
    summary.innerHTML = `
      <div class="student-course-stat"><strong>${rows.length}</strong><span>Programme</span></div>
      <div class="student-course-stat"><strong>${libraryCourses.length}</strong><span>Bibliothèque</span></div>
      <div class="student-course-stat"><strong>${formatDate(promotion.startDate) || '—'}</strong><span>Début</span></div>
      <div class="student-course-stat"><strong>${formatDate(promotion.endDate) || '—'}</strong><span>Fin</span></div>
    `;
  }
  if (!container) return;

  const programmeCards = rows.map((row) => buildCourseCard(row, promotion, folder, 'programme')).join('');
  const libraryCards = libraryCourses.map((course) => buildCourseCard({ course }, promotion, folder, 'library')).join('');

  container.innerHTML = `
    <div class="sbi-student-course-switch" role="tablist" aria-label="Changer de vue des cours">
      <button type="button" data-sbi-student-course-switch="programme">Programme</button>
      <button type="button" data-sbi-student-course-switch="library">Liste bibliothèque</button>
    </div>
    <div class="sbi-student-course-view" data-sbi-student-course-view="programme">
      ${buildCourseSection('Parcours défini par la promotion', `Cours datés du cursus appliqué à ${getPromotionLabel(promotion)}.`, rows.length, programmeCards, 'Aucun cours planifié dans cette promotion.')}
    </div>
    <div class="sbi-student-course-view" data-sbi-student-course-view="library">
      ${buildCourseSection('Bibliothèque de la formation', 'Cours accessibles hors programme daté.', libraryCourses.length, libraryCards, 'Aucun cours complémentaire dans cette formation.')}
    </div>
  `;

  container.querySelectorAll('[data-sbi-student-course-switch]').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveView(button.dataset.sbiStudentCourseSwitch);
      saveContext(folder, promotion, button.dataset.sbiStudentCourseSwitch);
    });
  });

  container.querySelectorAll('.course-item[data-href]').forEach((item) => {
    item.addEventListener('click', () => { window.location.href = item.dataset.href; });
  });

  setActiveView(initialView);
  saveContext(folder, promotion, initialView);
}
function openOriginalFolder(folder) {
  if (typeof originalOpenFormation === 'function') {
    originalOpenFormation(folder.dataset.formationId || '', folder.dataset.formationTitle || '');
  } else if (typeof window.openFormation === 'function') {
    window.openFormation(folder.dataset.formationId || '', folder.dataset.formationTitle || '');
  }
}
async function openFolderFromPromotion(folder) {
  const promotions = await loadCandidatePromotions(folder);
  const promotion = pickPromotion(promotions, folder);
  if (!promotion) return false;
  const rows = await hydratePlanItems(promotion);
  if (!rows.length) return false;
  await renderPromotionCourseView(folder, promotion, rows);
  return true;
}
function installCapture() {
  if (mounted) return;
  mounted = true;

  document.addEventListener('click', (event) => {
    const folder = event.target.closest?.('.formation-folder');
    if (!folder || !folder.closest('#formations-list')) return;
    if (opening) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    opening = true;
    showLoadingCourseView(folder);

    openFolderFromPromotion(folder)
      .then((handled) => { if (!handled) openOriginalFolder(folder); })
      .catch((error) => {
        console.warn('[SBI Student Promotion View] Ouverture promotion impossible :', error);
        openOriginalFolder(folder);
      })
      .finally(() => { opening = false; });
  }, true);
}
function findFolderForUrlTarget(target = '') {
  const safeTarget = clean(target);
  if (!safeTarget) return null;
  return Array.from(document.querySelectorAll('.formation-folder')).find((item) => {
    return clean(item.dataset.formationId) === safeTarget
      || clean(item.dataset.formationTitle) === safeTarget
      || clean(item.dataset.promotionId) === safeTarget;
  }) || null;
}
function autoOpenFromUrl() {
  const params = getUrlParams();
  const target = clean(params.get('formId') || params.get('formationId') || '');
  if (!target) return;

  const tryOpen = (attempt = 0) => {
    const folder = findFolderForUrlTarget(target);
    if (!folder) {
      if (attempt < 10) window.setTimeout(() => tryOpen(attempt + 1), 220);
      return;
    }
    showLoadingCourseView(folder);
    openFolderFromPromotion(folder).then((handled) => {
      if (!handled) openOriginalFolder(folder);
    }).catch(() => openOriginalFolder(folder));
  };

  window.setTimeout(() => tryOpen(0), 120);
}
export function mountStudentPromotionCourseView({ source = 'standard' } = {}) {
  if (!window.location.pathname.endsWith('/student/mes-cours.html')) return () => {};
  originalOpenFormation = typeof window.openFormation === 'function' ? window.openFormation : originalOpenFormation;
  installCapture();

  let disposed = false;
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (disposed) return;
    currentUser = user;
    currentProfile = user ? await loadProfile(user.uid) : null;
    currentProgress = { courses: {} };
    if (currentProfile) autoOpenFromUrl();
  });

  window.setTimeout(() => {
    if (!originalOpenFormation && typeof window.openFormation === 'function') originalOpenFormation = window.openFormation;
  }, 500);

  return () => {
    disposed = true;
    unsubscribe?.();
  };
}
function boot() {
  mountStudentPromotionCourseView({ source: 'auto' });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
