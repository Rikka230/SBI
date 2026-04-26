import { auth, db } from '/js/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

    initAdminVisitorShortcut();

    /* --- 1. GESTION DES PANNEAUX --- */
    setTimeout(() => { document.body.classList.remove('preload'); }, 100);

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
        });
    }

    if (rightToggleBtn) {
        rightToggleBtn.addEventListener('click', () => {
            if (window.innerWidth > 1024) {
                appContainer.classList.toggle('right-collapsed');
                localStorage.setItem('rightPanelCollapsed', appContainer.classList.contains('right-collapsed'));
            } else {
                appContainer.classList.toggle('right-open');
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && appContainer.classList.contains('left-open')) {
            if (!e.target.closest('#left-panel') && !e.target.closest('#btn-toggle-mobile')) {
                appContainer.classList.remove('left-open');
            }
        }
        if (window.innerWidth <= 1024 && appContainer.classList.contains('right-open')) {
            if (!e.target.closest('#right-panel') && !e.target.closest('#btn-toggle-right')) {
                appContainer.classList.remove('right-open');
            }
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth <= 1024) {
            appContainer.classList.remove('left-open');
            appContainer.classList.remove('right-open');
        }
    });
    
    /* --- 2. NAVIGATION ONGLET (SANS F5) --- */
    const savedTab = sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
    
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
        if (!activeView) return; 

        navItems.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        const activeBtn = document.querySelector(`.nav-item[data-target="${targetId}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        activeView.classList.add('active');

        sessionStorage.setItem('activeAdminTab', targetId);
    }
});


function initAdminVisitorShortcut() {
    const path = window.location.pathname;
    const isRoleSpace = path.startsWith('/teacher/') || path.startsWith('/student/');

    if (!isRoleSpace || !document.querySelector('.admin-return-link')) {
        document.body.classList.remove('sbi-admin-visitor');
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            document.body.classList.remove('sbi-admin-visitor');
            return;
        }

        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const userData = userSnap.exists() ? userSnap.data() : null;
            const canReturnToAdmin = userData?.isGod === true || userData?.role === 'admin';
            document.body.classList.toggle('sbi-admin-visitor', canReturnToAdmin);
        } catch (error) {
            console.warn('[SBI UI] Impossible de vérifier le raccourci admin :', error);
            document.body.classList.remove('sbi-admin-visitor');
        }
    });
}
