/**
 * SBI 6.7A - Internal shell stabilizer
 *
 * Objectif : réduire les rechargements visuels des interfaces internes sans
 * réécrire toute l'application en SPA d'un coup.
 *
 * - Navigation admin index par onglets sans reload.
 * - Nettoyage visuel des labels de panels sans emoji.
 * - Assistant : intro affichée une seule fois par session.
 * - Overlay de transition léger pour les pages qui doivent encore recharger.
 */

const SVG_DIAMOND = `
    <svg class="sbi-shell-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 22 12 12 22 2 12 12 2Zm0 4.4 5.6 5.6-5.6 5.6L6.4 12 12 6.4Z"/>
    </svg>
`;

function isAdminIndexPath(pathname = window.location.pathname) {
    const path = pathname.toLowerCase();
    return path === '/admin/' || path === '/admin/index.html';
}

function switchAdminTab(targetId, { pushState = true } = {}) {
    if (!targetId || !isAdminIndexPath()) return false;

    const targetView = document.getElementById(targetId);
    if (!targetView) return false;

    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    navItems.forEach((item) => item.classList.toggle('active', item.dataset.target === targetId));
    views.forEach((view) => view.classList.toggle('active', view.id === targetId));

    sessionStorage.setItem('activeAdminTab', targetId);

    if (pushState) {
        const url = new URL(window.location.href);
        url.pathname = '/admin/index.html';
        url.searchParams.set('tab', targetId);
        window.history.pushState({ sbiTab: targetId }, '', url.pathname + url.search);
    }

    window.dispatchEvent(new CustomEvent('sbi:admin-tab-changed', { detail: { targetId } }));
    return true;
}

function initAdminTabNavigation() {
    if (!isAdminIndexPath()) return;

    const initialTab = new URLSearchParams(window.location.search).get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
    window.setTimeout(() => switchAdminTab(initialTab, { pushState: false }), 0);

    document.addEventListener('click', (event) => {
        const navItem = event.target.closest?.('.nav-item[data-target]');
        if (!navItem) return;

        const targetId = navItem.dataset.target;
        if (!targetId || !document.getElementById(targetId)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        switchAdminTab(targetId);
    }, true);

    window.addEventListener('popstate', () => {
        const targetId = new URLSearchParams(window.location.search).get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
        switchAdminTab(targetId, { pushState: false });
    });
}

function polishPanelBrands() {
    const applyBrand = (selector, label, accent = 'var(--accent-blue, #2A57FF)') => {
        const zone = document.querySelector(selector);
        if (!zone || zone.dataset.sbiPolished === 'true') return;

        zone.dataset.sbiPolished = 'true';
        zone.innerHTML = `
            ${SVG_DIAMOND}
            <span class="sbi-shell-brand-main" style="color:${accent}">SBI</span>
            <span class="sbi-shell-brand-sub">${label}</span>
        `;
    };

    const path = window.location.pathname.toLowerCase();
    if (path.startsWith('/admin/')) applyBrand('#left-panel .logo-zone', 'Console', 'var(--accent-blue, #2A57FF)');
    if (path.startsWith('/student/')) applyBrand('#left-panel .logo-zone', 'Étudiant', 'var(--accent-blue, #2A57FF)');
    if (path.startsWith('/teacher/')) applyBrand('#left-panel .logo-zone', 'Prof', 'var(--accent-orange, #f97316)');
}

function initAssistantIntroMemory() {
    const seenKey = 'sbiAssistantIntroSeen';
    const isSeen = sessionStorage.getItem(seenKey) === 'true';

    const handleAssistant = (assistant) => {
        if (!assistant) return;

        if (isSeen) {
            assistant.classList.remove('is-peeking', 'is-attention');
        } else {
            sessionStorage.setItem(seenKey, 'true');
        }

        const observer = new MutationObserver(() => {
            if (sessionStorage.getItem(seenKey) === 'true' && !assistant.classList.contains('is-open')) {
                assistant.classList.remove('is-peeking', 'is-attention');
            }
        });

        observer.observe(assistant, { attributes: true, attributeFilter: ['class'] });
    };

    const existing = document.querySelector('.sbi-assistant');
    if (existing) {
        handleAssistant(existing);
        return;
    }

    const bodyObserver = new MutationObserver(() => {
        const assistant = document.querySelector('.sbi-assistant');
        if (!assistant) return;
        bodyObserver.disconnect();
        handleAssistant(assistant);
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function createTransitionOverlay() {
    if (document.getElementById('sbi-shell-transition-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'sbi-shell-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<span></span>';
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('is-active'));
}

function initHardNavigationMask() {
    document.addEventListener('click', (event) => {
        const link = event.target.closest?.('a[href]');
        const clickableNav = event.target.closest?.('[onclick*="window.location.href"]');
        const href = link?.getAttribute('href') || clickableNav?.getAttribute('onclick')?.match(/window\.location\.href=['\"]([^'\"]+)/)?.[1];

        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (link?.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        let url;
        try {
            url = new URL(href, window.location.href);
        } catch {
            return;
        }

        if (url.origin !== window.location.origin) return;

        if (isAdminIndexPath(url.pathname) && isAdminIndexPath()) return;

        const currentSpace = window.location.pathname.split('/')[1];
        const nextSpace = url.pathname.split('/')[1];
        if (!['admin', 'student', 'teacher'].includes(currentSpace) || currentSpace !== nextSpace) return;

        createTransitionOverlay();
        document.body.classList.add('sbi-page-exiting');
    }, true);
}

function initShellPolishLoop() {
    polishPanelBrands();
    window.setTimeout(polishPanelBrands, 120);
    window.setTimeout(polishPanelBrands, 420);
}

function initInternalShell() {
    document.body.classList.add('sbi-shell-stable');
    initShellPolishLoop();
    initAdminTabNavigation();
    initAssistantIntroMemory();
    initHardNavigationMask();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInternalShell);
} else {
    initInternalShell();
}
