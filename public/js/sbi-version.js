/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.174',
  branch: 'main',
  channel: 'P2J.3D COURSE EDITOR V2 POLISH PATCH',
  stage: 'EDITOR V2 DOCKED BANK NO LEGACY AND SBI DIALOGS',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.174 - Course editor V2 docked bank no legacy and SBI dialogs'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
