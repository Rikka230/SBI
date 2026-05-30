/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.256',
  branch: 'main',
  channel: 'LIVE - ANNULATION ADMIN (SUPPRESSION REPLAY + RETOUR A VENIR)',
  stage: 'cancelLiveReplay admin-only (delete recordings Daily + reset scheduled) + bouton scheduler v2 admin',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.256 - admin cancel live + delete replay'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
