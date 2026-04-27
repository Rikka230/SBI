export function initSpaceTheme() {
    const path = window.location.pathname.toLowerCase();
    const dashboardPaths = new Set([
        '/admin/index.html',
        '/admin/',
        '/student/dashboard.html',
        '/teacher/dashboard.html'
    ]);

    injectInternalThemeStylesheet('/admin/css/sbi-internal-theme.css');
    injectInternalThemeStylesheet('/admin/css/sbi-ui-polish.css');
    injectInternalThemeStylesheet('/admin/css/sbi-ui-fixes.css');
    document.body.classList.add('sbi-internal-ui');

    if (dashboardPaths.has(path)) {
        document.body.classList.add('sbi-dashboard-page', 'sbi-dashboard-redesign');
    } else {
        document.body.classList.remove('sbi-dashboard-page');
    }

    if (path.startsWith('/teacher/')) {
        document.body.classList.add('sbi-teacher-space');
        return;
    }

    if (path.startsWith('/student/')) {
        document.body.classList.add('sbi-student-space');
        return;
    }

    if (path.startsWith('/admin/')) {
        document.body.classList.add('sbi-admin-space');
    }
}

function injectInternalThemeStylesheet(themeHref) {
    if (document.querySelector(`link[href="${themeHref}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = themeHref;
    document.head.appendChild(link);
}
