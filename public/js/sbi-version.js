/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.311',
  branch: 'refonte-mobile-308-311',
  channel: 'Refonte mobile (D) / Phase 1b : shell desktop unifié (student/teacher/tutor) piloté par le manifeste',
  stage: 'Workstream D / Phase 1b : convergence des panneaux PC. Un module unique shell.js (Profil de rôle + manifeste de navigation, déjà source de la bottom-nav) rend le panneau latéral et la top-bar des 3 espaces, enregistré sous les tags existants (aucune page HTML modifiée). Les 3 modules dupliqués student-panels.js / teacher-panels.js / tutor-panels.js sont SUPPRIMÉS (deletion test passée). Sortie desktop identique (mêmes classes/ids/styles), recherche d\'apprenti tuteur préservée (imports Firebase/booklet à la demande), admin et bottom-nav inchangés.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.311 - Phase 1b : shell desktop unifié (manifeste) + suppression des 3 panels dupliqués'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
