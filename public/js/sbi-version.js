/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.198',
  branch: 'main',
  channel: 'COURSE EDITOR V2 ACTIVITIES',
  stage: 'AUTONOMOUS CORRECTION CHECKPOINT XP TIMER',
  updatedAt: '2026-05-24',
  label: 'SBI 8.0P.167.198 - viewer self assessment correction button'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
