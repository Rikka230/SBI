/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.134',
  branch: 'main',
  channel: 'P2I.21 PROFILE FINALIZATION NO JUMP',
  stage: 'MANUAL FINALIZATION SEND WITHOUT PROFILE RELOAD JUMP',
  updatedAt: '2026-05-20',
  label: 'SBI 8.0P.167.134 - Manual finalization action without profile reload jump'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
