/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.302',
  branch: 'main',
  channel: 'Badge version : affiche aussi cote tuteur (/tutor/ ajoute au whitelist)',
  stage: 'FIX badge tuteur : shouldShowVersionBadge() ne listait que /admin//student//teacher/ -> le badge dynamique #sbi-version-badge ne s affichait PAS sur /tutor/ (seul l ancien ::after 6.2-bis, retire en .301, etait visible -> badge disparu). Ajout de /tutor/ au whitelist + bump du ?v d import de sbi-version-badge.js (.247 fige). Le vrai badge de version s affiche desormais cote tuteur (lime via sbi-tutor-space).',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.302 - Badge version affiche cote tuteur (whitelist /tutor/) + lime'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
