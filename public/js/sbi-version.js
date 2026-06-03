/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.307',
  branch: 'main',
  channel: 'Mobile : correctifs QA bottom-nav + badge version + profil responsive',
  stage: 'Suite QA mobile : (1) badge de version simplifié en haut à gauche (juste le numéro, lettres grises « gravées », sans cadre) en ≤1024px ; (2) feuille « Plus » réparée (elle restait display:none — re-affichée dans la media-query) ; (3) indicateur d onglet actif corrigé (mesuré avant application du CSS chargé en async → ResizeObserver + garde hors-écran) ; (4) page profil élève + prof rendue responsive (grille 1.2fr/2fr inline → classe .profile-grid qui passe en 1 colonne ≤1024px, header centré, sous-onglets repliables).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.307 - QA mobile : bottom-nav (Plus + indicateur), badge version, profil responsive'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
