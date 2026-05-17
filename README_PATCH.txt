SBI 8.0P.167.58 / P2I.1 — Promotions & cohortes

Base attendue avant application : SBI 8.0P.167.57 validé.

Objectif :
- ajouter une page admin dédiée /admin/admin-promotions.html ;
- créer / modifier / archiver des promotions ;
- associer un élève à une promotion via la Function adminUpdateUserAccount ;
- afficher la promotion dans Comptes & accès et dans la fiche profil admin ;
- garder le LMS / cursus / checkpoints hors périmètre pour cette brique.

Fichiers modifiés / ajoutés :
- firestore.rules
- public/functions/index.js
- public/admin/admin-promotions.html
- public/admin/css/admin-promotions.css
- public/admin/js/admin-promotions.js
- public/admin/js/components/admin-panels.js
- public/admin/js/components/index.js
- public/admin/js/components.js
- public/admin/js/admin-ui.js
- public/admin/js/admin-core.js
- public/admin/js/admin-accounts-dashboard.js
- public/admin/js/admin-global-audit-log.js
- public/admin/admin-accounts.html
- public/admin/admin-audit-log.html
- public/admin/admin-profile.html
- public/admin/formations-cours.html
- public/admin/index.html
- public/admin/site-index-settings.html
- public/js/app-shell/app-shell.js
- public/js/app-shell/route-registry.js
- public/js/profile-core.js
- public/js/profile/profile-render.js
- public/js/sbi-version.js
- public/student/mon-profil.html
- public/teacher/mon-profil.html

Déploiement requis :
- hosting : nouvelle page + JS/CSS + cache-bust ;
- functions : adminUpdateUserAccount accepte promotionId ;
- firestore rules : nouvelle collection promotions.

Commande recommandée :
firebase deploy --only hosting,functions,firestore:rules --project sbi-web-4f6b4

Tests prioritaires :
1. /admin/admin-promotions.html direct.
2. Navigation PJAX Admin → Promotions → Comptes → Profil → Promotions.
3. Créer une promotion active.
4. Modifier dates / formation liée / statut.
5. Archiver puis réactiver une promotion.
6. Affecter un élève à une promotion.
7. Vérifier la promotion dans /admin/admin-accounts.html.
8. Ouvrir le profil élève et vérifier le bloc Promotion.
9. Vérifier le journal admin : type account.promotion_updated.
10. Vérifier que les comptes admin/prof ne peuvent pas être affectés comme élève.

Non inclus volontairement :
- cursus ;
- checkpoints ;
- progression ;
- documents élèves ;
- notifications promotion ;
- suppression définitive de promotion.
