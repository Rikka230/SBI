/**
 * SBI 8.0M.7 - Course viewer bridge
 *
 * Le viewer élève réel reste en reload classique.
 * Les previews admin/prof peuvent être montées en PJAX uniquement avec preview=true.
 */

export const COURSE_VIEWER_ROUTES = {
  student: '/student/cours-viewer.html',
  teacher: '/teacher/cours-viewer.html',
  admin: '/admin/cours-viewer.html'
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

export const COURSE_VIEWER_PJAX_PREVIEW_ROUTES = [
  COURSE_VIEWER_ROUTES.teacher,
  COURSE_VIEWER_ROUTES.admin
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

export function isViewerPreviewUrl(urlLike = window.location.href) {
  try {
    const url = new URL(urlLike, window.location.origin);
    return url.searchParams.get('preview') === 'true';
  } catch {
    return false;
  }
}

export function canPjaxCourseViewerPreview(urlLike = window.location.href) {
  try {
    const url = new URL(urlLike, window.location.origin);
    const path = normalizeViewerPath(url.pathname);

    return COURSE_VIEWER_PJAX_PREVIEW_ROUTES.includes(path)
      && url.searchParams.get('preview') === 'true'
      && Boolean(url.searchParams.get('id'));
  } catch {
    return false;
  }
}

export function getViewerRouteStatus(urlLike = window.location.href) {
  const isViewer = isCourseViewerUrl(urlLike);
  const role = isViewer ? getViewerRoleFromUrl(urlLike) : 'none';
  const preview = isViewer ? isViewerPreviewUrl(urlLike) : false;
  const pjaxReady = isViewer ? canPjaxCourseViewerPreview(urlLike) : false;

  if (!isViewer) {
    return {
      isViewer: false,
      role,
      preview,
      pjaxReady: false,
      mode: 'not-viewer',
      reason: 'URL hors viewer.',
      sensitiveAreas: []
    };
  }

  if (pjaxReady) {
    return {
      isViewer: true,
      role,
      preview,
      pjaxReady: true,
      mode: 'pjax-preview-only',
      reason: 'Preview admin/prof autorisée en PJAX. Le viewer élève réel reste protégé.',
      sensitiveAreas: ['preview-mode', 'video-media', 'quiz-runtime', 'dynamic-back']
    };
  }

  return {
    isViewer: true,
    role,
    preview,
    pjaxReady: false,
    mode: 'reload-protected',
    reason: role === 'student'
      ? 'Viewer élève réel protégé : progression, timer, quiz et vidéo restent en reload classique.'
      : 'Viewer admin/prof protégé sauf preview=true avec id.',
    sensitiveAreas: [...COURSE_VIEWER_SENSITIVE_AREAS]
  };
}

export function installViewerDiagnostics() {
  window.SBI_VIEWER_STATUS = (href = window.location.href) => {
    const status = getViewerRouteStatus(href);

    console.table([{
      url: new URL(href, window.location.href).href,
      viewer: status.isViewer,
      role: status.role,
      preview: status.preview,
      mode: status.mode,
      pjaxReady: status.pjaxReady,
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
      mode: COURSE_VIEWER_PJAX_PREVIEW_ROUTES.includes(path) ? 'pjax-preview-only' : 'reload-protected',
      condition: COURSE_VIEWER_PJAX_PREVIEW_ROUTES.includes(path) ? 'preview=true + id présent' : 'toujours reload'
    }));

    console.table(routes);
    return routes;
  };
}

export function createViewerLifecyclePlan() {
  return {
    targetPatch: '8.0M.7+',
    currentMode: 'preview-pjax-only',
    enabledNow: [
      'preview admin en PJAX via /admin/cours-viewer.html?id=...&preview=true',
      'preview prof en PJAX via /teacher/cours-viewer.html?id=...&preview=true',
      'fallback reload au moindre échec de montage'
    ],
    stillProtected: [
      'viewer élève réel /student/cours-viewer.html',
      'progression Firestore réelle hors preview',
      'routes viewer sans preview=true'
    ]
  };
}
