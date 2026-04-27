// SBI assistant behavior fixes - 6.2
// Small non-invasive layer loaded after admin-ui.js.

(function () {
    const READY_DELAY = 220;

    function getAssistant() {
        return document.querySelector('.sbi-assistant');
    }

    function closeAssistant() {
        const assistant = getAssistant();
        const trigger = assistant?.querySelector('.sbi-assistant__trigger');
        if (!assistant) return;
        assistant.classList.remove('is-open', 'is-notification-mode', 'is-peeking');
        trigger?.setAttribute('aria-expanded', 'false');
    }

    function openAssistant() {
        const assistant = getAssistant();
        const trigger = assistant?.querySelector('.sbi-assistant__trigger');
        if (!assistant) return;
        assistant.classList.add('is-open');
        trigger?.setAttribute('aria-expanded', 'true');
    }

    function syncNotificationState() {
        const assistant = getAssistant();
        const badge = assistant?.querySelector('.sbi-assistant__badge');
        const bellBadge = document.getElementById('bell-badge');
        if (!assistant || !badge || !bellBadge) return;

        const rawValue = bellBadge.textContent?.trim() || '0';
        const numericValue = rawValue === '9+' ? 10 : Number.parseInt(rawValue, 10) || 0;
        const visible = bellBadge.style.display !== 'none' && numericValue > 0;
        const storageKey = 'sbi-assistant-notified-count';
        const storedCount = Number.parseInt(sessionStorage.getItem(storageKey) || '0', 10) || 0;

        badge.textContent = rawValue;
        assistant.classList.toggle('has-notifications', visible);

        if (visible && numericValue > storedCount && document.visibilityState === 'visible') {
            assistant.classList.add('has-new-notification');
            sessionStorage.setItem(storageKey, String(numericValue));
            window.setTimeout(() => assistant.classList.remove('has-new-notification'), 980);
        }
    }

    function moveNotificationsIntoAssistant() {
        const assistant = getAssistant();
        const host = assistant?.querySelector('[data-assistant-notification-host]');
        const notificationsSection = document.getElementById('notifications-section');
        if (!assistant || !host || !notificationsSection || host.contains(notificationsSection)) return;
        host.appendChild(notificationsSection);
    }

    function bindAssistantFixes() {
        const assistant = getAssistant();
        if (!assistant || assistant.dataset.sbiFixBound === 'true') return;
        assistant.dataset.sbiFixBound = 'true';

        assistant.addEventListener('click', (event) => {
            if (event.target.closest('[data-assistant-close]')) {
                event.preventDefault();
                event.stopPropagation();
                closeAssistant();
                return;
            }

            if (event.target.closest('[data-assistant-notifications]')) {
                event.preventDefault();
                event.stopPropagation();
                moveNotificationsIntoAssistant();
                assistant.classList.toggle('is-notification-mode');
                openAssistant();
            }
        }, true);

        const observeBadge = () => {
            const bellBadge = document.getElementById('bell-badge');
            if (!bellBadge) {
                window.setTimeout(observeBadge, 180);
                return;
            }

            const observer = new MutationObserver(syncNotificationState);
            observer.observe(bellBadge, {
                attributes: true,
                childList: true,
                characterData: true,
                subtree: true,
                attributeFilter: ['style']
            });
            syncNotificationState();
        };

        observeBadge();
    }

    function start() {
        window.setTimeout(bindAssistantFixes, READY_DELAY);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
