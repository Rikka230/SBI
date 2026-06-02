/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.282',
  branch: 'main',
  channel: 'Documents de formation (livret/reglement/planning/referentiel + autres)',
  stage: 'nouvelle feature Documents de formation : page admin de gestion (livret d accueil, reglement interieur, planning, referentiel + documents libres) + acces lecture eleve/prof par formation, planning par promotion. Stockage : collection Firestore formationDocuments + Storage formation-documents/, lecture reservee aux membres et ecriture reservee a l admin. Routing PJAX, navigation eleve/prof cables.',
  updatedAt: '2026-06-02',
  label: 'SBI 8.0P.167.282 - Documents de formation : page admin de gestion + lecture eleve/prof par formation, planning par promotion'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
