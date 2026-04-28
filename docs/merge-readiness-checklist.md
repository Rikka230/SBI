# SBI - Checklist merge readiness

Version chantier : 7.4
Branche de travail : `avatar-profile-test`
Branche stable : `main`

## Avant merge vers `main`

### Déploiement et règles

- Vérifier que `firestore.rules` et `storage.rules` ont bien été déployées après 7.3.
- Vérifier que la preview Firebase s'ouvre sans cache dur avec un refresh complet.
- Vérifier que `firebase.json` est bien présent avec les headers de cache 7.4.

### Parcours critiques

- Public : index charge les médias Storage sans fallback local lourd.
- Public : login fonctionne avec logo WebP et fallback PNG.
- Admin : dashboard, utilisateurs, formations, gestion accueil.
- Teacher : dashboard, profil, création cours, brouillon, soumission validation.
- Admin : validation publication d'un cours prof.
- Student : notification reçue, cours visible, viewer accessible, progression OK.

### Navigation

- `sbi-internal-shell.js` reste désactivé.
- Navigation 7.2 validée : transitions légères uniquement, pas de PJAX complet.
- Historique navigateur OK sur les onglets admin.
- Depuis Gestion Accueil, tous les onglets admin restent cliquables.

### Médias et cache

- Lancer `scripts\audit-heavy-assets.bat`.
- Aucun fichier vidéo ne doit rester dans `public/assets`.
- Les médias lourds de l'index doivent rester dans Firebase Storage.
- Les logos login utilisent WebP en priorité avec fallback PNG.
- Le fichier racine `sbi-navigation-transitions.js` peut être supprimé s'il n'est pas utilisé par Firebase Hosting, car la version active est `public/js/sbi-navigation-transitions.js`.

### Console

- Aucune erreur rouge bloquante au chargement admin / teacher / student.
- Les warnings attendus de permissions optionnelles ne doivent pas polluer la console.
- Les erreurs réelles de rules, auth ou Storage doivent rester visibles.

### Décision merge

Ne pas merger tant que Tony n'a pas explicitement validé :

```txt
OK merge main
```
