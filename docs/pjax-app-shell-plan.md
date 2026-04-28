# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0K.1

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

## Diagnostics console

```js
window.SBI_PJAX_CHECK('/teacher/mes-cours.html')
window.SBI_PJAX_CHECK('/admin/formations-cours.html')
window.SBI_PJAX_ROUTES()
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

## 8.0K.1

- Ajout des bulles d'information sur la toolbar Quill.
- Labels ajoutés aux boutons principaux de l'éditeur.
- Ajout clair pour :
  - Couleur du caractère.
  - Surlignage du caractère.
- Aucun changement sur la logique PJAX, sauvegarde ou publication.
- Version actuelle : `SBI 8.0K.1 - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/admin/formations-cours.html`
- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`
