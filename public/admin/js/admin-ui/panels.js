function getAdminTabFromLocation() {
    const tabFromUrl = new URLSearchParams(window.location.search).get('tab');
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

export function initPanelControls() {
    const appContainer = document.getElementById('app-container');
    const desktopToggleBtn = document.getElementById('btn-toggle-panel');
    const mobileToggleBtn = document.getElementById('btn-toggle-mobile');
    const rightToggleBtn = document.getElementById('btn-toggle-right');

    setTimeout(() => { document.body.classList.remove('preload'); }, 100);

    if (appContainer && window.innerWidth > 1024) {
        if (localStorage.getItem('leftPanelCollapsed') === 'true') appContainer.classList.add('left-collapsed');
        if (localStorage.getItem('rightPanelCollapsed') === 'true') appContainer.classList.add('right-collapsed');
    }

    desktopToggleBtn?.addEventListener('click', () => {
        if (!appContainer) return;
        appContainer.classList.toggle('left-collapsed');
        localStorage.setItem('leftPanelCollapsed', appContainer.classList.contains('left-collapsed'));
    });

    mobileToggleBtn?.addEventListener('click', () => {
        if (!appContainer) return;
        appContainer.classList.toggle('left-open');
    });

    rightToggleBtn?.addEventListener('click', () => {
        if (!appContainer) return;
        if (window.innerWidth > 1024) {
            appContainer.classList.toggle('right-collapsed');
            localStorage.setItem('rightPanelCollapsed', appContainer.classList.contains('right-collapsed'));
        } else {
            appContainer.classList.toggle('right-open');
        }
    });

    document.addEventListener('click', (event) => {
        if (appContainer && window.innerWidth <= 768 && appContainer.classList.contains('left-open')) {
            if (!event.target.closest('#left-panel') && !event.target.closest('#btn-toggle-mobile')) {
                appContainer.classList.remove('left-open');
            }
        }

        if (appContainer && window.innerWidth <= 1024 && appContainer.classList.contains('right-open')) {
            if (!event.target.closest('#right-panel') && !event.target.closest('#btn-toggle-right')) {
                appContainer.classList.remove('right-open');
            }
        }
    });

    window.addEventListener('resize', () => {
        if (appContainer && window.innerWidth <= 1024) {
            appContainer.classList.remove('left-open');
            appContainer.classList.remove('right-open');
        }
    });
}

export function initAdminTabs() {
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');
    const appContainer = document.getElementById('app-container');
    const hasAdminViews = navItems.length > 0 && views.length > 0;

    if (!hasAdminViews) return;

    const initialTab = getAdminTabFromLocation();

    if (document.getElementById(initialTab)) {
        switchView(initialTab, { historyMode: 'replace' });
    }

    navItems.forEach((button) => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.getAttribute('data-target');
            const href = event.currentTarget.getAttribute('data-href') || (targetId ? getAdminTabUrl(targetId) : '/admin/index.html');

            if (targetId && document.getElementById(targetId)) {
                event.preventDefault();
                switchView(targetId, { historyMode: 'push' });
            } else if (href) {
                window.location.href = href;
            }

            if (appContainer && window.innerWidth <= 768) {
                appContainer.classList.remove('left-open');
            }
        });
    });

    window.addEventListener('popstate', (event) => {
        const targetId = event.state?.sbiTab || getAdminTabFromLocation();
        if (targetId && document.getElementById(targetId)) {
            switchView(targetId, { updateUrl: false });
        }
    });

    function switchView(targetId, { updateUrl = true, historyMode = 'push' } = {}) {
        const activeView = document.getElementById(targetId);
        if (!activeView) return;

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
            detail: { tab: targetId }
        }));
    }
}
