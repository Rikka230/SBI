/**
 * =======================================================================
 * SBI LEARNING ACCESS
 * =======================================================================
 *
 * Accès pédagogique robuste pour les espaces élève/prof :
 * - formations assignées par IDs, titres legacy et membership ;
 * - cours par formations avec fallback si index/query Firestore refuse ;
 * - cours présents dans la progression comme filet de sécurité ;
 * - utilisateurs partageant une formation pour la recherche topbar.
 * =======================================================================
 */

import { db } from '/js/firebase-init.js';
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getUserLearningProgress } from '/js/course-engine.js';

export function normalizeList(items) {
  if (!Array.isArray(items)) return [];
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function uniqById(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item?.id) map.set(String(item.id), item);
  });
  return Array.from(map.values());
}

export function chunkArray(items, size = 10) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function snapToArray(snapshot) {
  const items = [];
  snapshot?.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
  return items;
}

function isDebugAccessEnabled() {
  try {
    return localStorage.getItem('sbiDebugAccess') === 'true';
  } catch {
    return false;
  }
}

function isExpectedAccessError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code.includes('permission-denied') ||
    code.includes('failed-precondition') ||
    message.includes('missing or insufficient permissions') ||
    message.includes('permission') ||
    message.includes('index')
  );
}

function reportOptionalAccess(label, error, suffix = 'ignorée') {
  if (isDebugAccessEnabled()) {
    console.debug(`[SBI Learning Access] ${label} ${suffix} :`, error);
  }
}

export async function safeGetDoc(docRef, label = 'document Firestore') {
  try {
    return await getDoc(docRef);
  } catch (error) {
    if (isExpectedAccessError(error)) {
      reportOptionalAccess(label, error, 'inaccessible');
      return null;
    }
    console.warn(`[SBI Learning Access] ${label} inaccessible :`, error);
    return null;
  }
}

export async function safeGetDocs(queryRef, label = 'requête Firestore') {
  try {
    return await getDocs(queryRef);
  } catch (error) {
    if (isExpectedAccessError(error)) {
      reportOptionalAccess(label, error, 'ignorée');
      return null;
    }
    console.warn(`[SBI Learning Access] ${label} ignorée :`, error);
    return null;
  }
}

export function roleOf(userData = {}, fallback = '') {
  if (userData?.isGod === true || userData?.role === 'admin') return 'admin';
  if (userData?.role === 'teacher' || userData?.role === 'prof') return 'teacher';
  if (userData?.role === 'student' || userData?.role === 'eleve') return 'student';
  return fallback || 'student';
}

