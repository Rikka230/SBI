/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.176',
  branch: 'main',
  channel: 'P2J.3D COURSE EDITOR V2 CLEANUP PATCH',
  stage: 'EDITOR V2 DOCKED BANK CLEANUP AND NAVIGATION FIX',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.176 - Course editor V2 cleanup docked bank and navigation fix'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
