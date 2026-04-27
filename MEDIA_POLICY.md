# SBI - Politique médias lourds

Firebase Hosting doit rester léger.

## À mettre dans le repo

Le repo peut contenir :

```txt
HTML
CSS
JS
petits logos
icônes SVG
images légères optimisées
petits assets statiques nécessaires à l'interface
```

## À éviter dans le repo

Ne pas stocker directement dans Git / Firebase Hosting :

```txt
vidéos lourdes
fonds animés lourds
grosses images non compressées
exports PSD/AI/AE/PRPROJ
fichiers ZIP/RAR lourds
médias dynamiques utilisateurs
```

## Où mettre les gros médias

Les médias lourds doivent aller plutôt dans :

```txt
Firebase Storage
Vimeo
YouTube
CDN adapté
service vidéo externe
```

Puis être rappelés dans le site via URL.

## Pourquoi

Une vidéo ou une grosse image présente dans `public` :

```txt
compte dans le stockage Firebase Hosting
peut consommer du transfert Hosting à chaque visite
peut déclencher des coûts si le trafic dépasse le gratuit
rend le repo plus lourd
ralentit les clones et déploiements
```

Le cache navigateur aide, mais ne doit pas être utilisé comme excuse pour héberger des médias trop lourds dans le repo.

## Règle SBI

Avant d'ajouter un média :

1. Si c'est une image d'interface légère, la compresser en WebP quand possible.
2. Si c'est une vidéo ou un média lourd, l'envoyer hors repo.
3. Si le fichier dépasse quelques Mo, vérifier s'il doit vraiment être dans `public`.
4. Pour l'image fondateur et les futurs médias dynamiques, préférer Storage/CDN quand la version finale est validée.

## Audit local

Utiliser :

```bat
scripts\audit-heavy-assets.bat
```

Ce script liste les fichiers potentiellement trop lourds dans `public`.
