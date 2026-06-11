# Connexion Google Drive (mode automatique)

Google **interdit aux comptes de service d'uploader des fichiers sur un Drive personnel**
(« Service Accounts do not have storage quota »). La seule façon d'envoyer les vidéos
sur **ton** Drive (tes 15 Go gratuits) est de connecter l'app à **ton compte**, une fois.

C'est rapide (~3 min) et ça ne se refait jamais.

## 1. Créer un client OAuth « Desktop »

1. Va sur https://console.cloud.google.com/apis/credentials (projet `extreme-display-460722-j4`).
2. **+ Créer des identifiants** → **ID client OAuth**.
   - Si on te demande l'écran de consentement : type **Externe**, renseigne un nom
     (« Klimax »), ton email, **enregistre**. Dans « Utilisateurs de test », **ajoute ton email**.
3. Type d'application : **Application de bureau** → Créer.
4. **Télécharge le JSON** et place-le ici :
   `local-backend/google-oauth-client.json`

## 2. Se connecter une fois

Dans un terminal, à la racine du projet :

```
node local-backend/driveAuth.mjs
```

Une page Google s'ouvre → connecte-toi avec **ton** compte → autorise.
(Si « Google n'a pas validé cette application » : **Paramètres avancés → Accéder à Klimax**.)

Ça crée `local-backend/google-oauth-token.json`. **C'est fini.**

## 3. (Option) Choisir le dossier de destination

Par défaut chaque batch crée son dossier daté à la racine de ton Drive.
Pour les ranger dans un dossier précis, mets son ID dans
`local-backend/google-drive-config.json` :

```json
{ "parentFolderId": "1S9ktKjZvkunkSatfBRIgGNS74WUmLBJH" }
```

(l'ID = la partie après `/folders/` dans l'URL du dossier)

---

Tous ces fichiers (`google-*.json`) sont **gitignorés** : aucune clé n'est poussée sur GitHub.
