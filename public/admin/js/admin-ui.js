import { waitForSbiComponents as waitForComponentsReady } from '/admin/js/components/ready.js';
import { initSpaceTheme } from '/admin/js/admin-ui/theme.js?v=8.0P.167.52';
import { initPanelControls, initAdminTabs } from '/admin/js/admin-ui/panels.js';
import { initSafeComponentPolish } from '/admin/js/admin-ui/component-polish.js';
import { initSbiNavigationTransitions } from '/js/sbi-navigation-transitions.js';
import { initSbiAppShell } from '/js/app-shell/app-shell.js?v=8.0P.167.247';
import { initSbiVersionBadge } from '/js/sbi-version-badge.js?v=8.0P.167.302';

/**
 * SBI 8.0P.167.247 - Internal UI bootstrap
 *
 * Avant ce patch, ce point d'entrée chargeait aussi des modules admin lourds sur
 * les pages élève quand on voulait seulement récupérer le shell, le badge et la
 * navigation. Au refresh direct d'une page student, cela pouvait créer un bootstrap
 * hybride : page visible, mais chrome/navigation instable.
 */

function getCurrentPath() {
  try {
    return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin).pathname.toLowerCase();
  } catch (_) {
    return String(window.location.pathname || '').toLowerCase();
  }
}

function getArea() {
  const path = getCurrentPath();
  if (path.startsWith('/admin/')) return 'admin';
  if (path.startsWith('/student/')) return 'student';
  if (path.startsWith('/teacher/')) return 'teacher';
  return 'public';
}

function isStandaloneTeacherLivesPage() {
  const path = getCurrentPath();
  return path === '/teacher/lives.html'
    || path === '/teacher/lives-v2.html'
    || path === '/teacher/lives';
}

async function callOptionalModule(path, exportName) {
  try {
    const module = await import(path);
    const fn = module?.[exportName];
    if (typeof fn === 'function') fn();
  } catch (error) {
    console.warn(`[SBI UI] Module optionnel indisponible : ${path}`, error);
  }
}

async function initAdminOnlyModules() {
  initAdminTabs();

  await callOptionalModule('/admin/js/admin-ui/admin-media-nav.js', 'initAdminMediaNav');
  await callOptionalModule('/admin/js/admin-ui/admin-visitor.js', 'initAdminVisitorShortcut');
  await callOptionalModule('/admin/js/admin-ui/emoji-scrubber.js', 'initEmojiScrubber');
  await callOptionalModule('/js/app-shell/course-viewer-bridge.js', 'installViewerDiagnostics');
  await callOptionalModule('/admin/js/course-access-diagnostics.js', 'initCourseAccessDiagnostics');
  await callOptionalModule('/admin/js/admin-cursus-safe-polish.js?v=8.0P.167.107.6-GPT2.1', 'initAdminCursusSafePolish');
  await callOptionalModule('/admin/js/admin-cursus-dnd.js?v=8.0P.167.199', 'initAdminCursusDndBridge');
  await callOptionalModule('/admin/js/admin-cursus-placeholder-replace.js?v=8.0P.167.188', 'initAdminCursusPlaceholderReplaceBridge');
  await callOptionalModule('/admin/js/admin-cursus-weeks-controls.js?v=8.0P.167.107.1-GPT2.1', 'initAdminCursusWeeksControlsBridge');
  await callOptionalModule('/admin/js/admin-cursus-metrics-persistence.js?v=8.0P.167.108-GPT2.1', 'initAdminCursusMetricsPersistence');
  await callOptionalModule('/admin/js/admin-cursus-tool-filters.js?v=8.0P.167.109-GPT2.1', 'initAdminCursusToolFilters');
  await callOptionalModule('/admin/js/admin-cursus-qa-final.js?v=8.0P.167.110', 'initAdminCursusQaFinal');
  await callOptionalModule('/admin/js/admin-cursus-qualiopi-audit.js?v=8.0P.167.111', 'initAdminCursusQualiopiAudit');
  await callOptionalModule('/admin/js/admin-cursus-qualiopi-evidence-bridge.js?v=8.0P.167.112', 'initAdminCursusQualiopiEvidenceBridge');
  await callOptionalModule('/admin/js/admin-cursus-promotion-sync.js?v=8.0P.167.201', 'initAdminCursusPromotionSync');
  await callOptionalModule('/admin/js/admin-promotions-cursus-selector-fix.js?v=8.0P.167.105.1-GPT2.1', 'initAdminPromotionsCursusSelectorFix');
}

async function initInternalUi() {
  try {
    const area = getArea();
    await waitForComponentsReady();

    initSpaceTheme();
    initSbiNavigationTransitions();
    if (!isStandaloneTeacherLivesPage()) {
      initSbiAppShell();
    }
    initSbiVersionBadge();
    initSafeComponentPolish();
    initPanelControls();

    // Assistant commun aux espaces internes. Le module se limite lui-même
    // aux profils admin / professeur / élève, sans charger les modules lourds admin.
    await callOptionalModule('/admin/js/admin-ui/assistant.js?v=8.0P.167.288', 'initAssistantPrototype');

    if (area === 'admin') {
      await initAdminOnlyModules();
    }
  } catch (error) {
    console.error('[SBI UI] Initialisation partielle après erreur :', error);
    document.body?.classList?.remove('preload');
    document.body?.classList?.add('sbi-preload-timeout');
  } finally {
    window.setTimeout(() => {
      document.body?.classList?.remove('preload');
      document.body?.classList?.add('sbi-preload-timeout');
    }, 120);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInternalUi, { once: true });
} else {
  initInternalUi();
}
