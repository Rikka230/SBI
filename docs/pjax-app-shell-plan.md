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

## 8.0A

- Ajout du dossier `public/js/app-shell/`.
- Routeur désactivé par défaut.
- Fallback full reload pour toute route non migrée.
- Gestion `mount/unmount` via `view-lifecycle.js`.
- Registre de listeners Firestore via `firebase-listeners.js`.
- Première route sûre : onglets admin déjà présents dans le DOM.
- Aucune migration des éditeurs, viewers, Quill ou notifications lourdes.

## Prochaines étapes

- 8.0B : migrer une vraie page admin externe simple dans le shell.
- 8.0C : ajouter skeleton loaders et extraction de vues admin.
- 8.0D : student shell.
- 8.0E : teacher shell.
- 8.0F : éditeurs, viewers, Quill, progression.

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Chaque route migrée doit fournir un démontage propre.
- Une erreur routeur doit retomber en reload classique.
- Les listeners Firestore doivent être enregistrés dans un listener bag.
