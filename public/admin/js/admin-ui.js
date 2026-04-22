/**
 * =======================================================================
 * ADMIN UI - Gestion Visuelle et Navigation (A-Z)
 * =======================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');

    const desktopToggleBtn = document.getElementById('btn-toggle-panel');
    const mobileToggleBtn = document.getElementById('btn-toggle-mobile');
    const rightToggleBtn = document.getElementById('btn-toggle-right');

    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.admin-view');

    /* --- 1. GESTION DES PANNEAUX --- */
    setTimeout(() => { document.body.classList.remove('preload'); }, 100);

    // FIX : Appliquer l'état sauvegardé dès le chargement (au cas où le script HTML manque)
    if (window.innerWidth > 1024) {
        if (localStorage.getItem('leftPanelCollapsed') === 'true') appContainer.classList.add('left-collapsed');
        if (localStorage.getItem('rightPanelCollapsed') === 'true') appContainer.classList.add('right-collapsed');
    }

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
    
    /* --- 2. NAVIGATION ONGLET (SANS F5) --- */
    const savedTab = sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
    
    // FIX : Ne changer d'onglet que si on est sur une page qui possède cet onglet
    if(navItems.length > 0 && document.getElementById(savedTab)) {
        switchView(savedTab);
    }

    navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            if(targetId && document.getElementById(targetId)) {
                switchView(targetId);
            }
            
            if (window.innerWidth <= 768) {
                appContainer.classList.remove('left-open');
            }
        });
    });

    function switchView(targetId) {
        const activeView = document.getElementById(targetId);
        if (!activeView) return; // Sécurité : stoppe tout si la vue n'existe pas ici (ex: Profil)

        navItems.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        const activeBtn = document.querySelector(`.nav-item[data-target="${targetId}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        activeView.classList.add('active');

        sessionStorage.setItem('activeAdminTab', targetId);
    }
});
