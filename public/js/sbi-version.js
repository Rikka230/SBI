/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.138',
  branch: 'main',
  channel: 'P2I.26 LIBRARY PROMOTION ACCESS FIX',
  stage: 'PROMOTION PLANNING READ ACCESS + VIEWER RETURN + STUDENT COURSE SECTIONS',
  updatedAt: '2026-05-21',
  label: 'SBI 8.0P.167.138 - Library promotion planning access and viewer returns'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
