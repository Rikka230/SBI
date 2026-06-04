/**
 * SBI - Version centralisée
 *
 * À mettre à jour à chaque patch livré pour savoir immédiatement
 * quelle build est affichée dans la preview Firebase.
 */

export const SBI_VERSION = {
  version: '8.0P.167.330',
  branch: 'adapt-admin-mobile',
  channel: 'Admin mobile : fin du conflit de double livraison CSS (retrait des <link> admin-responsive.css statiques périmés) — la carte Comptes prend enfin la bonne largeur',
  stage: 'Diagnostic « encore plus large » : double livraison CSS (Candidat B) qui mord. Les 6 pages de consultation avaient un <link admin-responsive.css?v=325> STATIQUE ; cette URL ?v=325 était l\'ancienne mise en cache navigateur (grid 1fr 1fr, large), et après une nav PJAX ensureDocumentStyles la ré-ajoutait EN DERNIER → elle gagnait la cascade sur l\'injection fraîche ?v=329 (minmax) → carte plus large. Le <link> statique avait été ajouté en .326 car l\'injection JS n\'était PAS fiable à l\'époque (pré-sceau, components.js caché) ; le Sceau de version (.327) rend désormais l\'injection fiable → le backup statique est devenu une source périmée nuisible. Fix : retrait des 6 <link> statiques ; admin-responsive.css n\'a plus qu\'UNE source, injectée et versionnée par le sceau (bottom-nav.js, ?v=V). Plus de conflit, plus de cache périmé. (Convergence A→B : le sceau fiabilise l\'injection, ce qui permet de supprimer le doublon statique.)',
  updatedAt: '2026-06-04',
  label: 'SBI 8.0P.167.330 - Admin mobile : source CSS unique (retrait <link> statiques périmés) — largeur carte Comptes corrigée'
};

export function getSbiVersionLabel() {
  return SBI_VERSION.label;
}
