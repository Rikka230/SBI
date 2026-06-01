/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.278',
  branch: 'main',
  channel: 'Devoirs & Evaluations (depot eleve + correction prof)',
  stage: 'registre PDF de suivi (ecran eleves en retard) : nouvelle section "Preuves d evaluation Qualiopi" reprenant les devoirs/evaluations marques isQualiopiEvidence de la promotion (ciblage promo ou formation-wide) avec, par eleve evalue, la note, la date de correction et le correcteur. Fenetre ouverte avant le fetch pour eviter le blocage popup.',
  updatedAt: '2026-06-01',
  label: 'SBI 8.0P.167.278 - preuves Qualiopi (devoirs/evals) reprises dans le registre PDF de suivi'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
