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

function sortCourses(courses = []) {
  return [...courses].sort((a, b) => {
    const bDate = getTimestampMs(b.updatedAt) || getTimestampMs(b.dateCreation) || getTimestampMs(b.createdAt);
    const aDate = getTimestampMs(a.updatedAt) || getTimestampMs(a.dateCreation) || getTimestampMs(a.createdAt);

    if (bDate !== aDate) return bDate - aDate;

    return normalizeString(a.titre || a.title).localeCompare(normalizeString(b.titre || b.title), 'fr', {
      sensitivity: 'base'
    });
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

  // Important : pour une seule valeur, utiliser array-contains.
  // Firestore/rules le prouvent mieux que array-contains-any avec un seul UID,
  // notamment pour targetTeacherIds côté professeur.
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
    return { label: 'En attente', tone: 'warning' };
  }

  if (status === 'rejected' || status === 'revision_requested') {
    return { label: 'À corriger', tone: 'danger' };
  }

  if (course.actif === true || status === 'approved' || status === 'published') {
    return { label: 'Publié', tone: 'success' };
  }

  return { label: 'Brouillon', tone: 'muted' };
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

function renderCourseCard(course, { uid, formationMap, authorMap }) {
  const status = getCourseStatus(course);
  const title = getCourseTitle(course);
  const chapterCount = Array.isArray(course.chapitres) ? course.chapitres.length : Number(course.lessonCount || 0) || 0;
  const isOwnCourse = normalizeString(course.auteurId) === normalizeString(uid);
  const formationNames = resolveCourseFormations(course, formationMap).slice(0, 3);
  const blocName = normalizeString(course.bloc || course.blockTitle || course.blockName);
  const authorLabel = resolveCourseAuthorLabel(course, authorMap);
  const formationTags = formationNames.length
    ? formationNames.map((name) => `<span class="teacher-course-tag teacher-course-tag--formation">${escapeHtml(name)}</span>`).join('')
    : '<span class="teacher-course-tag teacher-course-tag--muted">Formation liée</span>';
  const blocTag = blocName
    ? `<span class="teacher-course-tag teacher-course-tag--bloc">Bloc : ${escapeHtml(blocName)}</span>`
    : '';
  const draftClass = status.tone === 'muted' ? ' teacher-course-card--draft' : '';

  const editButton = isOwnCourse
    ? `<button class="teacher-course-btn teacher-course-btn--secondary" type="button" data-teacher-edit-course="${escapeHtml(course.id)}">Éditer</button>`
    : '';

  return `
    <article class="teacher-course-card${draftClass}" data-course-id="${escapeHtml(course.id)}">
      <div class="teacher-course-card__body">
        <div class="teacher-course-card__meta">
          ${renderStatusBadge(status)}
          <span class="teacher-course-count">${chapterCount} étape${chapterCount > 1 ? 's' : ''}</span>
        </div>
        <h3 class="teacher-course-card__title">${escapeHtml(title)}</h3>
        <div class="teacher-course-card__signature">Créé par <strong>${escapeHtml(authorLabel)}</strong></div>
        <div class="teacher-course-card__tags">${formationTags}${blocTag}</div>
      </div>
      <div class="teacher-course-card__actions">
        <a class="teacher-course-btn teacher-course-btn--primary" href="${COURSE_VIEWER_URL}?id=${encodeURIComponent(course.id)}&preview=true" data-sbi-no-pjax="true" data-sbi-no-transition="true">Visualiser</a>
        ${editButton}
      </div>
    </article>
  `;
}

function renderEmpty(root) {
  root.innerHTML = `
    <div class="teacher-course-empty">
      <strong>Aucun cours trouvé pour vos formations.</strong>
      <span>Si un cours vient d’être ajouté, utilise “Actualiser”. Si le problème persiste, vérifie que le prof est bien rattaché à la formation.</span>
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

function getSearchValue() {
  return normalizeString(document.getElementById('teacher-courses-search')?.value).toLowerCase();
}

function filterCourses(courses = []) {
  const search = getSearchValue();
  if (!search) return courses;

  return courses.filter((course) => {
    const haystack = [
      course.titre,
      course.title,
      course.bloc,
      getInlineCourseAuthorLabel(course),
      getCourseAuthorId(course),
      ...(Array.isArray(course.formations) ? course.formations : []),
      ...(Array.isArray(course.formationIds) ? course.formationIds : []),
      ...(Array.isArray(course.targetFormationTitles) ? course.targetFormationTitles : [])
    ].map(normalizeString).join(' ').toLowerCase();

    return haystack.includes(search);
  });
}

function renderLibrary({ root, courses, uid, formations, authorMap = new Map() }) {
  const visibleCourses = filterCourses(courses);
  const countEl = document.getElementById('teacher-courses-count');
  const formationMap = buildFormationMap(formations);

  if (countEl) {
    countEl.textContent = `${visibleCourses.length} cours`;
  }

  if (!visibleCourses.length) {
    renderEmpty(root);
    return;
  }

  root.innerHTML = visibleCourses
    .map((course) => renderCourseCard(course, { uid, formationMap, authorMap }))
    .join('');
  root.querySelectorAll('[data-teacher-edit-course]').forEach((button) => {
    button.addEventListener('click', () => {
      const courseId = button.getAttribute('data-teacher-edit-course');
      if (!courseId) return;

      if (typeof window.switchCourseTab === 'function') {
        window.switchCourseTab('tab-editor');
      }

      if (typeof window.editCourse === 'function') {
        window.editCourse(courseId);
      } else {
        window.location.href = `/teacher/mes-cours.html?edit=${encodeURIComponent(courseId)}`;
      }
    });
  });
}

async function loadAndRender(state) {
  const { root, uid, profile } = state;
  if (!root || !uid || !profile) return;

  root.innerHTML = '<div class="teacher-course-loading">Chargement de la bibliothèque…</div>';

  const formations = await loadTeacherFormations(uid, profile);
  const courses = await loadTeacherCourses(uid, profile, formations);

  const authorMap = await loadCourseAuthors(courses);

  state.formations = formations;
  state.courses = courses;
  state.authorMap = authorMap;

  renderLibrary({ root, courses, uid, formations, authorMap });
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
    authorMap: new Map()
  };

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

  const refreshHandler = () => loadAndRender(state).catch((error) => {
    console.error('[SBI Teacher Library] Actualisation impossible :', error);
    renderError(root, error?.message);
  });

  const searchHandler = () => renderLibrary({
    root,
    courses: state.courses,
    uid: state.uid,
    formations: state.formations,
    authorMap: state.authorMap
  });

  const refreshButton = document.getElementById('teacher-courses-refresh');
  const searchInput = document.getElementById('teacher-courses-search');

  refreshButton?.addEventListener('click', refreshHandler);
  searchInput?.addEventListener('input', searchHandler);
  window.addEventListener('sbi:teacher-library-refresh', refreshHandler);

  const cleanup = () => {
    disposed = true;
    unsubscribeAuth?.();
    refreshButton?.removeEventListener('click', refreshHandler);
    searchInput?.removeEventListener('input', searchHandler);
    window.removeEventListener('sbi:teacher-library-refresh', refreshHandler);

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
