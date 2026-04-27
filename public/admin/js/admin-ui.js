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

    initSpaceTheme();
    initAssistantPrototype();
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

function initSpaceTheme() {
    const path = window.location.pathname.toLowerCase();
    const dashboardPaths = new Set([
        '/admin/index.html',
        '/admin/',
        '/student/dashboard.html',
        '/teacher/dashboard.html'
    ]);

    injectInternalThemeStylesheet();
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

function injectInternalThemeStylesheet() {
    const themeHref = '/admin/css/sbi-internal-theme.css';

    if (document.querySelector(`link[href="${themeHref}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = themeHref;
    document.head.appendChild(link);
}

function initAssistantPrototype() {
    if (document.querySelector('.sbi-assistant')) return;

    const path = window.location.pathname.toLowerCase();
    const isAdmin = path.startsWith('/admin/');
    const isTeacher = path.startsWith('/teacher/');
    const isStudent = path.startsWith('/student/');

    if (!isAdmin && !isTeacher && !isStudent) return;

    const config = isTeacher
        ? {
            eyebrow: 'Assistant prof',
            title: 'Repère coach',
            text: 'Tes cours, validations et notifications importantes resteront accessibles ici sans charger l’interface.',
            primary: 'Voir mes cours',
            primaryUrl: '/teacher/mes-cours.html',
            badge: '1'
        }
        : isStudent
            ? {
                eyebrow: 'Assistant élève',
                title: 'Continue ton parcours',
                text: 'Tes cours, ta progression et tes signaux utiles seront regroupés ici au fil des prochaines étapes.',
                primary: 'Mes cours',
                primaryUrl: '/student/mes-cours.html',
                badge: '1'
            }
            : {
                eyebrow: 'Assistant admin',
                title: 'Cockpit SBI',
                text: 'Un point d’accès rapide pour les validations, notifications et futurs contrôles plateforme.',
                primary: 'À valider',
                primaryUrl: '/admin/index.html?tab=view-dashboard',
                badge: '1'
            };

    const assistant = document.createElement('div');
    assistant.className = 'sbi-assistant';
    assistant.innerHTML = `
        <button class="sbi-assistant__trigger" type="button" aria-label="Ouvrir l’assistant SBI" aria-expanded="false">
            <span class="sbi-assistant__dot" aria-hidden="true"></span>
            <span class="sbi-assistant__badge">${config.badge}</span>
        </button>
        <div class="sbi-assistant__panel" role="dialog" aria-label="Assistant SBI">
            <p class="sbi-assistant__eyebrow">${config.eyebrow}</p>
            <h3 class="sbi-assistant__title">${config.title}</h3>
            <p class="sbi-assistant__text">${config.text}</p>
            <div class="sbi-assistant__actions">
                <button class="sbi-assistant__action" type="button" data-assistant-primary>${config.primary}</button>
                <button class="sbi-assistant__action secondary" type="button" data-assistant-close>Fermer</button>
            </div>
        </div>
    `;

    document.body.appendChild(assistant);

    const trigger = assistant.querySelector('.sbi-assistant__trigger');
    const closeBtn = assistant.querySelector('[data-assistant-close]');
    const primaryBtn = assistant.querySelector('[data-assistant-primary]');

    const setOpen = (isOpen) => {
        assistant.classList.toggle('is-open', isOpen);
        trigger?.setAttribute('aria-expanded', String(isOpen));
    };

    trigger?.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!assistant.classList.contains('is-open'));
    });

    closeBtn?.addEventListener('click', () => {
        setOpen(false);
    });

    primaryBtn?.addEventListener('click', () => {
        window.location.href = config.primaryUrl;
    });

    document.addEventListener('click', (event) => {
        if (!assistant.contains(event.target)) {
            setOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setOpen(false);
        }
    });

    window.setTimeout(() => {
        assistant.classList.add('is-peeking', 'is-attention');

        window.setTimeout(() => {
            assistant.classList.remove('is-peeking', 'is-attention');
        }, 3600);
    }, 1300);
}

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
