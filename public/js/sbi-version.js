/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.286',
  branch: 'main',
  channel: 'Planning : fusion dates (promotion) + noms (cursus)',
  stage: 'le planning genere combine desormais les VRAIES dates du plan de la promotion ET les noms reels issus du cursus : sur un plan date de promotion, les noms manquants/generiques (lives, devoirs...) sont enrichis depuis les items du cursus (cours matches par courseId, autres types par ordre du meme type). Resout : promotion = dates mais pas de noms / cursus = noms mais pas de dates. Module /js/formation-documents/planning-render.js (resolvePlanningModel + enrichRowNamesFromCursus). Export PDF inchange.',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.286 - Planning : fusion dates promotion + noms cursus (lives inclus)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
