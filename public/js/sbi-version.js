/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.108-GPT2.1',
  branch: 'main',
  channel: 'P2I.5 CURSUS METRICS PERSISTENCE + GPT2 PRESERVED',
  stage: 'CURSUS DISPLAY/EFFECTIVE WEEKS PERSISTENCE',
  updatedAt: '2026-05-19',
  label: 'SBI 8.0P.167.108-GPT2.1 - CURSUS METRICS PERSISTENCE'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
