/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.328',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : scroll naturel des pages (≤1024px) — fin du « hors cadre » Dashboard + dégagement sous la capsule',
  stage: 'Le Sceau de version (.327) fait son office : ce patch CSS atteint l\'appareil SANS ré-éditer les 17 pages (preuve du sceau). Correctif scroll : l\'admin desktop est en « single scroll » (html/body/.app-container/#main-content en 100dvh + overflow:hidden, seul #main-content scrolle en interne). Sur mobile, .app-container { height:100dvh; overflow:hidden } clippait le contenu à un écran → Dashboard « hors cadre », impossible de défiler, et dernière ligne sous la barre. Fix (admin-responsive.css, ≤1024px + body.sbi-bottom-nav-active) : rebascule en SCROLL DE DOCUMENT naturel (html/body/.app-container/#main-content en height:auto + overflow visible/auto) + dégagement padding-bottom pour la capsule + listes (#users-list-container) qui s\'étendent au lieu de scroller en interne. Desktop ≥1025px strictement inchangé. La carte Comptes reste à optimiser visuellement (Candidat C).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.328 - Admin mobile : scroll naturel des pages (≤1024px) + dégagement capsule'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
