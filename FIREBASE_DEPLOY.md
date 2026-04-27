# SBI - Déploiement Firebase Hosting

Ce projet est configuré pour déployer le dossier `public` sur Firebase Hosting.

## Projet Firebase

```txt
sbi-web-4f6b4
```

## Règle médias lourds

Firebase Hosting doit rester léger.

À garder dans le repo :

```txt
HTML
CSS
JS
petits logos/icônes
images légères optimisées
```

À éviter dans le repo :

```txt
vidéos lourdes
grosses images non compressées
fonds animés lourds
archives ZIP/RAR
exports sources PSD/AI/AE/PRPROJ
```

Les médias lourds doivent aller dans Firebase Storage, Vimeo, YouTube ou un CDN adapté, puis être appelés via URL.

Audit local :

```bat
scripts\audit-heavy-assets.bat
```

## Fichiers ajoutés

```txt
firebase.json
.firebaserc
package.json
.gitignore
MEDIA_POLICY.md
scripts/setup-sbi-local.bat
scripts/firebase-login.bat
scripts/pull-latest.bat
scripts/deploy-preview.bat
scripts/deploy-hosting.bat
scripts/audit-heavy-assets.bat
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

## Branches = preview automatique manuelle

Depuis une branche de travail :

```bat
scripts\deploy-preview.bat
```

Le script utilise automatiquement le nom de la branche courante comme channel Firebase.

Exemple :

```txt
branche : avatar-profile-test
channel : avatar-profile-test
```

Si le nom de branche contient `/`, `_` ou `.`, le script le transforme en `-` pour Firebase.

La preview expire après 7 jours.

## Main = live manuel sécurisé

Le déploiement live Firebase Hosting se fait uniquement depuis `main` :

```bat
scripts\deploy-hosting.bat
```

Le script vérifie la branche locale.

S'il n'est pas lancé depuis :

```txt
main
```

il bloque le déploiement live.

Il demande aussi d'écrire :

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

3. Vérifier les médias lourds :

```bat
scripts\audit-heavy-assets.bat
```

4. Déployer preview :

```bat
scripts\deploy-preview.bat
```

5. Tester l'URL Firebase Preview.
6. Merger dans `main` seulement après validation.
7. Déployer live depuis `main` avec :

```bat
scripts\deploy-hosting.bat
```

## Notes

- `public` reste le root de l'app, comme sur Vercel.
- Les fichiers HTML/CSS/JS sont servis statiquement.
- Les fichiers HTML/CSS/JS sont en `no-cache` dans `firebase.json` pour éviter de revoir trop longtemps une ancienne version pendant les tests.
- Les images statiques doivent être compressées en WebP quand possible.
