/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.306',
  branch: 'main',
  channel: 'Mobile : bottom-nav flottante (espaces élève/prof/tuteur, ≤1024px)',
  stage: 'Phase 1 du shell mobile : barre de navigation flottante en bas d écran (capsule translucide, indicateur coulissant recoloré par --space-accent, cibles ≥44px, safe-area, prefers-reduced-motion) pour les espaces élève/prof/tuteur en ≤1024px. Additive : sur ≤1024px le panneau latéral et son hamburger sont masqués pour ces 3 rôles, la bottom-nav prend le relais ; ≥1025px = panneau latéral inchangé ; admin jamais touché. Onglets directs = les `primary` du manifeste (nav-manifest.js, même ordre que les panneaux PC) ; le reste + Déconnexion vont dans la feuille « Plus ». Sync de l onglet actif sur les navigations PJAX.',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.306 - Bottom-nav flottante mobile (élève/prof/tuteur, ≤1024px)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
