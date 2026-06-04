/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.327',
  branch: 'adapt-admin-mobile',
  channel: 'Sceau de version (Candidat A) : cache-bust piloté par CETTE constante pour toute la colonne d\'amorçage admin',
  stage: 'Deepening « Sceau de version » (admin, Phase 1). L\'amorce components.js et sbi-version.js passent no-cache (firebase.json) ; les 17 pages admin chargent components.js SANS ?v= ; components.js lit la version ici et l\'appose à toute la chaîne via withVersion() ; index.js importe {admin-panels, shell, bottom-nav} en dynamique versionné, et bottom-nav/shell versionnent nav-manifest + le CSS injecté depuis V. Résultat : un seul bump de cette constante rafraîchit toute la chaîne admin, SANS ré-éditer les pages (fin des bugs « rien n\'a changé »). Garde-fou : scripts/check-version-seal.mjs (npm check:version-seal + pre-commit via core.hooksPath=.githooks). Tokens feuilles profonds (sbi-permissions, account-completeness…) hors périmètre passe 1 (auto-cicatrisent en ≤max-age car l\'entrée ne gèle plus rien). PREUVE attendue : ce bump .327, sans toucher aux 17 pages, doit suffire à charger la chaîne fraîche en navigation privée.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.327 - Admin : Sceau de version (cache-bust depuis sbi-version.js, entrée no-cache tokenless)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
