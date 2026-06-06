# Klimax Video

Studio local pour créer des vidéos courtes Klimax à partir de deux clips liés: personne 1 et personne 2.

## Ce qui est inclus

- Frontend React/Vite en français.
- Backend local Node/Express.
- Upload local d'assets: vidéos, musiques, images, B-rolls.
- Transcription locale via Faster Whisper.
- Export MP4 via FFmpeg.
- Sous-titres personnalisables.
- Hook texte avec bulle modifiable.
- Placement manuel dans la preview: vidéo source, hook, sous-titres, logo Klimax, images.
- Mix audio: vidéo à +2 dB et musique réglable, base à -17 dB.

## Installation

```sh
npm install
```

Le backend utilise aussi Python pour la transcription:

```sh
python3 -m venv local-backend/.venv
local-backend/.venv/bin/pip install -r local-backend/requirements.txt
```

## Lancer en local

Terminal 1:

```sh
npm run backend
```

Terminal 2:

```sh
npm run dev
```

Ouvre ensuite l'URL affichée par Vite, en général:

```txt
http://127.0.0.1:8080
```

## Vérifier l'export local

Quand les deux vidéos de test sont déjà dans la banque locale, ce smoke test lance un backend isolé, crée un projet temporaire, exporte un MP4 avec sous-titres CapCut et logo Klimax, vérifie le fichier puis nettoie le projet temporaire:

```sh
npm run smoke:klimax
```

## Données locales

Les uploads, projets locaux et exports sont générés dans:

```txt
local-data/klimax/
```

Ce dossier est volontairement ignoré par Git.

## Base de données locale (Subabase de remplacement)

L'application utilise normalement Supabase pour l'authentification, la base de données et le stockage de fichiers. Pour le développement local, un substitut (shim) compatible est fourni dans `local-supabase/`. Il démarre automatiquement avec `npm run backend` et écoute sur le port 54321. Les données sont stockées dans une base PostgreSQL locale (`klimax_local_supabase`) et les fichiers uploadés dans `local-data/supabase-storage/`.

Voir `local-supabase/README.md` pour les détails. Pour désactiver le shim, définir `KLIMAX_SUPABASE_ENABLED=0` dans l'environnement.

## Notes

- Les vidéos de travail ne sont pas versionnées dans Git pour éviter des pushes trop lourds. Le dossier `public/klimax-videos/` existe pour les fichiers test locaux.
- Le logo statique est dans `public/klimax-logo.jpeg`.
- L'animation du logo Klimax est chargée par le backend si le fichier existe dans `local-data/klimax/system/`.
- Pour remplacer l'animation, ajoute-la depuis le site ou place-la côté local backend selon le flux prévu.
