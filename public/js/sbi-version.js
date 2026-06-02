/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.281',
  branch: 'main',
  channel: 'Suivi pedagogique : scores tous chapitres (checkpoints +10 inclus)',
  stage: 'le suivi pedagogique (profil eleve admin + cote eleve) affiche desormais TOUS les chapitres scores et plus seulement les quiz : checkpoints (+10), textes a trous, devoirs/etudes de cas. Nouveau helper getChapterMaxScore (profile-utils.js) aligne sur cours-viewer. La borne d edition admin utilise ce vrai max (checkpoints inclus) : on peut atteindre la bonne valeur (avant : plafonnee au max quiz seul). Score obtenu lu dans quizScores[chapterId] (alimente pour tous les chapitres scores).',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.281 - suivi pedagogique : scores tous chapitres + checkpoints +10 + plafond admin corrige'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
