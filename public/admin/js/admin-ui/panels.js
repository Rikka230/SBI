function getAdminTabFromLocation() {
    const currentUrl = new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
    const tabFromUrl = currentUrl.searchParams.get('tab');
    return tabFromUrl || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
}

function getAdminTabUrl(targetId) {
    return `/admin/index.html?tab=${encodeURIComponent(targetId)}`;
}

function updateAdminTabUrl(targetId, mode = 'push') {
    if (!window.location.pathname.toLowerCase().startsWith('/admin/')) return;

    const nextUrl = getAdminTabUrl(targetId);
    const currentUrl = window.location.pathname + window.location.search;

    if (currentUrl === nextUrl) {
        window.history.replaceState({ sbiTab: targetId }, '', nextUrl);
        return;
    }

    const state = { sbiTab: targetId };

    if (mode === 'replace') {
        window.history.replaceState(state, '', nextUrl);
    } else {
        window.history.pushState(state, '', nextUrl);
    }
}

let sbiPanelControlsAutoRebindInstalled = false;

function getInternalArea() {
    try {
        const path = new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin).pathname.toLowerCase();
        if (path.startsWith('/student/')) return 'student';
        if (path.startsWith('/teacher/')) return 'teacher';
        if (path.startsWith('/admin/')) return 'admin';
    } catch (_) {}
    return 'internal';
}

function bindOnce(node, key, handler) {
    if (!node || node.dataset[key] === 'true') return;
    node.dataset[key] = 'true';
    node.addEventListener('click', handler);
}

function applyStoredPanelState(appContainer) {
    if (!appContainer || window.innerWidth <= 1024) return;
    try {
        appContainer.classList.toggle('left-collapsed', localStorage.getItem('leftPanelCollapsed') === 'true');
        appContainer.classList.toggle('right-collapsed', localStorage.getItem('rightPanelCollapsed') === 'true');
    } catch (_) {}
}

function ensureCollapsedHandleUsable(appContainer, desktopToggleBtn) {
    if (!appContainer || !desktopToggleBtn) return;
    desktopToggleBtn.hidden = false;
    desktopToggleBtn.style.pointerEvents = 'auto';
    desktopToggleBtn.style.visibility = 'visible';
    desktopToggleBtn.setAttribute('aria-expanded', String(!appContainer.classList.contains('left-collapsed')));
    desktopToggleBtn.title = appContainer.classList.contains('left-collapsed') ? 'Ouvrir le panneau' : 'Réduire le panneau';
}

export function initPanelControls() {
    const appContainer = document.getElementById('app-container');
    const desktopToggleBtn = document.getElementById('btn-toggle-panel');
    const mobileToggleBtn = document.getElementById('btn-toggle-mobile');
    const rightToggleBtn = document.getElementById('btn-toggle-right');
    const area = getInternalArea();

    setTimeout(() => { document.body?.classList?.remove('preload'); }, 100);

    applyStoredPanelState(appContainer);
    ensureCollapsedHandleUsable(appContainer, desktopToggleBtn);

    bindOnce(desktopToggleBtn, 'sbiPanelToggleBound', () => {
        if (!appContainer) return;
        appContainer.classList.toggle('left-collapsed');
        try { localStorage.setItem('leftPanelCollapsed', String(appContainer.classList.contains('left-collapsed'))); } catch (_) {}
        ensureCollapsedHandleUsable(appContainer, desktopToggleBtn);
        window.dispatchEvent(new CustomEvent('sbi:left-panel:toggled', {
            detail: { collapsed: appContainer.classList.contains('left-collapsed'), area }
        }));
    });

    bindOnce(mobileToggleBtn, 'sbiMobilePanelToggleBound', () => {
        if (!appContainer) return;
        appContainer.classList.toggle('left-open');
    });

    bindOnce(rightToggleBtn, 'sbiRightPanelToggleBound', () => {
        if (!appContainer) return;
        if (window.innerWidth > 1024) {
            appContainer.classList.toggle('right-collapsed');
            try { localStorage.setItem('rightPanelCollapsed', String(appContainer.classList.contains('right-collapsed'))); } catch (_) {}
        } else {
            appContainer.classList.toggle('right-open');
        }
    });

    if (!sbiPanelControlsAutoRebindInstalled) {
        sbiPanelControlsAutoRebindInstalled = true;

        document.addEventListener('click', (event) => {
            const currentApp = document.getElementById('app-container');
            if (currentApp && window.innerWidth <= 768 && currentApp.classList.contains('left-open')) {
                if (!event.target.closest('#left-panel') && !event.target.closest('#btn-toggle-mobile')) {
                    currentApp.classList.remove('left-open');
                }
            }

            if (currentApp && window.innerWidth <= 1024 && currentApp.classList.contains('right-open')) {
                if (!event.target.closest('#right-panel') && !event.target.closest('#btn-toggle-right')) {
                    currentApp.classList.remove('right-open');
                }
            }
        });

        window.addEventListener('resize', () => {
            const currentApp = document.getElementById('app-container');
            if (currentApp && window.innerWidth <= 1024) {
                currentApp.classList.remove('left-open');
                currentApp.classList.remove('right-open');
            }
            ensureCollapsedHandleUsable(currentApp, document.getElementById('btn-toggle-panel'));
        });

        ['sbi:app-shell:navigated', 'sbi:app-shell-rendered', 'sbi:component-mounted', 'pageshow'].forEach((eventName) => {
            window.addEventListener(eventName, () => window.setTimeout(initPanelControls, 40));
        });
    }
}

