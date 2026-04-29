/**
 * SBI 8.0M.9 - Course viewer bridge foundation
 *
 * Ce fichier prépare la future migration PJAX du viewer de cours.
 *
 * IMPORTANT :
 * En 8.0M.9, aucune route viewer n'est activée en PJAX.
 * Le viewer reste volontairement en navigation classique.
 *
 * Raisons :
 * - progression Firestore,
 * - timers de sécurité,
 * - quiz runtime,
 * - vidéo,
 * - back dynamique,
 * - preview admin/prof.
 *
 * Note 8.0M.7 : test viewer preview PJAX rejeté.
 * Conclusion : le viewer ne doit pas être injecté dans le shell actuel ;
 * future migration uniquement en route plein écran dédiée.
 */

export const COURSE_VIEWER_ROUTES = {
  student: '/student/cours-viewer.html',
  teacher: '/teacher/cours-viewer.html',
  admin: '/admin/cours-viewer.html'
};

export const COURSE_VIEWER_LAST_REJECTED_EXPERIMENT = {
  patch: '8.0M.7',
  reason: 'Injection viewer dans shell admin rejetée : chrome persistant, largeur cassée, layout non plein écran.',
  rollback: '8.0M.8',
  nextSafeStrategy: 'fullscreen-route-only'
};

export const COURSE_VIEWER_SENSITIVE_AREAS = [
  'auth-state',
  'course-fetch',
  'progress-start',
  'progress-validate',
  'security-timer',
  'quiz-runtime',
  'dynamic-back',
  'preview-mode',
  'video-media'
];

export function normalizeViewerPath(pathname = window.location.pathname) {
  if (!pathname) return '/';
  return pathname.replace(/\/+$/, '').toLowerCase() || '/';
}

export function isCourseViewerUrl(urlLike = window.location.href) {
  try {
    const url = new URL(urlLike, window.location.origin);
    const path = normalizeViewerPath(url.pathname);

    return Object.values(COURSE_VIEWER_ROUTES).includes(path);
  } catch {
    return false;
  }
}

export function getViewerRoleFromUrl(urlLike = window.location.href) {
  try {
    const url = new URL(urlLike, window.location.origin);
    const path = normalizeViewerPath(url.pathname);

    if (path === COURSE_VIEWER_ROUTES.admin) return 'admin';
    if (path === COURSE_VIEWER_ROUTES.teacher) return 'teacher';
    if (path === COURSE_VIEWER_ROUTES.student) return 'student';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getViewerRouteStatus(urlLike = window.location.href) {
  const isViewer = isCourseViewerUrl(urlLike);

  return {
    isViewer,
    role: isViewer ? getViewerRoleFromUrl(urlLike) : 'none',
    pjaxReady: false,
    mode: isViewer ? 'reload-protected' : 'not-viewer',
    safeNextStrategy: isViewer ? COURSE_VIEWER_LAST_REJECTED_EXPERIMENT.nextSafeStrategy : 'none',
    lastRejectedExperiment: isViewer ? { ...COURSE_VIEWER_LAST_REJECTED_EXPERIMENT } : null,
    reason: isViewer
      ? 'Viewer encore protégé : progression, timer, quiz et vidéo nécessitent un lifecycle dédié.'
      : 'URL hors viewer.',
    sensitiveAreas: isViewer ? [...COURSE_VIEWER_SENSITIVE_AREAS] : []
  };
}

export function installViewerDiagnostics() {
  window.SBI_VIEWER_STATUS = (href = window.location.href) => {
    const status = getViewerRouteStatus(href);

    console.table([{
      url: new URL(href, window.location.href).href,
      viewer: status.isViewer,
      role: status.role,
      mode: status.mode,
      pjaxReady: status.pjaxReady,
      safeNextStrategy: status.safeNextStrategy,
      reason: status.reason
    }]);

    if (status.sensitiveAreas.length) {
      console.table(status.sensitiveAreas.map((area) => ({ sensitiveArea: area })));
    }

    return status;
  };

  window.SBI_VIEWER_ROUTES = () => {
    const routes = Object.entries(COURSE_VIEWER_ROUTES).map(([role, path]) => ({
      role,
      path,
      mode: 'reload-protected'
    }));

    console.table(routes);
    return routes;
  };
}

export function createViewerLifecyclePlan() {
  return {
    targetPatch: 'post-8.0M.9',
    currentMode: 'reload-protected',
    rejectedPatch: COURSE_VIEWER_LAST_REJECTED_EXPERIMENT,
    nextSafeStrategy: 'fullscreen-route-only',
    requiredBeforePjax: [
      'export mountCourseViewer() depuis /student/js/cours-viewer.js',
      'retourner cleanup() pour clearInterval(timerInterval)',
      'remplacer DOMContentLoaded auto par autoMount désactivable',
      'déporter leaveViewer() pour compatibilité shell',
      'isoler quiz listeners par chapitre',
      'rendre preview mode non destructif en PJAX',
      'créer une route plein écran qui masque totalement left-panel/right-panel/topbar',
      'interdire l’injection viewer dans #main-content du shell admin/prof/student',
      'ajouter fallback reload au moindre échec progress/quiz'
    ]
  };
}
