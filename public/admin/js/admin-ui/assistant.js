export function initAssistantPrototype() {
    if (document.querySelector('.sbi-assistant')) return;

    const path = window.location.pathname.toLowerCase();
    const isAdmin = path.startsWith('/admin/');
    const isTeacher = path.startsWith('/teacher/');
    const isStudent = path.startsWith('/student/');

    if (!isAdmin && !isTeacher && !isStudent) return;

    const config = getAssistantConfig({ isAdmin, isTeacher, isStudent });
    const assistant = document.createElement('div');
    assistant.className = 'sbi-assistant';
    assistant.innerHTML = buildAssistantHTML(config);

    document.body.appendChild(assistant);
    bindAssistantActions(assistant, config);
    initAssistantNotificationSync(assistant);
    initAssistantWander(assistant);
    showAssistantIntroOnce(assistant);
}

function getAssistantConfig({ isTeacher, isStudent }) {
    if (isTeacher) {
        return {
            eyebrow: 'Assistant prof',
            title: 'Repère coach',
            text: 'Tes cours, validations et notifications importantes resteront accessibles ici sans charger l’interface.',
            primary: 'Voir mes cours',
            primaryUrl: '/teacher/mes-cours.html',
            badge: '0'
        };
    }

    if (isStudent) {
        return {
            eyebrow: 'Assistant élève',
            title: 'Continue ton parcours',
            text: 'Tes cours, ta progression et tes signaux utiles seront regroupés ici au fil des prochaines étapes.',
            primary: 'Mes cours',
            primaryUrl: '/student/mes-cours.html',
            badge: '0'
        };
    }

    return {
        eyebrow: 'Assistant admin',
        title: 'Cockpit SBI',
        text: 'Un point d’accès rapide pour les validations, notifications et futurs contrôles plateforme.',
        primary: 'À valider',
        primaryUrl: '/admin/index.html?tab=view-dashboard',
        badge: '0'
    };
}

function buildAssistantHTML(config) {
    return `
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
                <button class="sbi-assistant__action secondary" type="button" data-assistant-notifications>Notifications</button>
                <button class="sbi-assistant__action secondary" type="button" data-assistant-close>Fermer</button>
            </div>
            <div class="sbi-assistant__notification-host" data-assistant-notification-host></div>
        </div>
    `;
}

function bindAssistantActions(assistant, config) {
    const trigger = assistant.querySelector('.sbi-assistant__trigger');
    const closeBtn = assistant.querySelector('[data-assistant-close]');
    const primaryBtn = assistant.querySelector('[data-assistant-primary]');
    const notificationsBtn = assistant.querySelector('[data-assistant-notifications]');

    const setOpen = (isOpen) => {
        assistant.classList.toggle('is-open', isOpen);
        trigger?.setAttribute('aria-expanded', String(isOpen));
        if (!isOpen) assistant.classList.remove('is-notification-mode', 'is-peeking', 'is-attention');
    };

    const toggleNotifications = () => {
        prepareAssistantNotificationHost();
        assistant.classList.toggle('is-notification-mode');
        setOpen(true);
    };

    trigger?.addEventListener('click', (event) => {
        event.stopPropagation();
        prepareAssistantNotificationHost();
        setOpen(!assistant.classList.contains('is-open'));
    });

    closeBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
    });

    notificationsBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleNotifications();
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
}

function prepareAssistantNotificationHost() {
    const assistant = document.querySelector('.sbi-assistant');
    const host = assistant?.querySelector('[data-assistant-notification-host]');
    const notificationsSection = document.getElementById('notifications-section');

    if (!host || !notificationsSection || host.contains(notificationsSection)) return;
    host.appendChild(notificationsSection);
}

function initAssistantNotificationSync(assistant) {
    const badge = assistant?.querySelector('.sbi-assistant__badge');
    if (!assistant || !badge) return;

    let lastCount = 0;
    let initialized = false;

    const syncBadge = () => {
        const bellBadge = document.getElementById('bell-badge');
        const rawValue = bellBadge?.textContent?.trim() || '0';
        const visible = Boolean(bellBadge) && bellBadge.style.display !== 'none' && rawValue !== '0';
        const numericValue = rawValue === '9+' ? 10 : Number.parseInt(rawValue, 10) || 0;

        badge.textContent = rawValue;
        assistant.classList.toggle('has-notifications', visible && numericValue > 0);

        if (initialized && numericValue > lastCount) {
            assistant.classList.add('has-new-notification');
            window.setTimeout(() => assistant.classList.remove('has-new-notification'), 950);
        }

        lastCount = numericValue;
        initialized = true;
    };

    const observer = new MutationObserver(syncBadge);
    document.body.addEventListener('click', () => window.setTimeout(syncBadge, 0));

    const startObserving = () => {
        const bellBadge = document.getElementById('bell-badge');
        if (!bellBadge) {
            window.setTimeout(startObserving, 150);
            return;
        }

        observer.observe(bellBadge, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
            attributeFilter: ['style']
        });

        syncBadge();
    };

    startObserving();
}

function initAssistantWander(assistant) {
    if (!assistant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const scheduleWander = () => {
        const delay = 18000 + Math.random() * 18000;

        window.setTimeout(() => {
            if (!assistant.classList.contains('is-open')) {
                assistant.classList.add('is-wandering');
                window.setTimeout(() => assistant.classList.remove('is-wandering'), 1500);
            }

            scheduleWander();
        }, delay);
    };

    scheduleWander();
}

function showAssistantIntroOnce(assistant) {
    const key = 'sbiAssistantIntroSeen';
    if (sessionStorage.getItem(key) === 'true') return;
    sessionStorage.setItem(key, 'true');

    window.setTimeout(() => {
        assistant.classList.add('is-peeking', 'is-attention');

        window.setTimeout(() => {
            assistant.classList.remove('is-peeking', 'is-attention');
        }, 3600);
    }, 1300);
}
