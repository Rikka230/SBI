# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`
Base : `main` après merge 7.4.2

## État 8.0M.1

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

## Routes viewer encore protégées

- `/student/cours-viewer.html`
- `/teacher/cours-viewer.html`
- `/admin/cours-viewer.html`

## 8.0M.1

- `public/student/js/cours-viewer.js` expose maintenant `mountCourseViewer()`.
- Le montage classique en reload complet est conservé.
- Le viewer retourne un cleanup interne :
  - `clearInterval(timerInterval)`,
  - unsubscribe auth,
  - reset bouton retour.
- Le viewer lit `window.SBI_APP_SHELL_CURRENT_URL` si disponible.
- Aucun viewer n'est encore activé en PJAX.
- Aucun changement volontaire sur progression, quiz, vidéo ou tracking.
- Version actuelle : `SBI 8.0M.1 - PJAX APP SHELL TEST`.

## Diagnostics viewer

```js
window.SBI_VIEWER_STATUS('/student/cours-viewer.html?id=test')
window.SBI_VIEWER_ROUTES()
```

## Prochaine étape possible

- 8.0N : activer seulement le viewer preview prof/admin en PJAX.
- Le viewer étudiant réel reste à garder en reload classique tant que le preview n'est pas validé.
