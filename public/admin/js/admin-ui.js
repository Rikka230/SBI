/**
 * =======================================================================
 * ADMIN UI - Gestion Visuelle et Navigation (A-Z)
 * (Indépendant des appels base de données)
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

    // Réactive les animations une fois la page bien chargée
    setTimeout(() => {
        document.body.classList.remove('preload');
    }, 100);

    // Toggle Panneau Gauche (PC)
    if (desktopToggleBtn) {
        desktopToggleBtn.addEventListener('click', () => {
            appContainer.classList.toggle('left-collapsed');
            localStorage.setItem('leftPanelCollapsed', appContainer.classList.contains('left-collapsed'));
        });
    }

    // Toggle Menu Gauche (Mobile)
    if (mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', () => {
            appContainer.classList.toggle('left-open');
            appContainer.classList.remove('right-open');
        });
    }

    // Toggle Menu Droit (PC et Mobile)
    if (rightToggleBtn) {
        rightToggleBtn.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                appContainer.classList.toggle('right-collapsed');
                // Sauvegarde de l'état du panneau droit !
                localStorage.setItem('rightPanelCollapsed', appContainer.classList.contains('right-collapsed'));
            } else {
                appContainer.classList.toggle('right-open');
                appContainer.classList.remove('left-open');
            }
        });
    }
    
    // Fermeture automatique sur mobile au clic
    document.getElementById('main-content').addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            appContainer.classList.remove('left-open');
            appContainer.classList.remove('right-open');
        }
    });
    
    /* --- 2. NAVIGATION ENTRE LES ONGLETS --- */

    // Restaurer le dernier onglet actif (Mémoire au rafraîchissement)
    const savedTab = sessionStorage.getItem('activeAdminTab');
    if (savedTab) {
        switchView(savedTab);
    }

    // Écouteurs sur le menu de navigation
    navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            switchView(targetId);
            
            // Sur mobile, on ferme le menu après avoir cliqué
            if (window.innerWidth <= 768) {
                appContainer.classList.remove('left-open');
            }
        });
    });

    // Fonction de bascule d'affichage
    function switchView(targetId) {
        // Désactive tous les boutons et vues
        navItems.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        // Active la cible
        const activeBtn = document.querySelector(`.nav-item[data-target="${targetId}"]`);
        const activeView = document.getElementById(targetId);

        if (activeBtn) activeBtn.classList.add('active');
        if (activeView) activeView.classList.add('active');

        // Sauvegarde en session
        sessionStorage.setItem('activeAdminTab', targetId);
    }
});
