/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.324',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : (0) DÉBLOCAGE du chargement (cache-bust components.js sur les 17 pages) + (1) nav bottom-nav alignée sur le desktop (PJAX, plus de saut)',
  stage: 'CORRECTIF MAJEUR. (0) Cause de « les changements admin ne se voyaient pas » : chaque page admin chargeait components.js avec un ?v figé/ancien → le mobile gardait l\'ancienne chaîne (components→index→bottom-nav) et .317→.323 ne se chargeaient jamais vraiment. On bump components.js?v=8.0P.167.324 sur les 17 pages admin (HTML no-cache → URL neuve fetchée immédiatement) → toute la chaîne admin se charge enfin. (1) NAV : la bottom-nav admin délègue désormais chaque clic à l\'item de nav DESKTOP équivalent (même data-sbi-href dans #left-panel/#right-panel) via .click() → comportement strictement identique au PC (PJAX fluide, switch d\'onglet en place, plus aucun « saut »). Retrait de la rustine no-pjax/data-bn-tab. Rôles élève/prof/tuteur inchangés ; .323 (carte/dégagement) inchangé, à valider une fois chargé.',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.324 - Admin mobile : déblocage cache (components.js x17) + nav alignée desktop (PJAX)'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
