/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.252',
  branch: 'main',
  channel: 'FIX F5 LIVE PROF (THEME STANDALONE) + REPLAY VERSION SYNC',
  stage: 'initSpaceTheme dans boot standalone lives.html/lives-v2.html + bump replay .229->.252',
  updatedAt: '2026-05-30',
  label: 'SBI 8.0P.167.252 - fix F5 live prof theme + replay version sync'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
