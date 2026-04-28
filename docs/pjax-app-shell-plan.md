# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0K

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

## 8.0K

- Activation PJAX de `/teacher/mes-cours.html`.
- Chargement Quill avant montage de l'éditeur.
- Initialisation Quill via `course-editor-bridge.js`.
- Réactivation des onglets Ma Bibliothèque / Éditeur de Cours côté shell.
- Réactivation du switch Image / Vidéo côté shell.
- Montage de `admin-courses.js` via `mountAdminCourses()`.
- `/admin/formations-cours.html` reste protégé en reload classique.
- Version actuelle : `SBI 8.0K - PJAX APP SHELL TEST`.

## Routes encore protégées

- `/admin/formations-cours.html`
- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`

## Règles de sécurité

- Ne pas réactiver `sbi-internal-shell.js`.
- Une erreur routeur doit retomber en reload classique.
- Les pages viewer/progression restent en reload classique tant qu’elles n’ont pas leur lifecycle dédié.
