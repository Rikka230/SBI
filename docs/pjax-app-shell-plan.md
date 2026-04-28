# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0K.2

Le PJAX est activé par défaut sur la branche labo.

## Interrupteurs de secours

Désactiver PJAX :

```js
window.SBI_DISABLE_PJAX()
```

Réactiver PJAX :

```js
window.SBI_ENABLE_PJAX()
```

## Routes PJAX actuellement actives

Admin :

- `/admin/index.html?tab=...`
- `/admin/site-index-settings.html`
- `/admin/admin-profile.html`

Student :

- `/student/dashboard.html`
- `/student/mes-cours.html`
- `/student/mon-profil.html`

Teacher :

- `/teacher/dashboard.html`
- `/teacher/mes-cours.html`
- `/teacher/mon-profil.html`

## 8.0K.2

- Remplacement des bulles natives navigateur par des tooltips stylisés SBI.
- Suppression du rendu rectangle gris via retrait de `title`.
- Conservation des labels accessibilité `aria-label`.
- Tooltips ajoutés sur :
  - Couleur du caractère.
  - Surlignage du caractère.
  - Taille du texte.
  - Boutons principaux Quill.
- Aucun changement sur la logique PJAX, sauvegarde ou publication.
- Version actuelle : `SBI 8.0K.2 - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/admin/formations-cours.html`
- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`
