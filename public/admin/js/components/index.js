import { injectPanelStyles } from './panel-styles.js';
import { registerAdminPanels } from './admin-panels.js';
import { registerStudentPanels } from './student-panels.js';
import { registerTeacherPanels } from './teacher-panels.js';

injectPanelStyles();
registerAdminPanels();
registerStudentPanels();
registerTeacherPanels();

window.__SBI_COMPONENTS_READY = true;
