/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.285',
  branch: 'main',
  channel: 'Planning depuis cursus : correction du nom des lives (et items non-cours)',
  stage: 'le planning d une formation peut etre genere EN DIRECT depuis un cursus (curriculumTemplates) : cote admin on selectionne un cursus (par defaut formation ou par promotion) au lieu d uploader un PDF ; cote eleve/prof le planning s affiche en tableau dynamique (planning DATE de la promotion sinon cursus template, semaines indicatives) avec un bouton Telecharger en PDF (fenetre d impression, comme le registre Qualiopi). Nouveau module /js/formation-documents/planning-render.js. Acces eleve toujours via le coffre du profil.',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.284 - Documents de formation : planning genere depuis un cursus (vue dynamique + export PDF)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
