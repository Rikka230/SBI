/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.291',
  branch: 'main',
  channel: 'Livret apprentissage : Phase B + correctifs multi-agents',
  stage: 'Phase B : PDF brande comme les emails SBI (bleu #0051ff, logo/wordmark, page de garde) + sauts de page corriges ; synchro miroir top-level cote serveur (l admin edite identite/etablissement/employeur/maitre d apprentissage et ca persiste apres reload) ; le tuteur ajoute des absences en entreprise (avec/sans justificatif) et accede aux documents de formation (/tutor/documents) ; planning cible re-affiche apres reload (auto-selection de la promo ayant un planning) ; plannings visibles cote prof/eleve (curriculumTemplates lisible par utilisateur actif, getDoc resilient) ; fix ecriture absences imbriquees (set merge + cle pointee).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.291 - Livret Phase B : PDF brande, edition admin persistante, absences/docs tuteur, planning prof/eleve'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
