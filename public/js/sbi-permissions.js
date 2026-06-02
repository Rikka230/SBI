/**
 * SBI 8.0P.167.44 / P2H.2-I
 * Permissions et rôles centralisés.
 *
 * Ce module est volontairement léger :
 * - normalise les alias de rôles existants ;
 * - expose les permissions de base admin/prof/élève ;
 * - prépare les futures couches promotions/cursus/documents ;
 * - ne remplace pas les règles Firestore/Storage.
 */

export const SBI_ROLE_ALIASES = Object.freeze({
  admin: ['admin', 'administrator', 'administrateur'],
  teacher: ['teacher', 'prof', 'professeur', 'enseignant'],
  student: ['student', 'eleve', 'élève', 'etudiant', 'étudiant'],
  // SBI 8.0P.167.287 — nouveau rôle « tuteur » / maître d'apprentissage.
  tutor: ['tutor', 'tuteur', 'mentor', 'maitre', 'maître', "maitre d'apprentissage"]
});

export const SBI_LANDING_PATHS = Object.freeze({
  admin: '/admin/index.html',
  teacher: '/teacher/dashboard.html',
  student: '/student/dashboard.html',
  tutor: '/tutor/dashboard.html',
  unknown: '/login.html'
});

export const SBI_PROTECTED_ROOTS = Object.freeze({
  admin: '/admin',
  teacher: '/teacher',
  student: '/student',
  tutor: '/tutor'
});

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSbiRole(roleOrProfile = '') {
  const rawRole = typeof roleOrProfile === 'object'
    ? roleOrProfile?.role
    : roleOrProfile;

  const role = normalizeText(rawRole);

  if (SBI_ROLE_ALIASES.admin.includes(role)) return 'admin';
  if (SBI_ROLE_ALIASES.teacher.includes(role)) return 'teacher';
  if (SBI_ROLE_ALIASES.student.includes(role)) return 'student';
  if (SBI_ROLE_ALIASES.tutor.includes(role)) return 'tutor';

  return role || 'unknown';
}

export function isSbiGod(profile = {}) {
  return profile?.isGod === true;
}

export function isSbiAdminLike(profile = {}) {
  return isSbiGod(profile) || normalizeSbiRole(profile) === 'admin';
}

export function isSbiTeacher(profile = {}) {
  return normalizeSbiRole(profile) === 'teacher';
}

export function isSbiStudent(profile = {}) {
  return normalizeSbiRole(profile) === 'student';
}

export function isSbiTutor(profile = {}) {
  return normalizeSbiRole(profile) === 'tutor';
}

export function isSbiTeacherOrStudent(profile = {}) {
  const role = normalizeSbiRole(profile);
  return role === 'teacher' || role === 'student' || role === 'tutor';
}

export function getSbiRoleLabel(profile = {}) {
  if (isSbiGod(profile)) return 'Admin Suprême';

  const role = normalizeSbiRole(profile);
  if (role === 'admin') return 'Administrateur';
  if (role === 'teacher') return 'Professeur';
  if (role === 'student') return 'Élève';
  if (role === 'tutor') return "Maître d'apprentissage";

  return 'Compte';
}

export function getSbiLandingPath(profile = {}) {
  if (isSbiAdminLike(profile)) return SBI_LANDING_PATHS.admin;

  const role = normalizeSbiRole(profile);
  return SBI_LANDING_PATHS[role] || SBI_LANDING_PATHS.unknown;
}

export function normalizeSbiPath(pathname = '') {
  const raw = String(pathname || window.location?.pathname || '/').toLowerCase();
  const clean = raw.replace(/\/+$/, '') || '/';

  if (clean === '/admin') return '/admin/index.html';
  if (clean === '/teacher') return '/teacher/dashboard.html';
  if (clean === '/student') return '/student/dashboard.html';
  if (clean === '/tutor') return '/tutor/dashboard.html';

  return clean;
}

export function getSbiRouteGroup(pathname = '') {
  const path = normalizeSbiPath(pathname);

  if (path.startsWith(SBI_PROTECTED_ROOTS.admin)) return 'admin';
  if (path.startsWith(SBI_PROTECTED_ROOTS.teacher)) return 'teacher';
  if (path.startsWith(SBI_PROTECTED_ROOTS.student)) return 'student';
  if (path.startsWith(SBI_PROTECTED_ROOTS.tutor)) return 'tutor';

  return 'public';
}

export function isSbiProtectedPath(pathname = '') {
  return getSbiRouteGroup(pathname) !== 'public';
}

export function canAccessSbiRoute(profile = {}, pathname = '') {
  const group = getSbiRouteGroup(pathname);
  if (group === 'public') return true;

  if (isSbiAdminLike(profile)) return true;

  const role = normalizeSbiRole(profile);

  if (group === 'admin') return false;
  if (group === 'teacher') return role === 'teacher';
  if (group === 'student') return role === 'student';
  if (group === 'tutor') return role === 'tutor';

  return false;
}

export function getSbiRouteDecision(profile = {}, pathname = '') {
  const allowed = canAccessSbiRoute(profile, pathname);

  return {
    allowed,
    group: getSbiRouteGroup(pathname),
    role: normalizeSbiRole(profile),
    isGod: isSbiGod(profile),
    landingPath: getSbiLandingPath(profile)
  };
}

export function getSbiPermissions(profile = {}) {
  const role = normalizeSbiRole(profile);
  const adminLike = isSbiAdminLike(profile);
  const teacher = role === 'teacher';
  const student = role === 'student';
  const tutor = role === 'tutor';

  return Object.freeze({
    role,
    isGod: isSbiGod(profile),
    isAdminLike: adminLike,

    canAccessAdminSpace: adminLike,
    canAccessTeacherSpace: adminLike || teacher,
    canAccessStudentSpace: adminLike || student,
    canAccessTutorSpace: adminLike || tutor,

    canManageAccounts: adminLike,
    canDeleteAccounts: adminLike,
    canResetPasswords: adminLike,
    canChangeAccountEmails: adminLike,
    canViewGlobalAuditLog: adminLike,
    canViewAccountEscalations: adminLike,

    canManagePublicSite: adminLike,
    canManageFormations: adminLike,
    canValidateTeacherCourses: adminLike,

    canEditOwnCourses: teacher,
    canViewAssignedStudents: adminLike || teacher,
    canViewAssignedPromotions: adminLike || teacher,
    canViewPedagogicalDocuments: adminLike || teacher,

    canViewOwnCourses: adminLike || teacher || student,
    canViewOwnDocuments: student,
    canViewOwnProgress: student,

    canCompleteFirstLoginChecklist: teacher || student || tutor
  });
}

export function hasSbiPermission(profile = {}, permission = '') {
  return getSbiPermissions(profile)[permission] === true;
}
