# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0M

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

## Routes viewer encore protégées

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`

## Diagnostics viewer

```js
window.SBI_VIEWER_STATUS('/student/cours-viewer.html?id=test')
window.SBI_VIEWER_STATUS('/teacher/cours-viewer.html?id=test&preview=true')
window.SBI_VIEWER_ROUTES()
```

## 8.0M

- Ajout de `public/js/app-shell/course-viewer-bridge.js`.
- Ajout des diagnostics viewer :
  - `window.SBI_VIEWER_STATUS()`
  - `window.SBI_VIEWER_ROUTES()`
- Le viewer reste protégé en reload classique.
- Aucun changement sur progression, quiz, vidéo ou tracking.
- Version actuelle : `SBI 8.0M - PJAX APP SHELL TEST`.

## Plan avant activation PJAX viewer

À faire avant activation :

- exporter `mountCourseViewer()` depuis `/student/js/cours-viewer.js` ;
- retourner un `cleanup()` pour stopper `timerInterval` ;
- isoler les listeners quiz par chapitre ;
- sécuriser `leaveViewer()` dans le shell ;
- fallback reload au moindre souci progression/quiz ;
- activer d’abord le viewer prof/admin preview, puis le viewer étudiant.
