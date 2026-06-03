/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.298',
  branch: 'main',
  channel: 'Livret apprentissage : sommaire fiable + corrections PDF (QA)',
  stage: 'QA dossier PDF : (1) sommaire FIABLE -> @page au niveau racine pour paged.js + impression 1:1 (A4 explicite, marge 0, sans preferCSSPageSize) sinon Chromium re-paginait et scindait les pages (numeros faux apres le planning) + log de controle pagination ; (2) entites HTML decodees dans le sommaire (Livret d apprentissage, Signatures & validation) ; (3) doublon "Lieu / contexte" corrige -> "Contexte" + "Lieu" ; (4) chaque periode demarre sur une nouvelle page, signatures gardees avec leur periode (page-break-before + break-inside avoid) ; (6) table planning : cellules bordees + padding (fin du collage "ExamenEvaluation"). RESTE : (5) densite planning / placeholders "Cours futur", (7) fiche referentiel RNCP propre.',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.298 - Livret PDF : sommaire fiable + decodage HTML + doublon Lieu/contexte + sauts de page periodes'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
