/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.43',
  branch: 'main',
  channel: 'FIRST LOGIN ACTIVITY STATE',
  stage: 'CONTACT RESOLVED NO LONGER MASKS DETECTED ACTIVITY',
  updatedAt: '2026-05-16',
  label: 'SBI 8.0P.167.43 - CONTACT RESOLVED NO LONGER MASKS DETECTED ACTIVITY'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
