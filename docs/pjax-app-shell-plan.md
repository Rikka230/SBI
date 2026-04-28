# SBI PJAX App Shell Plan

Branche expérimentale : `pjax-app-shell-test`

## État 8.0M.4

Patch bugfix après validation partielle de 8.0M.3.

## Constats

- Le viewer refonctionne.
- Le cours créé en 8.0M.3 apparaît bien.
- Un cours créé pendant l'état cassé 8.0M.2 peut rester invisible si sa notification a déjà été ouverte.

## Correction

### Mes Cours élève

- Les notifications déjà ouvertes/lues peuvent désormais servir au fallback de récupération.
- Le fallback ne filtre plus `dismissedBy`.
- Les notifications `resolved` restent ignorées.
- Le warning Firestore attendu sur `targetStudents` est remplacé par un `console.info`.
- Le debug affiche aussi les dossiers rendus.

## Diagnostic

```js
window.SBI_STUDENT_COURSES_DEBUG()
```

## Version

`SBI 8.0M.4 - PJAX APP SHELL TEST`
