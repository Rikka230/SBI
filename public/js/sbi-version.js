/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.168',
  branch: 'main',
  channel: 'P2J.3B COURSE EDITOR V2 CONTROLLED BRIDGE',
  stage: 'TEACHER LIBRARY V2 ENTRY BRIDGE',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.168 - Course editor V2 controlled bridge'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
