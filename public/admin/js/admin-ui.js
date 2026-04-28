import { waitForSbiComponents as waitForComponentsReady } from '/admin/js/components/ready.js';
import { initSpaceTheme } from '/admin/js/admin-ui/theme.js';
import { initPanelControls, initAdminTabs } from '/admin/js/admin-ui/panels.js';
import { initAdminMediaNav } from '/admin/js/admin-ui/admin-media-nav.js';
import { initAssistantPrototype } from '/admin/js/admin-ui/assistant.js';
import { initAdminVisitorShortcut } from '/admin/js/admin-ui/admin-visitor.js';
import { initEmojiScrubber } from '/admin/js/admin-ui/emoji-scrubber.js';
import { initSafeComponentPolish } from '/admin/js/admin-ui/component-polish.js';
import { initSbiNavigationTransitions } from '/js/sbi-navigation-transitions.js';
import { initSbiAppShell } from '/js/app-shell/app-shell.js';
import { initSbiVersionBadge } from '/js/sbi-version-badge.js';

/**
 * =======================================================================
 * ADMIN UI - Point d'entrée modulaire
 * =======================================================================
 *
 * 6.8 : admin-ui.js ne porte plus la logique complète.
 * Il orchestre uniquement les modules UI sûrs.
 */

async function initAdminUi() {
    try {
        await waitForComponentsReady();

        initSpaceTheme();
        initSbiNavigationTransitions();
        initSbiAppShell();
        initSbiVersionBadge();
        initAdminMediaNav();
        initAssistantPrototype();
        initAdminVisitorShortcut();
        initEmojiScrubber();
        initSafeComponentPolish();
        initPanelControls();
        initAdminTabs();
    } catch (error) {
        console.error('[SBI UI] Initialisation partielle après erreur :', error);
        document.body.classList.remove('preload');
        document.body.classList.add('sbi-preload-timeout');
    } finally {
        window.setTimeout(() => {
            document.body.classList.remove('preload');
            document.body.classList.add('sbi-preload-timeout');
        }, 120);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminUi);
} else {
    initAdminUi();
}
