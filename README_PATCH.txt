# SBI 8.0P.167.59 — Promotions UX / affectation depuis profil

Objectif : corriger l’ergonomie de P2I.1 Promotions / Cohortes sans changer le modèle de données ni ouvrir les rules.

Modifications :
- suppression du bloc d’affectation élève par grosse liste déroulante sur la page Promotions ;
- ajout d’un sélecteur de promotion dans le profil élève admin ;
- affectation / retrait promotion depuis la fiche élève via Function serveur `adminUpdateUserAccount` ;
- remplacement du vrac global des élèves par une section `Élèves par promotion` ;
- sélection d’une promotion pour voir uniquement les élèves rattachés ;
- recherche locale nom/email dans la promotion sélectionnée ;
- bouton `Ouvrir profil` depuis la liste des élèves d’une promotion ;
- liste Promotions avec hauteur fixe et scroll interne ;
- icône Promotions distincte de Formations dans le panel gauche ;
- cache-bust PJAX / app-shell / profile-core / components ;
- version centrale : 8.0P.167.59.

Déploiement conseillé :
firebase deploy --only hosting --project sbi-web-4f6b4

Tests :
1. /admin/admin-promotions.html : liste des promotions avec scroll interne.
2. Cliquer `Voir élèves` sur une promotion.
3. Rechercher un élève dans la promotion sélectionnée.
4. Ouvrir un profil élève depuis la liste.
5. Sur profil élève, affecter / retirer une promotion.
6. Vérifier que l’affectation apparaît ensuite dans Comptes, Profil, Journal admin et Élèves par promotion.
7. Vérifier que l’icône Promotions est différente de Formations en panel réduit.
