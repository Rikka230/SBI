# SBI 8.0P.142 / P2E.4

## Objectif

Durcir les règles Firestore sur `users/{uid}` après validation de P2E.1 à P2E.3.

## Fichiers modifiés

- `firestore.rules`
- `public/js/sbi-version.js`

## Changements

- Bloque la création directe de documents `users/{uid}` côté client.
- Bloque la suppression directe de documents `users/{uid}` côté client.
- Retire l'autorisation admin globale `allow update: if isAdmin()` sur `users/{uid}`.
- Les champs sensibles doivent passer par les Cloud Functions déjà validées :
  - création compte : `adminCreateUserAccount`
  - édition prénom / nom / rôle / statut / droits : `adminUpdateUserAccount`
  - changement email admin : `adminChangeUserEmail`
  - changement email utilisateur : `selfChangeUserEmail`
  - suppression compte : `deleteUserAccount`
  - accès formations : `adminSyncUserFormationIndexes`
- Garde les écritures client nécessaires :
  - propriétaire du profil : bio, données privées, avatar, présence, progression, XP ;
  - admin sur un autre profil : maintenance non sensible, avatar legacy, bio/privateData, progression/XP.

## Déploiement

```bash
firebase deploy --only firestore:rules --project sbi-web-4f6b4
firebase hosting:channel:deploy admin-mail-workflow --project sbi-web-4f6b4 --expires 7d
```

## Tests recommandés

1. Admin > créer un compte test.
2. Admin > modifier prénom / nom / rôle / statut du compte test.
3. Admin > changer email du compte test.
4. Admin > envoyer reset password.
5. Admin > supprimer le compte test.
6. Admin > Diagnostic accès cours > Réparer index users.
7. Étudiant / prof > modifier bio.
8. Étudiant / prof > modifier téléphone/adresse.
9. Étudiant / prof > upload avatar.
10. Étudiant > ouvrir cours et valider progression / XP.
11. Admin > profil étudiant > modifier XP / progression si utilisé.

## Rollback rapide

Remettre les anciens `firestore.rules` depuis le ZIP précédent puis redéployer :

```bash
firebase deploy --only firestore:rules --project sbi-web-4f6b4
```
