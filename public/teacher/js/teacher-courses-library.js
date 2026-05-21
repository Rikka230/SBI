import { db, auth } from '/js/firebase-init.js';
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

const COURSE_VIEWER_URL = '/teacher/cours-viewer.html';
const COURSE_EDITOR_V2_URL = '/teacher/course-editor.html';
const COURSE_EDITOR_V2_URL = '/teacher/course-editor.html';
const MAX_QUERY_VALUES = 10;

let activeMountCleanup = null;
const authorCache = new Map();

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeString).filter(Boolean)));
}

function chunkArray(items, size = MAX_QUERY_VALUES) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function escapeHtml(value) {
  return normalizeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function snapToArray(snapshot) {
  const rows = [];
  if (!snapshot) return rows;
  snapshot.forEach((item) => rows.push({ id: item.id, ...item.data() }));
  return rows;
}

function uniqById(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (!item?.id) return;
    map.set(item.id, item);
  });
  return Array.from(map.values());
}

function getTimestampMs(value) {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDate(value) {
  const timestamp = getTimestampMs(value);
  if (!timestamp) return '';

  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

function getPriorityLabel(priority = 'normal') {
  const safePriority = normalizeString(priority).toLowerCase();
  if (safePriority === 'urgent') return 'Priorité urgente';
  if (safePriority === 'high' || safePriority === 'haute') return 'Priorité haute';
  return 'Priorité normale';
}

function getPriorityTone(priority = 'normal') {
  const safePriority = normalizeString(priority).toLowerCase();
  if (safePriority === 'urgent') return 'urgent';
  if (safePriority === 'high' || safePriority === 'haute') return 'high';
  return 'normal';
}

function getPlanItemType(item = {}) {
  if (item.type) return normalizeString(item.type);
  if (item.itemType) return normalizeString(item.itemType);
  return item.courseId ? 'real_course' : '';
}

function isRealCoursePlanItem(item = {}) {
  const courseId = normalizeString(item.courseId);
  if (!courseId) return false;

  const type = getPlanItemType(item).toLowerCase();
  const nonCourseTypes = [
    'placeholder_course',
    'buffer_period',
    'revision_period',
    'catchup_period',
    'assignment',
    'exam',
    'evaluation',
    'live_session',
    'workshop'
  ];

  return !nonCourseTypes.includes(type);
}

function getCoursePlanStartMs(plan = {}) {
  return getTimestampMs(plan.recommendedStartAt || plan.plannedStartAt || plan.startAt || plan.deadlineAt || plan.dueAt);
}

function sortCoursePlans(plans = []) {
  return [...plans].sort((a, b) => {
    const aDate = getCoursePlanStartMs(a);
    const bDate = getCoursePlanStartMs(b);
    if (aDate && bDate && aDate !== bDate) return aDate - bDate;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return Number(a.order || 0) - Number(b.order || 0);
  });
}

function formatPlanDates(plan = {}) {
  const start = formatDate(plan.recommendedStartAt || plan.plannedStartAt || plan.startAt);
  const end = formatDate(plan.recommendedEndAt || plan.plannedEndAt || plan.endAt);
  const deadline = formatDate(plan.deadlineAt || plan.dueAt);

  if (start && end && start !== end) return `${start} → ${end}`;
  if (start) return `Début ${start}`;
  if (deadline) return `Échéance ${deadline}`;
  return '';
}

function getPrimaryPlan(course = {}) {
  const plans = Array.isArray(course.__promotionPlans) ? course.__promotionPlans : [];
  return sortCoursePlans(plans)[0] || null;
}

function getCourseUpdatedMs(course = {}) {
  return getTimestampMs(course.updatedAt) || getTimestampMs(course.dateCreation) || getTimestampMs(course.createdAt);
}

function sortCourses(courses = [], mode = getSortValue()) {
  const safeMode = normalizeString(mode) || 'recent';

  return [...courses].sort((a, b) => {
    if (safeMode === 'title') {
      return getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' });
    }

    if (safeMode === 'status') {
      const statusCompare = getCourseStatus(a).label.localeCompare(getCourseStatus(b).label, 'fr', { sensitivity: 'base' });
      if (statusCompare !== 0) return statusCompare;
      return getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' });
    }

    const bDate = getCourseUpdatedMs(b);
    const aDate = getCourseUpdatedMs(a);
    if (bDate !== aDate) return bDate - aDate;

    return getCourseTitle(a).localeCompare(getCourseTitle(b), 'fr', { sensitivity: 'base' });
  });
}

async function safeGetDocs(queryRef, label) {
  try {
    return await getDocs(queryRef);
  } catch (error) {
    console.warn(`[SBI Teacher Library] ${label} ignoré :`, error);
    return null;
  }
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

function getCourseAuthorId(course = {}) {
  return normalizeString(course.auteurId || course.authorId || course.createdBy || course.creatorId);
}

function getUserDisplayName(user = {}) {
  const firstName = normalizeString(user.prenom || user.firstName);
  const lastName = normalizeString(user.nom || user.lastName);
  const fullName = normalizeString(`${firstName} ${lastName}`);
  return fullName || normalizeString(user.displayName || user.name || user.email);
}

function getInlineCourseAuthorLabel(course = {}) {
  return normalizeString(
    course.authorName
    || course.auteurNom
    || course.auteurName
    || course.createdByName
    || course.creatorName
  );
}

async function loadAuthorById(authorId) {
  const safeAuthorId = normalizeString(authorId);
  if (!safeAuthorId) return null;
  if (authorCache.has(safeAuthorId)) return authorCache.get(safeAuthorId);

  try {
    const snap = await getDoc(doc(db, 'users', safeAuthorId));
    const author = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    authorCache.set(safeAuthorId, author);
    return author;
  } catch (error) {
    console.warn('[SBI Teacher Library] Auteur non chargé :', safeAuthorId, error);
    authorCache.set(safeAuthorId, null);
    return null;
  }
}

async function loadCourseAuthors(courses = []) {
  const ids = normalizeList(courses.map(getCourseAuthorId));
  const entries = await Promise.all(ids.map(async (id) => [id, await loadAuthorById(id)]));
  return new Map(entries);
}

function resolveCourseAuthorLabel(course = {}, authorMap = new Map()) {
  const inline = getInlineCourseAuthorLabel(course);
  if (inline) return inline;

  const authorId = getCourseAuthorId(course);
  const author = authorId ? authorMap.get(authorId) : null;
  const displayName = getUserDisplayName(author || {});

  if (displayName) return displayName;
  if (authorId) return 'Équipe SBI';
  return 'Auteur inconnu';
}

async function loadFormationsByIds(ids = []) {
  const safeIds = normalizeList(ids);
  if (!safeIds.length) return [];

  const formations = [];
  for (const chunk of chunkArray(safeIds)) {
    const snap = await safeGetDocs(
      query(collection(db, 'formations'), where(documentId(), 'in', chunk)),
      'formations par IDs'
    );
    formations.push(...snapToArray(snap));
  }

  return formations;
}

async function loadFormationsByTitles(titles = []) {
  const safeTitles = normalizeList(titles);
  if (!safeTitles.length) return [];

  const formations = [];
  for (const chunk of chunkArray(safeTitles)) {
    const snap = await safeGetDocs(
      query(collection(db, 'formations'), where('titre', 'in', chunk)),
      'formations par titres'
    );
    formations.push(...snapToArray(snap));
  }

  return formations;
}

async function loadFormationsByTeacher(uid) {
  const snap = await safeGetDocs(
    query(collection(db, 'formations'), where('profs', 'array-contains', uid)),
    'formations par professeur'
  );
  return snapToArray(snap);
}

async function loadTeacherFormations(uid, profile = {}) {
  const profileFormationIds = normalizeList(profile.formationIds);
  const profileFormationTitles = normalizeList(profile.formationsAcces);

  const formations = [
    ...(await loadFormationsByIds(profileFormationIds)),
    ...(await loadFormationsByTitles(profileFormationTitles)),
    ...(await loadFormationsByTeacher(uid))
  ];

  return uniqById(formations);
}

function getFormationKeys(profile = {}, formations = []) {
  const ids = new Set(normalizeList(profile.formationIds));
  const titles = new Set(normalizeList(profile.formationsAcces));

  formations.forEach((formation) => {
    const id = normalizeString(formation?.id);
    const title = normalizeString(formation?.titre || formation?.title);
    if (id) ids.add(id);
    if (title) titles.add(title);
  });

  return {
    ids: normalizeList(Array.from(ids)),
    titles: normalizeList(Array.from(titles))
  };
}

async function loadCoursesByArrayField(fieldName, values = [], label = fieldName) {
  const safeValues = normalizeList(values);
  if (!fieldName || !safeValues.length) return [];

  const courses = [];

  if (safeValues.length === 1) {
    const snap = await safeGetDocs(
      query(collection(db, 'courses'), where(fieldName, 'array-contains', safeValues[0])),
      `cours par ${label}`
    );
    courses.push(...snapToArray(snap));
    return courses;
  }

  for (const chunk of chunkArray(safeValues)) {
    const snap = await safeGetDocs(
      query(collection(db, 'courses'), where(fieldName, 'array-contains-any', chunk)),
      `cours par ${label}`
    );
    courses.push(...snapToArray(snap));
  }

  return courses;
}

async function loadCoursesByExactField(fieldName, value, label = fieldName) {
  const safeValue = normalizeString(value);
  if (!fieldName || !safeValue) return [];

  const snap = await safeGetDocs(
    query(collection(db, 'courses'), where(fieldName, '==', safeValue)),
    `cours par ${label}`
  );
  return snapToArray(snap);
}

async function loadTeacherCourseAccessIndex(uid) {
  const safeUid = normalizeString(uid);
  if (!safeUid) return [];

  const snap = await safeGetDocs(
    collection(db, 'teacherCourseAccess', safeUid, 'courses'),
    'index accès cours professeur'
  );
  return snapToArray(snap);
}

async function loadCoursesByIds(courseIds = []) {
  const safeIds = normalizeList(courseIds);
  if (!safeIds.length) return [];

  const courses = [];

  await Promise.all(safeIds.map(async (courseId) => {
    try {
      const snap = await getDoc(doc(db, 'courses', courseId));
      if (snap.exists()) courses.push({ id: snap.id, ...snap.data() });
    } catch (error) {
      console.warn('[SBI Teacher Library] Cours indexé ignoré :', courseId, error);
    }
  }));

  return courses;
}


async function loadPromotionPlansForCourses(courses = [], formationKeys = {}) {
  const courseIds = new Set(normalizeList(courses.map((course) => course.id)));
  if (!courseIds.size) return new Map();

  const formationIds = normalizeList(formationKeys.ids || []);
  if (!formationIds.length) return new Map();

  const promotions = [];
  for (const chunk of chunkArray(formationIds)) {
    const snap = await safeGetDocs(
      query(collection(db, 'promotions'), where('formationId', 'in', chunk)),
      'planning des promotions par formation'
    );
    promotions.push(...snapToArray(snap));
  }

  const planMap = new Map();

  uniqById(promotions).forEach((promotion) => {
    if ((promotion.status || 'active') === 'archived') return;
    const plan = Array.isArray(promotion.coursePlan) ? promotion.coursePlan : [];

    plan.forEach((item, index) => {
      if (!isRealCoursePlanItem(item) || !courseIds.has(normalizeString(item.courseId))) return;

      const payload = {
        ...item,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        promotionId: promotion.id,
        promotionName: promotion.name || promotion.promotionName || 'Promotion',
        formationId: promotion.formationId || item.displayContextFormationId || '',
        formationName: promotion.formationName || item.displayContextFormationName || '',
        startDate: promotion.startDate || '',
        endDate: promotion.endDate || ''
      };

      const rows = planMap.get(item.courseId) || [];
      rows.push(payload);
      planMap.set(item.courseId, rows);
    });
  });

  planMap.forEach((plans, courseId) => {
    planMap.set(courseId, sortCoursePlans(plans));
  });

  return planMap;
}

function attachPromotionPlansToCourses(courses = [], planMap = new Map()) {
  return courses.map((course) => ({
    ...course,
    __promotionPlans: planMap.get(course.id) || []
  }));
}

async function loadTeacherCourses(uid, profile = {}, formations = []) {
  const formationKeys = getFormationKeys(profile, formations);
  const courses = [];

  const accessIndex = await loadTeacherCourseAccessIndex(uid);
  const indexedCourseIds = accessIndex.map((item) => item.courseId || item.id).filter(Boolean);
  courses.push(...await loadCoursesByIds(indexedCourseIds));

  courses.push(...await loadCoursesByExactField('auteurId', uid, 'auteurId'));
  courses.push(...await loadCoursesByArrayField('targetTeacherIds', [uid], 'targetTeacherIds'));

  courses.push(...await loadCoursesByArrayField('formationIds', formationKeys.ids, 'formationIds'));
  courses.push(...await loadCoursesByArrayField('formationsIds', formationKeys.ids, 'formationsIds legacy'));
  courses.push(...await loadCoursesByArrayField('targetFormationIds', formationKeys.ids, 'targetFormationIds'));
  courses.push(...await loadCoursesByArrayField('formations', formationKeys.ids, 'formations IDs'));

  courses.push(...await loadCoursesByArrayField('targetFormationTitles', formationKeys.titles, 'targetFormationTitles'));
  courses.push(...await loadCoursesByArrayField('formations', formationKeys.titles, 'formations titres legacy'));

  return sortCourses(uniqById(courses));
}

function getCourseTitle(course = {}) {
  return normalizeString(course.titre || course.title) || 'Cours sans titre';
}

function getCourseStatus(course = {}) {
  const status = normalizeString(course.statutValidation || course.lmsStatus).toLowerCase();

  if (status === 'pending' || status === 'pending_review') {
    return { label: 'En attente', tone: 'warning', value: 'pending' };
  }

  if (status === 'rejected' || status === 'revision_requested') {
    return { label: 'À corriger', tone: 'danger', value: 'rejected' };
  }

  if (course.actif === true || status === 'approved' || status === 'published') {
    return { label: 'Publié', tone: 'success', value: 'published' };
  }

  return { label: 'Brouillon', tone: 'muted', value: 'draft' };
}

function resolveCourseFormations(course = {}, formationMap = new Map()) {
  const formationRefs = normalizeList([
    ...normalizeList(course.formationIds),
    ...normalizeList(course.formationsIds),
    ...normalizeList(course.targetFormationIds),
    ...normalizeList(course.formations),
    ...normalizeList(course.targetFormationTitles)
  ]);

  const names = formationRefs.map((ref) => {
    const byId = formationMap.get(`id:${ref}`);
    const byTitle = formationMap.get(`title:${ref}`);
    return byId?.titre || byId?.title || byTitle?.titre || byTitle?.title || ref;
  });

  const seen = new Set();
  return names.filter((name) => {
    const key = normalizeString(name).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFormationMap(formations = []) {
  const map = new Map();
  formations.forEach((formation) => {
    const id = normalizeString(formation?.id);
    const title = normalizeString(formation?.titre || formation?.title);
    if (id) map.set(`id:${id}`, formation);
    if (title) map.set(`title:${title}`, formation);
  });
  return map;
}

function renderStatusBadge(status) {
  return `<span class="teacher-course-status teacher-course-status--${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span>`;
}

function getSearchValue() {
  return normalizeString(document.getElementById('teacher-courses-search')?.value).toLowerCase();
}

function getStatusFilterValue() {
  return normalizeString(document.getElementById('teacher-courses-status-filter')?.value) || 'all';
}

function getScopeFilterValue() {
  return normalizeString(document.getElementById('teacher-courses-scope-filter')?.value) || 'all';
}

function getSortValue() {
  return normalizeString(document.getElementById('teacher-courses-sort')?.value) || 'recent';
}

function getCourseSearchHaystack(course = {}, { formationMap = new Map(), authorMap = new Map() } = {}) {
  const status = getCourseStatus(course);
  return [
    course.titre,
    course.title,
    course.bloc,
    course.blockTitle,
    course.blockName,
    status.label,
    getInlineCourseAuthorLabel(course),
    getCourseAuthorId(course),
    resolveCourseAuthorLabel(course, authorMap),
    ...resolveCourseFormations(course, formationMap),
    ...normalizeList(course.formations),
    ...normalizeList(course.formationIds),
    ...normalizeList(course.targetFormationTitles)
  ].map(normalizeString).join(' ').toLowerCase();
}

function filterCourses(courses = [], { uid, formationMap = new Map(), authorMap = new Map() } = {}) {
  const search = getSearchValue();
  const statusFilter = getStatusFilterValue();
  const scopeFilter = getScopeFilterValue();

  return courses.filter((course) => {
    const status = getCourseStatus(course);
    const isOwnCourse = getCourseAuthorId(course) === normalizeString(uid);

    if (statusFilter !== 'all' && status.value !== statusFilter) return false;
    if (scopeFilter === 'mine' && !isOwnCourse) return false;
    if (scopeFilter === 'shared' && isOwnCourse) return false;

    if (!search) return true;
    return getCourseSearchHaystack(course, { formationMap, authorMap }).includes(search);
  });
}

function buildLibraryStats(courses = [], uid = '') {
  const stats = {
    total: courses.length,
    published: 0,
    pending: 0,
    planned: 0,
    own: 0,
    shared: 0
  };

  courses.forEach((course) => {
    const status = getCourseStatus(course).value;
    if (status === 'published') stats.published += 1;
    if (status === 'pending') stats.pending += 1;
    if (Array.isArray(course.__promotionPlans) && course.__promotionPlans.length > 0) stats.planned += 1;

    if (getCourseAuthorId(course) === normalizeString(uid)) stats.own += 1;
    else stats.shared += 1;
  });

  return stats;
}

function renderStats(stats) {
  const root = document.getElementById('teacher-courses-insights');
  if (!root) return;

  root.innerHTML = `
    <div class="teacher-library-stat"><strong>${stats.total}</strong><span>Cours accessibles</span></div>
    <div class="teacher-library-stat"><strong>${stats.published}</strong><span>Publiés</span></div>
    <div class="teacher-library-stat"><strong>${stats.pending}</strong><span>À valider</span></div>
    <div class="teacher-library-stat"><strong>${stats.planned}</strong><span>Planifiés</span></div>
  `;
}

function renderCourseCard(course, { uid, formationMap, authorMap }) {
  const status = getCourseStatus(course);
  const title = getCourseTitle(course);
  const chapterCount = Array.isArray(course.chapitres) ? course.chapitres.length : Number(course.lessonCount || 0) || 0;
  const authorId = getCourseAuthorId(course);
  const isOwnCourse = authorId === normalizeString(uid);
  const formationNames = resolveCourseFormations(course, formationMap).slice(0, 3);
  const blocName = normalizeString(course.bloc || course.blockTitle || course.blockName);
  const authorLabel = resolveCourseAuthorLabel(course, authorMap);
  const updatedLabel = formatDate(course.updatedAt || course.dateCreation || course.createdAt);
  const primaryPlan = getPrimaryPlan(course);
  const planDates = primaryPlan ? formatPlanDates(primaryPlan) : '';
  const priorityLabel = primaryPlan ? getPriorityLabel(primaryPlan.priorityLevel) : '';
  const priorityTone = primaryPlan ? getPriorityTone(primaryPlan.priorityLevel) : 'normal';
  const planPromotionLabel = primaryPlan?.promotionName || '';

  const formationTags = formationNames.length
    ? formationNames.map((name) => `<span class="teacher-course-tag teacher-course-tag--formation">${escapeHtml(name)}</span>`).join('')
    : '<span class="teacher-course-tag teacher-course-tag--muted">Formation liée</span>';

  const blocTag = blocName
    ? `<span class="teacher-course-tag teacher-course-tag--bloc">Bloc : ${escapeHtml(blocName)}</span>`
    : '';

  const draftClass = status.tone === 'muted' ? ' teacher-course-card--draft' : '';
  const scopeLabel = isOwnCourse ? 'Cours perso' : 'Cours partagé';
  const updatedHtml = updatedLabel ? `<span>Mis à jour le ${escapeHtml(updatedLabel)}</span>` : '<span>Mise à jour non renseignée</span>';
  const planningHtml = primaryPlan
    ? `<div class="teacher-course-card__planning">
        <span>${escapeHtml(planDates || 'Dates à confirmer')}</span>
        <span class="teacher-course-priority teacher-course-priority--${escapeHtml(priorityTone)}">${escapeHtml(priorityLabel)}</span>
        ${planPromotionLabel ? `<span>${escapeHtml(planPromotionLabel)}</span>` : ''}
      </div>`
    : '';

  const editButton = isOwnCourse
    ? `<button class="teacher-course-btn teacher-course-btn--secondary" type="button" data-teacher-edit-course="${escapeHtml(course.id)}">Modifier</button>`
    : '';

  return `
    <article class="teacher-course-card${draftClass}" data-course-id="${escapeHtml(course.id)}">
      <div class="teacher-course-card__body">
        <div class="teacher-course-card__meta">
          ${renderStatusBadge(status)}
          <span class="teacher-course-count">${chapterCount} étape${chapterCount > 1 ? 's' : ''}</span>
          <span class="teacher-course-count teacher-course-count--scope">${escapeHtml(scopeLabel)}</span>
        </div>
        <h3 class="teacher-course-card__title">${escapeHtml(title)}</h3>
        <div class="teacher-course-card__signature">
          <span>Créé par <strong>${escapeHtml(authorLabel)}</strong></span>
          ${updatedHtml}
        </div>
        ${planningHtml}
        <div class="teacher-course-card__tags">${formationTags}${blocTag}</div>
      </div>
      <div class="teacher-course-card__actions">
        <a class="teacher-course-btn teacher-course-btn--primary" href="${COURSE_VIEWER_URL}?id=${encodeURIComponent(course.id)}&preview=true&returnTo=${encodeURIComponent('/teacher/mes-cours.html')}" data-sbi-no-pjax="true" data-sbi-no-transition="true">Ouvrir</a>
        ${editButton}
      </div>
    </article>
  `;
}


function buildCourseEditorV2Url(courseId = '') {
  const safeCourseId = normalizeString(courseId);
  return safeCourseId ? `${COURSE_EDITOR_V2_URL}?id=${encodeURIComponent(safeCourseId)}` : COURSE_EDITOR_V2_URL;
}

async function navigateTeacherCourseEditorV2(courseId = '', { source = 'teacher-library-v2' } = {}) {
  const target = buildCourseEditorV2Url(courseId);
  if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
    try {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(target, { historyMode: 'push', source });
      if (handled) return true;
    } catch (error) {
      console.warn('[SBI Teacher Library] Navigation V2 PJAX indisponible, fallback classique :', error);
    }
  }
  window.location.href = target;
  return false;
}

function openTeacherCourseEditor(courseId = '') {
  const safeCourseId = normalizeString(courseId);
  if (!safeCourseId) return;

  const targetUrl = `${COURSE_EDITOR_V2_URL}?id=${encodeURIComponent(safeCourseId)}`;

  if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
    try {
      const result = window.SBI_APP_SHELL_NAVIGATE(targetUrl, {
        historyMode: 'push',
        source: 'teacher-library-edit-v2-direct'
      });
      if (result && typeof result.then === 'function') {
        result.then((handled) => {
          if (!handled) window.location.assign(targetUrl);
        }).catch(() => window.location.assign(targetUrl));
        return;
      }
      if (result) return;
    } catch (error) {
      console.warn('[SBI Teacher Library] Navigation V2 impossible, fallback classique :', error);
    }
  }

  window.location.assign(targetUrl);
}

function handleTeacherLibraryPopState() {
  // L'ancien onglet éditeur a été retiré côté prof. La navigation retour
  // est maintenant gérée par le shell PJAX et /teacher/course-editor.html.
}

function renderEmpty(root, hasFilters = false) {
  root.innerHTML = `
    <div class="teacher-course-empty">
      <strong>${hasFilters ? 'Aucun cours ne correspond aux filtres.' : 'Aucun cours trouvé pour vos formations.'}</strong>
      <span>${hasFilters ? 'Essaie de retirer un filtre ou de vider la recherche.' : 'Si un cours vient d’être ajouté, utilise “Actualiser”. Si le problème persiste, vérifie que le prof est bien rattaché à la formation.'}</span>
    </div>
  `;
}

function renderError(root, message) {
  root.innerHTML = `
    <div class="teacher-course-empty teacher-course-empty--error">
      <strong>Bibliothèque indisponible.</strong>
      <span>${escapeHtml(message || 'Erreur de chargement.')}</span>
    </div>
  `;
}

function renderLibrary({ root, courses, uid, formations, authorMap = new Map() }) {
  const formationMap = buildFormationMap(formations);
  const visibleCourses = sortCourses(filterCourses(courses, { uid, formationMap, authorMap }));
  const countEl = document.getElementById('teacher-courses-count');
  const hasFilters = Boolean(getSearchValue() || getStatusFilterValue() !== 'all' || getScopeFilterValue() !== 'all');

  if (countEl) {
    countEl.textContent = `${visibleCourses.length} cours affiché${visibleCourses.length > 1 ? 's' : ''}`;
  }

  renderStats(buildLibraryStats(courses, uid));

  if (!visibleCourses.length) {
    renderEmpty(root, hasFilters);
    return;
  }

  root.innerHTML = visibleCourses
    .map((course) => renderCourseCard(course, { uid, formationMap, authorMap }))
    .join('');

  root.querySelectorAll('[data-teacher-edit-course]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const courseId = button.getAttribute('data-teacher-edit-course');
      if (!courseId) return;

      openTeacherCourseEditor(courseId);
    });
  });
}

async function loadAndRender(state) {
  const { root, uid, profile } = state;
  if (!root || !uid || !profile) return;

  root.innerHTML = '<div class="teacher-course-loading">Chargement de la bibliothèque…</div>';

  const formations = await loadTeacherFormations(uid, profile);
  const rawCourses = await loadTeacherCourses(uid, profile, formations);
  const formationKeys = getFormationKeys(profile, formations);
  const planMap = await loadPromotionPlansForCourses(rawCourses, formationKeys);
  const courses = attachPromotionPlansToCourses(rawCourses, planMap);
  const authorMap = await loadCourseAuthors(courses);

  state.formations = formations;
  state.courses = courses;
  state.authorMap = authorMap;

  renderLibrary({ root, courses, uid, formations, authorMap });
}

function bindToolbarControls(state, rerender) {
  const controls = [
    document.getElementById('teacher-courses-search'),
    document.getElementById('teacher-courses-status-filter'),
    document.getElementById('teacher-courses-scope-filter'),
    document.getElementById('teacher-courses-sort')
  ].filter(Boolean);

  controls.forEach((control) => {
    const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
    control.addEventListener(eventName, rerender);
    state.cleanupHandlers.push(() => control.removeEventListener(eventName, rerender));
  });
}

export function mountTeacherCoursesLibrary({ source = 'standard' } = {}) {
  activeMountCleanup?.({ reason: 'remount' });

  const root = document.getElementById('teacher-courses-list-container');
  if (!root) return null;

  let disposed = false;
  const state = {
    root,
    uid: null,
    profile: null,
    courses: [],
    formations: [],
    authorMap: new Map(),
    cleanupHandlers: []
  };

  const rerender = () => renderLibrary({
    root,
    courses: state.courses,
    uid: state.uid,
    formations: state.formations,
    authorMap: state.authorMap
  });

  const refreshHandler = () => loadAndRender(state).catch((error) => {
    console.error('[SBI Teacher Library] Actualisation impossible :', error);
    renderError(root, error?.message);
  });

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (disposed) return;

    if (!user) {
      window.location.replace('/login.html');
      return;
    }

    state.uid = user.uid;
    state.profile = await loadProfile(user.uid);

    if (disposed) return;

    await loadAndRender(state);

    window.dispatchEvent(new CustomEvent('sbi:teacher-library-mounted', {
      detail: { source, uid: user.uid }
    }));
  });

  bindToolbarControls(state, rerender);

  const refreshButton = document.getElementById('teacher-courses-refresh');
  refreshButton?.addEventListener('click', refreshHandler);
  window.addEventListener('sbi:teacher-library-refresh', refreshHandler);
  window.addEventListener('popstate', handleTeacherLibraryPopState);

  const cleanup = () => {
    disposed = true;
    unsubscribeAuth?.();
    refreshButton?.removeEventListener('click', refreshHandler);
    window.removeEventListener('sbi:teacher-library-refresh', refreshHandler);
    window.removeEventListener('popstate', handleTeacherLibraryPopState);
    state.cleanupHandlers.splice(0).forEach((handler) => {
      try { handler(); } catch {}
    });

    if (activeMountCleanup === cleanup) {
      activeMountCleanup = null;
    }
  };

  activeMountCleanup = cleanup;
  return cleanup;
}

function autoMountTeacherCoursesLibrary() {
  if (window.__SBI_APP_SHELL_MOUNTING_TEACHER_COURSES_LIBRARY) return;
  if (!document.getElementById('teacher-courses-list-container')) return;
  mountTeacherCoursesLibrary({ source: 'auto' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMountTeacherCoursesLibrary, { once: true });
} else {
  autoMountTeacherCoursesLibrary();
}
