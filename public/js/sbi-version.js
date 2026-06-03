/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.294',
  branch: 'main',
  channel: 'Livret apprentissage : fix dossier PDF (Chromium) + annexes auto hybride',
  stage: 'FIX bloquant : @sparticuz/chromium v149 expose son API sur .default -> require(...).default (sinon chromium.executablePath crashait a chaque appel -> fallback impression sans sommaire ni annexes). Le sommaire pagine (paged.js) fonctionne desormais. ANNEXES en mode HYBRIDE : les documents institutionnels PDF de la formation visibles par l eleve (reglement, referentiel, planning, livret accueil) sont joints AUTOMATIQUEMENT (sauf decochage), les documents "autre" seulement si coches. Portee par promotion + visibilite par role. Fallback formationId via eleve/promotion. UI admin : libelle de la case adapte (joint par defaut vs opt-in).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.294 - Livret : fix dossier PDF (Chromium .default) + annexes auto hybride'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
