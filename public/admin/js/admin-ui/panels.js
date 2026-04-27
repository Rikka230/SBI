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

    const savedTab = new URLSearchParams(window.location.search).get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';

    if (navItems.length > 0 && document.getElementById(savedTab)) {
        switchView(savedTab, { replaceUrl: false });
    }

    navItems.forEach((button) => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.getAttribute('data-target');
            const href = event.currentTarget.getAttribute('data-href') || (targetId ? `/admin/index.html?tab=${targetId}` : '/admin/index.html');

            if (targetId && document.getElementById(targetId)) {
                event.preventDefault();
                switchView(targetId, { replaceUrl: true });
            } else if (href) {
                window.location.href = href;
            }

            if (appContainer && window.innerWidth <= 768) {
                appContainer.classList.remove('left-open');
            }
        });
    });

    function switchView(targetId, { replaceUrl = true } = {}) {
        const activeView = document.getElementById(targetId);
        if (!activeView) return;

        navItems.forEach((button) => button.classList.remove('active'));
        views.forEach((view) => view.classList.remove('active'));

        const activeButton = document.querySelector(`.nav-item[data-target="${targetId}"]`);
        activeButton?.classList.add('active');
        activeView.classList.add('active');

        sessionStorage.setItem('activeAdminTab', targetId);

        if (replaceUrl && window.location.pathname.toLowerCase().startsWith('/admin/')) {
            const url = new URL(window.location.href);
            url.pathname = '/admin/index.html';
            url.searchParams.set('tab', targetId);
            window.history.replaceState({ sbiTab: targetId }, '', url.pathname + url.search);
        }
    }
}
