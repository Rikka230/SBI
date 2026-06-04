/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.309',
  branch: 'refonte-mobile-308-311',
  channel: 'Refonte mobile (B) : visualiseuse de cours responsive (sidebar empilée ≤1024px + garde-fous contenu)',
  stage: 'Workstream B de la refonte mobile : la visualiseuse de cours (élève + prof) empile la sidebar chapitres dès la tablette (≤1024px au lieu de 860px, fini les 340px latéraux qui mangeaient l\'écran), ajoute des garde-fous pour le contenu utilisateur Quill (tables/code/iframes scrollables, plus de débordement horizontal), cadre les embeds legacy en 16:9, fait retourner à la ligne les blancs « fill-in », et compacte les onglets de chapitres ≤480px. CSS-only (viewer.css + sbi-7-1-harmonization.css).',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.309 - Mobile : visualiseuse de cours responsive (sidebar empilée + contenu sans débordement)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
