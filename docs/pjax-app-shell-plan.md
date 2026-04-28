# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0L

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
window.SBI_PJAX_CHECK('/admin/formations-cours.html')
window.SBI_PJAX_CHECK('/teacher/mes-cours.html')
window.SBI_PJAX_CHECK('/student/cours-viewer.html?id=test')
window.SBI_PJAX_ROUTES()
```

## Routes PJAX actuellement actives

Admin :

- `/admin/index.html?tab=...`
- `/admin/site-index-settings.html`
- `/admin/formations-cours.html`
- `/admin/admin-profile.html`

Student :

- `/student/dashboard.html`
- `/student/mes-cours.html`
- `/student/mon-profil.html`

Teacher :

- `/teacher/dashboard.html`
- `/teacher/mes-cours.html`
- `/teacher/mon-profil.html`

## 8.0L

- Activation PJAX de `/admin/formations-cours.html`.
- Le bridge éditeur supporte maintenant les deux IDs :
  - `#quill-editor` côté teacher.
  - `#course-editor` côté admin.
- Chargement Quill avant montage de l'éditeur admin.
- Initialisation Quill via `course-editor-bridge.js`.
- Montage de `admin-courses.js` via `mountAdminCourses()`.
- `/student/cours-viewer.html`, `/teacher/cours-viewer.html` et `/admin/cours-viewer.html` restent protégés en reload classique.
- Version actuelle : `SBI 8.0L - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`
- `/admin/formations-live.html`
- `/admin/repair-access.html`
