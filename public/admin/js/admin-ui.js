import { waitForSbiComponents as waitForComponentsReady } from '/admin/js/components/ready.js';
import { initSpaceTheme } from '/admin/js/admin-ui/theme.js?v=8.0P.167.52';
import { initPanelControls, initAdminTabs } from '/admin/js/admin-ui/panels.js';
import { initAdminMediaNav } from '/admin/js/admin-ui/admin-media-nav.js';
import { initAssistantPrototype } from '/admin/js/admin-ui/assistant.js';
import { initAdminVisitorShortcut } from '/admin/js/admin-ui/admin-visitor.js';
import { initEmojiScrubber } from '/admin/js/admin-ui/emoji-scrubber.js';
import { initSafeComponentPolish } from '/admin/js/admin-ui/component-polish.js';
import { initSbiNavigationTransitions } from '/js/sbi-navigation-transitions.js';
import { initSbiAppShell } from '/js/app-shell/app-shell.js?v=8.0P.167.188';
import { initSbiVersionBadge } from '/js/sbi-version-badge.js';
import { installViewerDiagnostics } from '/js/app-shell/course-viewer-bridge.js';
import { initCourseAccessDiagnostics } from '/admin/js/course-access-diagnostics.js';
import { initAdminCursusSafePolish } from '/admin/js/admin-cursus-safe-polish.js?v=8.0P.167.107.6-GPT2.1';
import { initAdminCursusDndBridge } from '/admin/js/admin-cursus-dnd.js?v=8.0P.167.199';
import { initAdminCursusPlaceholderReplaceBridge } from '/admin/js/admin-cursus-placeholder-replace.js?v=8.0P.167.188';
import { initAdminCursusWeeksControlsBridge } from '/admin/js/admin-cursus-weeks-controls.js?v=8.0P.167.107.1-GPT2.1';
import { initAdminCursusMetricsPersistence } from '/admin/js/admin-cursus-metrics-persistence.js?v=8.0P.167.108-GPT2.1';
import { initAdminCursusToolFilters } from '/admin/js/admin-cursus-tool-filters.js?v=8.0P.167.109-GPT2.1';
import { initAdminCursusQaFinal } from '/admin/js/admin-cursus-qa-final.js?v=8.0P.167.110';
import { initAdminCursusQualiopiAudit } from '/admin/js/admin-cursus-qualiopi-audit.js?v=8.0P.167.111';
import { initAdminCursusQualiopiEvidenceBridge } from '/admin/js/admin-cursus-qualiopi-evidence-bridge.js?v=8.0P.167.112';
import { initAdminCursusPromotionSync } from '/admin/js/admin-cursus-promotion-sync.js?v=8.0P.167.201';
import { initAdminPromotionsCursusSelectorFix } from '/admin/js/admin-promotions-cursus-selector-fix.js?v=8.0P.167.105.1-GPT2.1';

/**
 * =======================================================================
 * ADMIN UI - Point d'entrée modulaire
 * =======================================================================
 *
 * 6.8 : admin-ui.js ne porte plus la logique complète.
 * Il orchestre uniquement les modules UI sûrs.
 * 8.0M : diagnostics viewer installés sans activer le viewer en PJAX.
 */

async function initAdminUi() {
    try {
        await waitForComponentsReady();

        initSpaceTheme();
        initSbiNavigationTransitions();
        initSbiAppShell();
        initSbiVersionBadge();
        installViewerDiagnostics();
        initCourseAccessDiagnostics();
        initAdminMediaNav();
        initAssistantPrototype();
        initAdminVisitorShortcut();
        initEmojiScrubber();
        initSafeComponentPolish();
        initAdminCursusSafePolish();
        initAdminCursusDndBridge();
        initAdminCursusPlaceholderReplaceBridge();
        initAdminCursusWeeksControlsBridge();
        initAdminCursusMetricsPersistence();
        initAdminCursusToolFilters();
        initAdminCursusQaFinal();
        initAdminCursusQualiopiAudit();
        initAdminCursusQualiopiEvidenceBridge();
        initAdminCursusPromotionSync();
        initAdminPromotionsCursusSelectorFix();
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
