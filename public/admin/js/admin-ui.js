/**
 * =======================================================================
 * ADMIN UI - Gestion Visuelle et Navigation (A-Z)
 * =======================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    const leftToggleBtn = document.getElementById('btn-toggle-left');
    const rightToggleBtn = document.getElementById('btn-toggle-right');
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    /* --- 1. GESTION DES PANNEAUX LATERAUX --- */
    const desktopToggleBtn = document.getElementById('btn-toggle-panel');
    const mobileToggleBtn = document.getElementById('btn-toggle-mobile');

    setTimeout(() => {
        document.body.classList.remove('preload');
    }, 100);

    if (desktopToggleBtn) {
        desktopToggleBtn.addEventListener('click', () => {
            appContainer.classList.toggle('left-collapsed');
            localStorage.setItem('leftPanelCollapsed', appContainer.classList.contains('left-collapsed'));
        });
    }

    if (mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', () => {
            appContainer.classList.toggle('left-open');
            appContainer.classList.remove('right-open');
        });
    }

    if (rightToggleBtn) {
        rightToggleBtn.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                appContainer.classList.toggle('right-collapsed');
                localStorage.setItem('rightPanelCollapsed', appContainer.classList.contains('right-collapsed'));
            } else {
                appContainer.classList.toggle('right-open');
                appContainer.classList.remove('left-open');
            }
        });
    }
    
    document.getElementById('main-content').addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            appContainer.classList.remove('left-open');
            appContainer.classList.remove('right-open');
        }
    });
    
    /* --- 2. NAVIGATION ENTRE LES ONGLETS --- */
    
    // Le Dashboard s'ouvre par défaut s'il n'y a pas de mémoire
    const savedTab = sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
    switchView(savedTab);

    navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            switchView(targetId);
            
            if (window.innerWidth <= 768) {
                appContainer.classList.remove('left-open');
            }
        });
    });

    function switchView(targetId) {
        navItems.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        const activeBtn = document.querySelector(`.nav-item[data-target="${targetId}"]`);
        const activeView = document.getElementById(targetId);

        if (activeBtn) activeBtn.classList.add('active');
        if (activeView) activeView.classList.add('active');

        sessionStorage.setItem('activeAdminTab', targetId);
    }
});
