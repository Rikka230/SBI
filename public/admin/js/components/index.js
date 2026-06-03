import { injectPanelStyles } from './panel-styles.js';
import { registerAdminPanels } from './admin-panels.js?v=8.0P.167.243';
import { registerStudentPanels } from './student-panels.js';
import { registerTeacherPanels } from './teacher-panels.js?v=8.0P.167.243';
import { registerTutorPanels } from './tutor-panels.js?v=8.0P.167.293';
export { waitForExpectedComponents, waitForSbiComponents, waitForSbiTopbar } from './ready.js';

injectPanelStyles();
registerAdminPanels();
registerStudentPanels();
registerTeacherPanels();
registerTutorPanels();

window.__SBI_COMPONENTS_MODULES_LOADED = true;
window.dispatchEvent(new CustomEvent('sbi:components-modules-loaded'));
