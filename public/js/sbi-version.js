/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.293',
  branch: 'main',
  channel: 'Livret apprentissage : dossier PDF fusionne (Cloud Function Puppeteer + pdf-lib)',
  stage: 'DOSSIER PDF complet : nouvelle Cloud Function buildApprenticeshipBookletPdf (Puppeteer + paged.js + pdf-lib, memoire 2GiB) qui rend le corps du livret en PDF (sommaire a numeros de pages REELS, 2 passes paged.js), fusionne les ANNEXES PDF de la formation (documents marques includeInApprenticeshipBooklet, ordre/titre/visibilite/version), et retourne une URL signee V4. Annexes filtrees par role (admin/prof/eleve/tuteur). Annexe manquante = note "Document non joint" (non bloquant). UI admin Documents de formation : bloc "Annexe livret" (case + titre sommaire + ordre + visibilite + version). 4 pages cablees : bouton "Telecharger le dossier (PDF)", admin a aussi "Livret seul". Fallback impression navigateur si la CF echoue. Pas de about:blank / en-tete navigateur (displayHeaderFooter:false, printBackground, A4).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.293 - Livret : dossier PDF fusionne (corps + sommaire pagine + annexes formation)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