export function initAdminTabs() {
    window.SBI_ADMIN_TABS?.destroy?.();

    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');
    const appContainer = document.getElementById('app-container');
    const hasAdminViews = navItems.length > 0 && views.length > 0;

    if (!hasAdminViews) return;

    const cleanups = [];

    const switchView = (targetId, { updateUrl = true, historyMode = 'push', source = 'admin-tabs' } = {}) => {
        const activeView = document.getElementById(targetId);
        if (!activeView) return false;

        navItems.forEach((button) => {
            const isActive = button.getAttribute('data-target') === targetId;
            button.classList.toggle('active', isActive);
            if (isActive) {
                button.setAttribute('aria-current', 'page');
            } else {
                button.removeAttribute('aria-current');
            }
        });

        views.forEach((view) => view.classList.remove('active'));
        activeView.classList.add('active');

        sessionStorage.setItem('activeAdminTab', targetId);

        if (updateUrl) {
            updateAdminTabUrl(targetId, historyMode);
        }

        window.dispatchEvent(new CustomEvent('sbi:admin-tab-changed', {
            detail: { tab: targetId, source }
        }));

        return true;
    };

    const initialTab = getAdminTabFromLocation();

    if (document.getElementById(initialTab)) {
        switchView(initialTab, { historyMode: 'replace', source: 'initial' });
    }

    navItems.forEach((button) => {
        const onClick = (event) => {
            const targetId = event.currentTarget.getAttribute('data-target');
            const href = event.currentTarget.getAttribute('data-href') || (targetId ? getAdminTabUrl(targetId) : '/admin/index.html');

            if (targetId && document.getElementById(targetId)) {
                event.preventDefault();
                switchView(targetId, { historyMode: 'push', source: 'click' });
            } else if (href) {
                window.location.href = href;
            }

            if (appContainer && window.innerWidth <= 768) {
                appContainer.classList.remove('left-open');
            }
        };

        button.addEventListener('click', onClick);
        cleanups.push(() => button.removeEventListener('click', onClick));
    });

    const onPopState = (event) => {
        if (event.state?.sbiAppShell) return;
        const targetId = event.state?.sbiTab || getAdminTabFromLocation();
        if (targetId && document.getElementById(targetId)) {
            switchView(targetId, { updateUrl: false, source: 'popstate' });
        }
    };

    window.addEventListener('popstate', onPopState);
    cleanups.push(() => window.removeEventListener('popstate', onPopState));

    window.SBI_ADMIN_TABS = {
        switchTo: switchView,
        getActive: getAdminTabFromLocation,
        getUrl: getAdminTabUrl,
        has: (targetId) => Boolean(targetId && document.getElementById(targetId)),
        destroy() {
            cleanups.splice(0, cleanups.length).forEach((cleanup) => cleanup());
        }
    };
}
