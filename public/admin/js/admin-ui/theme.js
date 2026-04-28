/**
 * SBI 8.0L.2 - Space theme
 *
 * Le thème interne doit rester cohérent même en navigation PJAX.
 * On lit donc l'URL effective du shell si elle existe.
 */

export function initSpaceTheme() {
    const path = getEffectivePath();
    const dashboardPaths = new Set([
        '/admin/index.html',
        '/admin/',
        '/student/dashboard.html',
        '/teacher/dashboard.html'
    ]);

    injectInternalThemeStylesheet('/admin/css/sbi-internal-theme.css');
    injectInternalThemeStylesheet('/admin/css/sbi-ui-polish.css');
    injectInternalThemeStylesheet('/admin/css/sbi-ui-fixes.css');
    injectInternalThemeStylesheet('/admin/css/sbi-admin-chrome-harmonization.css');

    document.body.classList.add('sbi-internal-ui');

    document.body.classList.remove('sbi-admin-space', 'sbi-student-space', 'sbi-teacher-space');

    if (dashboardPaths.has(path)) {
        document.body.classList.add('sbi-dashboard-page', 'sbi-dashboard-redesign');
    } else {
        document.body.classList.remove('sbi-dashboard-page', 'sbi-dashboard-redesign');
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

function getEffectivePath() {
    try {
        const href = window.SBI_APP_SHELL_CURRENT_URL || window.location.href;
        return new URL(href, window.location.origin).pathname.toLowerCase();
    } catch {
        return window.location.pathname.toLowerCase();
    }
}

function injectInternalThemeStylesheet(themeHref) {
    const absoluteHref = new URL(themeHref, window.location.origin).href;

    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
        .some((link) => new URL(link.getAttribute('href'), window.location.origin).href === absoluteHref);

    if (exists) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = themeHref;
    document.head.appendChild(link);
}
