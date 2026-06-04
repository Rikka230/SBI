/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.315',
  branch: 'refonte-mobile-308-311',
  channel: 'Mobile : assistant (bulle) repositionné en haut à gauche sur les espaces de rôle (plus recouvert par la bottom-nav)',
  stage: 'La bulle « assistant » (bas-droite, z-index 3000) était recouverte par la capsule de la bottom-nav (bas-centre, quasi pleine largeur, z-index 6000) en ≤1024px. Quand la bottom-nav est active (élève/prof/tuteur), l\'assistant est désormais remonté en haut à gauche (son panneau s\'ouvrant vers le bas). CSS-only dans sbi-bottom-nav.css ; aucun changement ≥1025px ni sur l\'admin. Propagation cache : sbi-bottom-nav.css?v=315 → bottom-nav.js → index.js?v=315 dans components.js.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.315 - Mobile : assistant déplacé en haut à gauche (plus caché par la bottom-nav)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
