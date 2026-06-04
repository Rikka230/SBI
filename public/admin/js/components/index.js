import { injectPanelStyles } from './panel-styles.js';
import { registerAdminPanels } from './admin-panels.js?v=8.0P.167.305';
// Phase 1b : student/teacher/tutor convergés derrière un shell unique piloté par
// le manifeste (remplace student-panels.js / teacher-panels.js / tutor-panels.js).
import { registerRoleShell } from './shell.js?v=8.0P.167.311';
import { registerBottomNav } from './bottom-nav.js?v=8.0P.167.321';
export { waitForExpectedComponents, waitForSbiComponents, waitForSbiTopbar } from './ready.js';

injectPanelStyles();
registerAdminPanels();
registerRoleShell();
registerBottomNav();

window.__SBI_COMPONENTS_MODULES_LOADED = true;
window.dispatchEvent(new CustomEvent('sbi:components-modules-loaded'));
