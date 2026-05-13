SBI 8.0P.144 / P2F.2
======================

Base attendue : branche private-admin-accounts-mail-workflow validée jusqu'à P2E.4, avec P2F.1 validé.

Contenu du patch :
- storage.rules
- public/functions/index.js
- public/calculateur.html
- public/js/sbi-aide-calculator.js
- public/js/sbi-version.js

Changements :
1. Reprise de P2F.1 validé : durcissement Storage des médias de cours.
2. Page calculateur : ajout de l'astérisque sur le reste à charge mensuel / total.
3. Page calculateur : ajout de la mention “* Hors charges si applicable.”.
4. Message de transfert d'estimation : ajout de la mention hors charges.
5. Functions : remplacement de l'URL reset password Firebase provisoire par le domaine final :
   https://www.sbigroup.fr/password-reset.html
6. Version bump : 8.0P.144.

Déploiement conseillé :
1. firebase deploy --only functions,storage --project sbi-web-4f6b4
2. firebase hosting:channel:deploy admin-mail-workflow --project sbi-web-4f6b4 --expires 7d

Avant migration domaine finale :
- Ajouter/valider www.sbigroup.fr dans Firebase Auth > Authorized domains.
- Vérifier que /password-reset.html est bien servi sur le domaine final.
- Tester création compte + bouton “Définir mon mot de passe”.
- Tester la page calculateur sur preview puis sur domaine final.
