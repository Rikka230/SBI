SBI 8.0P.167.63 — Correctif profil admin PJAX

Objet : corriger le blocage du profil admin après navigation PJAX depuis Comptes / Promotions.

Cause réelle :
- public/js/profile/profile-render.js contenait deux const promotionStatus dans le même scope.
- Le module ES échouait au parsing : SyntaxError: Identifier 'promotionStatus' has already been declared.
- profile-core ne pouvait donc pas importer le renderer profil.
- Le routeur PJAX affichait le DOM profil puis le montage échouait, donnant l'impression d'un rechargement / disparition du shell.

Corrections :
- renommage des variables promotionStatusValue / promotionStatusEl.
- cache-bust complet de la chaîne admin-ui -> app-shell -> route-registry -> profile-core -> profile-render.
- verrouillage UID profil admin conservé / renforcé.
- pas de hard reload forcé si montage profil échoue.
- navigation Profil depuis Comptes et Promotions conserve l'UID cible.

Déploiement : hosting uniquement.
