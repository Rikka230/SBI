/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.259',
  branch: 'main',
  channel: 'LIVE - FIX F5 ECRAN VIDE PAGES ADMIN-LIVES (REVEAL)',
  stage: 'admin-lives(.v2).html: ajout style+script de reveal (preload/visibilite) comme teacher/lives.html',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.259 - fix admin-lives F5 blank (reveal)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
