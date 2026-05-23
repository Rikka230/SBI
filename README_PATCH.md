# Patch SBI 8.0P.167.191 - SEO static meta and canonicals

Base : ZIP complet fourni après patch `8.0P.167.190`.
Date : 2026-05-23

## Contenu

- Ajout / normalisation des meta descriptions, robots, canonicals, Open Graph et Twitter Cards sur les pages publiques.
- Ajout de JSON-LD propre sur les pages publiques principales.
- Mise à jour `sitemap.xml` avec `lastmod` au 2026-05-23.
- Ajout des redirections Firebase `/parcours` et `/parcours.html` vers `/formations.html`.
- Bump `public/js/sbi-version.js` en `8.0P.167.191`.

## Fichiers modifiés

- `public/index.html`
- `public/formations.html`
- `public/ressources.html`
- `public/calculateur.html`
- `public/a-propos.html`
- `public/contact.html`
- `public/mentions-legales.html`
- `public/politique-confidentialite.html`
- `public/politique-cookies.html`
- `public/cgu.html`
- `public/accessibilite.html`
- `public/404.html`
- `public/parcours.html`
- `public/sitemap.xml`
- `firebase.json`
- `public/js/sbi-version.js`

## Commandes d’intégration

```bash
cd "/d/Users/owner/Documents/AUTO-ENTREPRISE/Clients/Study/CFMFS/1_SBI_GIT/SBI"

git checkout main
git pull --ff-only origin main

ZIP="/d/Téléchargement/sbi_seo_patch_8_0P_167_191.zip"
unzip -o "$ZIP" -d .

git status
git add firebase.json public/*.html public/sitemap.xml public/js/sbi-version.js README_PATCH.md
git commit -m "SEO static meta and canonicals 8.0P.167.191"
git push origin main

firebase deploy --only hosting --project sbi-web-4f6b4
```

Si `unzip` n’est pas disponible dans Git Bash, utiliser `Expand-Archive` PowerShell.
