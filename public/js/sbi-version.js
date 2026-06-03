/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.300',
  branch: 'main',
  channel: 'Espace tuteur : badge/theme aligne (sbi-tutor-space) + recherche apprenti isolee',
  stage: 'FIX tuteur : (1) theme.js ajoute enfin la classe body.sbi-tutor-space (absente -> --space-accent retombait en bleu : badge version, bordures, niveau non alignes au lime) + tutor.css force l accent lime en !important sur cette classe ; (2) la recherche tuteur n est plus captee par le global-search partage (renommee .tutor-apprentice-search/.tutor-apprentice-results) -> elle ouvre UNIQUEMENT le livret d un apprenti lie, plus le profil eleve.',
  updatedAt: '2026-06-03',
  label: 'SBI 8.0P.167.300 - Espace tuteur : badge/theme lime aligne + recherche apprenti (livret) isolee du global-search'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
