/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.316',
  branch: 'refonte-mobile-308-311',
  channel: 'Refonte lecture mobile de la visualiseuse : plein écran + capsule flottante « ‹ Préc · ☰ Sommaire · Suiv › »',
  stage: 'Visualiseuse de cours (élève + prof) repensée en ≤1024px : le chapitre s\'affiche en PLEIN ÉCRAN (fini la liste de chapitres empilée qui mangeait l\'écran). La navigation passe dans une capsule flottante (langage visuel de la bottom-nav) « ‹ Préc · ☰ Sommaire · Suiv › » : Préc/Suiv sautent entre chapitres déverrouillés (Suiv grisé si verrouillé), « Sommaire » ouvre une feuille coulissante = la sidebar existante réutilisée (mêmes onglets ✓/🔒/quiz, onclick→loadChapter). La validation/progression reste via le bouton « Suivant » du contenu. CSS (viewer.css + harmonization) + câblage cours-viewer.js (ensureViewerBar/updateViewerBar/isNextChapterUnlocked). Desktop ≥1025px inchangé.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.316 - Mobile : visualiseuse plein écran + capsule flottante Préc/Sommaire/Suiv'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
