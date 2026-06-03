/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.292',
  branch: 'main',
  channel: 'Livret apprentissage : Phase B + correctifs (vague 2 multi-agents)',
  stage: 'Correctifs critiques : (1) fix 500 validation/verrou periode (serverTimestamp interdit dans un array -> Timestamp.now()) ; (2) edition admin enfin fonctionnelle (fieldHtml evaluait le droit sur la cle de champ au lieu du nom de section -> tout etait en lecture seule) ; (3) acces prof aux livrets par formationId (la requete par promotionId etait toujours refusee). Phase B vague 2 : PDF (livret + planning) impression couleurs forcees (print-color-adjust:exact) ; PDF planning brande comme le livret ; la section planning du livret recupere le planning de Documents de formation (resolveBookletPlanningModel) ; editeur ABSENCES admin (centre + structure, justificatif/validation).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.292 - Livret : fix validation/edition admin/prof + PDF couleurs impression + planning branding + absences admin'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
