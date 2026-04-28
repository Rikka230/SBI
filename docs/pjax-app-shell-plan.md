# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## Principe

Le PJAX complet ne doit pas être appliqué en bloc. Cette branche pose un app shell progressif avec fallback reload.

## Interrupteurs

Activer localement :

```js
localStorage.setItem('sbiPjaxEnabled', 'true')
```

Désactiver :

```js
localStorage.removeItem('sbiPjaxEnabled')
```

Debug :

```js
localStorage.setItem('sbiPjaxDebug', 'true')
```

## Version badge

Depuis 8.0C, l'encart de version est piloté par :

- `public/js/sbi-version.js`
- `public/js/sbi-version-badge.js`

À chaque patch, mettre à jour `SBI_VERSION` pour confirmer visuellement la build chargée dans Firebase Preview.

## 8.0D.1

- Cache DOM de l'index admin avant départ vers Profil ou Gestion Accueil.
- Restauration du vrai DOM de l'index admin au retour.
- Objectif : retour instantané sur l'onglet Utilisateurs, sans attendre le prochain refresh Firestore.
- Les boutons et listeners existants de la liste utilisateurs sont conservés.
- Version actuelle : `SBI 8.0D.1 - PJAX APP SHELL TEST`.

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Chaque route migrée doit fournir un démontage propre.
- Une erreur routeur doit retomber en reload classique.
- Les listeners Firestore doivent être enregistrés dans un listener bag.
- Les pages éditeur, viewer, quiz et Quill restent en reload classique tant qu’elles n’ont pas leur lifecycle dédié.
