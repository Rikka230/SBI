/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.288',
  branch: 'main',
  channel: 'Livret apprentissage : correctifs (admin edition, acces prof, planning)',
  stage: 'correctifs Phase A : (A1) l admin peut desormais editer/enregistrer le contrat et toutes les sections (le contrat passait en target meta non autorise -> route en section, cles start/end) ; (A2) le prof voit les livrets de ses formations meme sans promotion (requete par formationId en plus de promotionId, union dedupliquee) ; (A3) planning genere depuis un cursus : message explicite quand le cursus ne contient pas encore d elements planifies (le planning est bien enregistre). Role tuteur (creation de compte) deja corrige. Enrichissement (sections originales + PDF propre) en cours.',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.288 - Livret : correctifs admin edition / acces prof / planning'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
