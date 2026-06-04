import { injectPanelStyles } from './panel-styles.js';
import { SBI_VERSION } from '/js/sbi-version.js';
export { waitForExpectedComponents, waitForSbiComponents, waitForSbiTopbar } from './ready.js';

// Sceau de version (A2) — un seul bump de sbi-version.js rafraîchit toute la colonne
// de composants (admin-panels / shell / bottom-nav). Les imports passent en DYNAMIQUE
// pour porter ?v=V : un import statique ne peut pas interpoler une variable.
// Phase 1b : student/teacher/tutor convergés derrière le shell unique (shell.js)
// piloté par le manifeste (remplace student-panels.js / teacher-panels.js / tutor-panels.js).
const V = SBI_VERSION.version;
const wv = (path) => `${path}?v=${V}`;

injectPanelStyles();

const [{ registerAdminPanels }, { registerRoleShell }, { registerBottomNav }] = await Promise.all([
  import(wv('./admin-panels.js')),
  import(wv('./shell.js')),
  import(wv('./bottom-nav.js')),
]);

registerAdminPanels();
registerRoleShell();
registerBottomNav();

window.__SBI_COMPONENTS_MODULES_LOADED = true;
window.dispatchEvent(new CustomEvent('sbi:components-modules-loaded'));
