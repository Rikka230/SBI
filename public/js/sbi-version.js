/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.241',
  branch: 'main',
  channel: 'LIVE TEST OPEN FLOW',
  stage: 'LIVE TEST OPEN NOW AND TEACHER LIVE F5 HARDENING',
  updatedAt: '2026-05-29',
  label: 'SBI 8.0P.167.241 - live test open now and teacher lives f5 hardening'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
