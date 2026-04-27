# SBI - Déploiement Firebase Hosting

Ce projet est configuré pour déployer le dossier `public` sur Firebase Hosting.

## Projet Firebase

```txt
sbi-web-4f6b4
```

## Fichiers ajoutés

```txt
firebase.json
.firebaserc
package.json
.gitignore
scripts/setup-sbi-local.bat
scripts/firebase-login.bat
scripts/pull-latest.bat
scripts/deploy-preview.bat
scripts/deploy-hosting.bat
```

## Première installation locale Windows

Depuis le dossier parent où tu veux récupérer le projet :

```bat
scripts\setup-sbi-local.bat
```

Si tu n'as pas encore le repo localement, tu peux aussi faire manuellement :

```bat
git clone https://github.com/Rikka230/SBI.git SBI
cd SBI
git checkout avatar-profile-test
npm install
firebase login
firebase use sbi-web-4f6b4
```

## Déployer une preview Firebase

```bat
scripts\deploy-preview.bat
```

La preview est publiée sur un channel Firebase nommé :

```txt
avatar-profile-test
```

Elle expire après 7 jours.

## Déployer en live Firebase Hosting

```bat
scripts\deploy-hosting.bat
```

Le script demande d'écrire :

```txt
DEPLOY
```

avant de publier.

## Important sécurité

Le script live utilise :

```bat
firebase deploy --only hosting --project sbi-web-4f6b4
```

Il ne déploie pas Firestore rules ni Storage rules.

Les règles `firestore.rules` et `storage.rules` sont présentes dans le repo, mais leur déploiement doit rester volontaire et séparé.

## Workflow recommandé

1. Travailler sur une branche, par exemple `avatar-profile-test`.
2. Pull local :

```bat
scripts\pull-latest.bat
```

3. Déployer preview :

```bat
scripts\deploy-preview.bat
```

4. Tester l'URL Firebase Preview.
5. Déployer live seulement après validation.

## Notes

- `public` reste le root de l'app, comme sur Vercel.
- Les fichiers HTML/CSS/JS sont servis statiquement.
- Les fichiers HTML/CSS/JS sont en `no-cache` dans `firebase.json` pour éviter de revoir trop longtemps une ancienne version pendant les tests.
