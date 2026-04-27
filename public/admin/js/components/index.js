import { injectPanelStyles } from './panel-styles.js';
import { registerAdminPanels } from './admin-panels.js';
import { registerStudentPanels } from './student-panels.js';
import { registerTeacherPanels } from './teacher-panels.js';

injectPanelStyles();
registerAdminPanels();
registerStudentPanels();
registerTeacherPanels();

// Le vrai signal public est dispatché par /admin/js/components.js
// après DOMContentLoaded + requestAnimationFrame.
window.__SBI_COMPONENTS_MODULES_LOADED = true;
