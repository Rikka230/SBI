# CONTEXT — SBI (vocabulaire de domaine & architecture)

> Glossaire vivant. Termes à employer tels quels dans le code, les revues et les conversations.
> (La mémoire projet détaillée vit dans le vault Obsidian `2_Memory/SBI` — voir la mémoire `.claude`.)

## Espaces & rôles
- **Espace privé** — zone authentifiée d'un rôle : `admin`, `student` (élève), `teacher` (prof), `tutor` (maître d'apprentissage). Chacun a son **accent** : admin/élève `#2A57FF` (bleu), prof `#f97316` (orange), tuteur `#84cc16` (lime), exposé en CSS via `--space-accent` sur `body.sbi-{role}-space` (posé par `admin-ui/theme.js`).

## Shell des espaces privés (chantier deepening, 2026-06)
- **Internal Shell** (`<sbi-shell>`) — module *profond* qui rend le **chrome** (navigation + top-bar) d'un espace privé à partir d'un **Profil de rôle**, avec **deux présentations** derrière un seul *seam* : **panneau latéral** (desktop ≥1025px) et **bottom-nav flottante** (≤1024px). Remplace les modules `*-panels.js` dupliqués. **Phase 1** : `student` + `teacher` + `tutor` (pattern clair identique). L'**admin** (cockpit sombre, right-panel) reste à part jusqu'à une phase 2 éventuelle.
- **Profil de rôle** — la *donnée* qui décrit le chrome d'un espace, et la **surface de test** du Shell : `{ role, label, accent, levelLabel, searchMode, nav, hasRightPanel }`. `searchMode` ∈ `global` (recherche globale partagée) | `apprentice` (recherche d'apprenti lié, tuteur).
- **Manifeste de navigation** — liste ordonnée d'entrées de nav par rôle : `{ id, label, href, icon, match, primary }`, + un résolveur pur `isActive(route, entry)`. `primary:true` (max 4) = affiché directement dans la bottom-nav ; les autres vont dans « Plus ». Consommé à l'identique par les deux présentations.
- **Bottom-nav flottante** — présentation mobile/tablette (≤1024px) : capsule translucide (`backdrop-filter`), **indicateur coulissant recoloré** par `--space-accent`, `env(safe-area-inset-bottom)`, cibles ≥44px, `prefers-reduced-motion` respecté, sens porté par icône+label (jamais la couleur seule).
- **Feuille « Plus »** — bottom-sheet ouverte par le dernier onglet de la bottom-nav ; liste les entrées non-`primary` + Déconnexion. *(Retour admin = entrée admin-only, prévue côté Shell.)*

### État d'implémentation (2026-06-03, .306)
- **LIVRÉ (additif, non destructif)** : `nav-manifest.js` (manifeste + `isActive`/`primaryNav`/`overflowNav`), `<sbi-bottom-nav>` (`components/bottom-nav.js`) auto-injecté sur student/teacher/tutor, `sbi-bottom-nav.css`. En ≤1024px (classe `body.sbi-bottom-nav-active`), le **panneau latéral + hamburger sont masqués** pour ces 3 rôles et la bottom-nav prend le relais ; ≥1025px = panneau latéral **inchangé** ; **admin jamais touché** ; pages immersives (cours-viewer) **exclues**. Actif resynchronisé sur `sbi:app-shell:navigated`.
- **RESTE (phase 1b)** : convergence desktop — fusionner `*-panels.js` derrière un `<sbi-shell>` lisant le **même** manifeste + Profil de rôle, puis appliquer la **deletion test** (supprimer les 3 modules dupliqués). Optionnel : `viewport-fit=cover` dans les `<meta viewport>` des pages de rôle pour activer réellement `env(safe-area-inset-*)` sur encoche.

## Ordre par importance (fréquence d'usage) — par rôle
> Source unique de l'ordre des onglets. **Le panneau PC et la bottom-nav partagent cet ordre.** Les **4 premiers** d'un rôle = `primary:true` (bottom-nav directe) ; les suivants vont dans « Plus ». Appliqué aux `*-panels.js` le 2026-06-03.
- **Élève** : 1 Mon Hub · 2 Mes Cours · 3 Mes Devoirs · 4 Lives · 5 Mon Profil & XP. *(Mon livret RETIRÉ de la nav → vit dans le coffre « Mes documents SBI » du profil, lien `/student/livret.html`.)*
- **Prof** : 1 Mon Espace · 2 Formations & Cours · 3 Devoirs & Évals · 4 Lives · 5 Mon Profil Public · 6 **Livrets** · 7 **Documents**. *(Livrets + Documents en dernier, juste avant Déconnexion.)*
- **Tuteur** : 1 Tableau de bord · 2 Documents.
- **Admin** (hors shell Phase 1, panneau réordonné quand même) : 1 Tableau de Bord · 2 Comptes · 3 Promotions · 4 Cursus · 5 Formations · 6 Élèves en retard · 7 Journal admin · 8 Serveur & Vidéos.

## « Retour admin »
- Affordance réservée à un **admin** qui visite un espace de rôle (impersonation). Retirée du markup statique élève/prof/tuteur (elle était de toute façon morte hors `/admin/` : `initAdminVisitorShortcut` n'est câblé que pour `area === 'admin'`). Dans le **Shell**, ce sera une entrée de profil **conditionnelle** rendue uniquement si le visiteur est `isSbiAdminLike`.

## Principes (architecture)
- Le **Profil de rôle** est l'interface : ajouter un rôle ou une entrée de nav = de la **donnée**, pas un nouveau composant.
- Un **seam** = présentation (desktop/mobile) interchangeable sans éditer le Shell.
- Couleurs par rôle **conservées** quelle que soit la présentation.
