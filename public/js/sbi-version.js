/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.117',
  branch: 'main',
  channel: 'P2I.7.1 STUDENT NOTICE DEVICE RECOMMENDATION',
  stage: 'STUDENT NOTICE PC RECOMMENDED MOBILE TEMPORARILY AVOIDED',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.117 - STUDENT NOTICE DEVICE RECOMMENDATION'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