export function isAdminLike(userData = {}) {
  return userData?.isGod === true || userData?.role === 'admin';
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  const snap = await safeGetDoc(doc(db, 'users', uid), `profil utilisateur ${uid}`);
  return snap?.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchUsersByIds(userIds) {
  const ids = normalizeList(userIds);
  if (!ids.length) return [];

  const users = await Promise.all(ids.map(async (uid) => getUserProfile(uid)));
  return uniqById(users.filter(Boolean));
}

export async function fetchFormationsByIds(formationIds) {
  const ids = normalizeList(formationIds);
  if (!ids.length) return [];

  const formations = [];

  for (const chunk of chunkArray(ids, 10)) {
    const q = query(collection(db, 'formations'), where(documentId(), 'in', chunk));
    const snap = await safeGetDocs(q, 'formations par IDs');
    if (snap) formations.push(...snapToArray(snap));
  }

  return uniqById(formations);
}

export async function fetchFormationsByTitles(titles) {
  const safeTitles = normalizeList(titles);
  if (!safeTitles.length) return [];

  const formations = [];

  for (const chunk of chunkArray(safeTitles, 10)) {
    const q = query(collection(db, 'formations'), where('titre', 'in', chunk));
    const snap = await safeGetDocs(q, 'formations par titres legacy');
    if (snap) formations.push(...snapToArray(snap));
  }

  return uniqById(formations);
}

export async function fetchFormationsByMembership(uid, fieldName) {
  if (!uid || !fieldName) return [];

  const q = query(collection(db, 'formations'), where(fieldName, 'array-contains', uid));
  const snap = await safeGetDocs(q, `formations par ${fieldName}`);
  return snap ? snapToArray(snap) : [];
}

export async function loadAssignedFormationsForUser({ uid, userData = {}, role = '' } = {}) {
  const safeRole = roleOf(userData, role);

  if (isAdminLike(userData) || safeRole === 'admin') {
    const snap = await safeGetDocs(collection(db, 'formations'), 'toutes les formations');
    return snap ? snapToArray(snap).sort(sortByTitle) : [];
  }

  const membershipField = safeRole === 'teacher' ? 'profs' : 'students';

  const formations = await Promise.all([
    fetchFormationsByIds(userData.formationIds || []),
    fetchFormationsByTitles(userData.formationsAcces || []),
    fetchFormationsByMembership(uid, membershipField)
  ]);

  return uniqById(formations.flat()).sort(sortByTitle);
}

export function getFormationLookupKeys(formations = []) {
  const keys = [];
  formations.forEach((formation) => {
    if (formation?.id) keys.push(String(formation.id));
    if (formation?.titre) keys.push(String(formation.titre));
  });
  return normalizeList(keys);
}

function getCourseFormationValues(course = {}) {
  const values = [];

  if (Array.isArray(course.formations)) values.push(...course.formations);
  if (Array.isArray(course.formationIds)) values.push(...course.formationIds);
  if (Array.isArray(course.formationsIds)) values.push(...course.formationsIds);

  [
    course.formationId,
    course.formation,
    course.formationTitre,
    course.formationTitle,
    course.formationName,
    course.formationNom,
    course.formationRef
  ].forEach((value) => {
    if (value) values.push(value);
  });

  return normalizeList(values);
}

export function courseBelongsToFormation(course = {}, formation = {}, allFormations = []) {
  const courseValues = getCourseFormationValues(course);
  const formationId = formation?.id ? String(formation.id).trim() : '';
  const formationTitle = formation?.titre ? String(formation.titre).trim() : '';

  if (courseValues.length > 0) {
    return Boolean(
      (formationId && courseValues.includes(formationId)) ||
      (formationTitle && courseValues.includes(formationTitle))
    );
  }

  // Filet de sécurité : un cours issu de la progression d'un élève sans champ
  // formation exploitable reste affichable si l'élève n'a qu'une formation.
  if (course.__progressLinked === true && Array.isArray(allFormations) && allFormations.length === 1) {
    return allFormations[0]?.id === formation?.id;
  }

  return false;
}

export function isCourseVisible(course = {}, { allowProgress = false } = {}) {
  if (allowProgress && course.__progressLinked === true) return true;
  if (course.actif === true) return true;
  if (course.statutValidation === 'approved' && course.actif !== false) return true;
  return false;
}

export async function fetchCourseById(courseId, { progressLinked = false } = {}) {
  if (!courseId) return null;
  const snap = await safeGetDoc(doc(db, 'courses', String(courseId)), `cours ${courseId}`);
  if (!snap?.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
    ...(progressLinked ? { __progressLinked: true } : {})
  };
}

export async function fetchCoursesByIds(courseIds, { progressLinked = false } = {}) {
  const ids = normalizeList(courseIds);
  if (!ids.length) return [];

  const courses = await Promise.all(ids.map((courseId) => fetchCourseById(courseId, { progressLinked })));
  return uniqById(courses.filter(Boolean));
}

export async function fetchCoursesTargetingUser(uid) {
  if (!uid) return [];

  const q = query(collection(db, 'courses'), where('targetStudents', 'array-contains', uid));
  const snap = await safeGetDocs(q, 'cours ciblant l’utilisateur');
  return snap ? snapToArray(snap).filter((course) => isCourseVisible(course)) : [];
}

export async function fetchCoursesByFormationKeys(formationKeys, { activeOnly = true } = {}) {
  const keys = normalizeList(formationKeys);
  if (!keys.length) return [];

  const courses = [];

  for (const chunk of chunkArray(keys, 10)) {
    let snap = null;

    if (activeOnly) {
      const activeQuery = query(
        collection(db, 'courses'),
        where('formations', 'array-contains-any', chunk),
        where('actif', '==', true)
      );
      snap = await safeGetDocs(activeQuery, 'cours actifs par formation');
    }

    // Fallback si l'index composite n'existe pas, si les rules refusent le combo,
    // ou si le cours est validé autrement que par actif === true.
    if (!snap) {
      const fallbackQuery = query(collection(db, 'courses'), where('formations', 'array-contains-any', chunk));
      snap = await safeGetDocs(fallbackQuery, 'cours par formation sans filtre actif');
    }

    if (!snap) continue;

    const items = snapToArray(snap)
      .filter((course) => !activeOnly || isCourseVisible(course));

    courses.push(...items);
  }

  return uniqById(courses);
}

export async function loadCoursesForUser({
  uid,
  userData = {},
  role = '',
  formations = [],
  progress = null,
  includeProgress = true,
  activeOnly = true
} = {}) {
  const safeRole = roleOf(userData, role);

  if (isAdminLike(userData) || safeRole === 'admin') {
    const snap = await safeGetDocs(collection(db, 'courses'), 'cours admin');
    const courses = snap ? snapToArray(snap) : [];
    return courses.filter((course) => !activeOnly || isCourseVisible(course)).sort(sortCourses);
  }

  const formationKeys = getFormationLookupKeys(formations);
  const byFormation = await fetchCoursesByFormationKeys(formationKeys, { activeOnly });
  const byTargetStudent = safeRole === 'student' && uid
    ? await fetchCoursesTargetingUser(uid)
    : [];

  let progressCourses = [];
  if (includeProgress && uid) {
    const safeProgress = progress || await getUserLearningProgress(uid);
    const progressIds = Object.keys(safeProgress?.courses || {});
    progressCourses = await fetchCoursesByIds(progressIds, { progressLinked: true });
  }

  if (safeRole === 'teacher' && uid) {
    const ownQuery = query(collection(db, 'courses'), where('auteurId', '==', uid));
    const ownSnap = await safeGetDocs(ownQuery, 'cours propres professeur');
    if (ownSnap) byFormation.push(...snapToArray(ownSnap));
  }

  return uniqById([...byFormation, ...byTargetStudent, ...progressCourses])
    .filter((course) => isCourseVisible(course, { allowProgress: includeProgress }))
    .sort(sortCourses);
}

export async function loadSearchUsersForRole({ uid, userData = {}, role = '', formations = [] } = {}) {
  const safeRole = roleOf(userData, role);

  if (safeRole === 'admin') {
    const snap = await safeGetDocs(collection(db, 'users'), 'utilisateurs admin');
    return snap ? snapToArray(snap) : [];
  }

  const targetRoles = safeRole === 'teacher'
    ? new Set(['student', 'eleve', 'élève'])
    : new Set(['teacher', 'prof', 'professor']);

  const idsFromMembership = [];
  formations.forEach((formation) => {
    if (safeRole === 'teacher') idsFromMembership.push(...normalizeList(formation.students || []));
    if (safeRole === 'student') idsFromMembership.push(...normalizeList(formation.profs || []));
  });

  const byIds = await fetchUsersByIds(idsFromMembership);
  const formationIds = formations.map((formation) => formation.id).filter(Boolean);
  const byIndex = [];

  for (const chunk of chunkArray(normalizeList(formationIds), 10)) {
    const q = query(collection(db, 'users'), where('formationIds', 'array-contains-any', chunk));
    const snap = await safeGetDocs(q, 'utilisateurs par formationIds');
    if (snap) byIndex.push(...snapToArray(snap));
  }

  return uniqById([...byIds, ...byIndex])
    .filter((user) => user.id !== uid)
    .filter((user) => !isAdminLike(user))
    .filter((user) => targetRoles.has(String(user.role || '').toLowerCase()));
}

export function sortByTitle(a, b) {
  return String(a?.titre || '').localeCompare(String(b?.titre || ''), 'fr', { sensitivity: 'base' });
}

export function sortCourses(a, b) {
  const aDate = a?.dateCreation?.toMillis ? a.dateCreation.toMillis() : 0;
  const bDate = b?.dateCreation?.toMillis ? b.dateCreation.toMillis() : 0;
  if (aDate || bDate) return bDate - aDate;
  return String(a?.titre || '').localeCompare(String(b?.titre || ''), 'fr', { sensitivity: 'base' });
}
