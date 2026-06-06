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

## Données locales

Les uploads, projets locaux et exports sont générés dans:

```txt
local-data/klimax/
```

Ce dossier est volontairement ignoré par Git.

## Notes

- Les vidéos de travail ne sont pas versionnées dans Git pour éviter des pushes trop lourds. Le dossier `public/klimax-videos/` existe pour les fichiers test locaux.
- Le logo statique est dans `public/klimax-logo.jpeg`.
- L'animation du logo Klimax est chargée par le backend si le fichier existe dans `local-data/klimax/system/`.
- Pour remplacer l'animation, ajoute-la depuis le site ou place-la côté local backend selon le flux prévu.
