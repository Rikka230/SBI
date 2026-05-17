SBI 8.0P.167.64 - PROFILE PROMOTION PICKER UX

Objectif :
- Sortir l'affectation promotion du Journal du compte.
- Ajouter un bloc Promotion visible dans la colonne gauche du profil eleve.
- Remplacer la liste deroulante de promotions par un picker searchable avec filtres.

Modifications :
- Bloc Promotion dans la sidebar profil eleve admin.
- Boutons Modifier / Retirer sur la promotion actuelle.
- Modal de selection avec recherche texte, filtre formation, filtre statut.
- Resultats en cartes compactes avec bouton Assigner.
- Le Journal du compte garde uniquement les actions compte / logs / relances.
- Cache-bust admin/PJAX/profile en 8.0P.167.64.

Non touche :
- Firebase Functions.
- Firestore rules.
- Storage rules.
- Schema de donnees.

Tests :
1. Ouvrir /admin/admin-accounts.html.
2. Profil d'un eleve.
3. Verifier le bloc Promotion dans la colonne gauche.
4. Modifier : rechercher une promotion et l'assigner.
5. Retirer la promotion.
6. Retour Comptes puis retour Profil.
7. Verifier absence d'erreur console profile-render/profile-core.
