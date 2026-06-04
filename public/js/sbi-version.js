/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.314',
  branch: 'refonte-mobile-308-311',
  channel: 'Panneau d\'info étudiant (« site en construction ») retiré à la demande client',
  stage: 'Le panneau d\'information étudiant post-connexion (« site en construction », conseils ordinateur/mobile) est désactivé : il ne s\'affiche plus jamais après connexion (garde unique posée dans maybeRenderStudentConstructionNotice). Le gate de première connexion (cases à cocher obligatoires) reste actif. renderStudentConstructionNotice conservée mais inutilisée (réactivation possible). Propagation cache : first-login-gate.js?v=8.0P.167.314 dans tracker.js + tracker.js?v=8.0P.167.314 sur les 32 pages.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.314 - Retrait du panneau d\'info étudiant post-connexion (site en construction)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
