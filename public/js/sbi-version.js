/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.250',
  branch: 'main',
  channel: 'AUDIT FIX LOT 2B - RULES SECURITY MEDIUM',
  stage: 'ATTENDANCE SERVER-ONLY WRITE + COURSEBLOCKS LIST SCOPE',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.250 - audit fix lot 2B (firestore rules medium)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
