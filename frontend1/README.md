# frontend1 : interface de chat

Chatbot web pour l'API du dossier [backend](../backend/README.md). React + Vite, servi par nginx dans Docker.

```
navigateur ──> nginx (:3000) ──/api + clé──> gateway (:4000) ──> ollama
```

nginx ajoute la clé API (lue dans `../backend/.env`) : elle n'est jamais envoyée au navigateur.

## Démarrer (Docker)

Le backend doit tourner (il crée le réseau `llm-local_default`) :

```powershell
cd backend;   docker compose up -d
cd ../frontend1; docker compose up -d --build
```

Ouvrir http://localhost:3000. Pour changer le port : `FRONT_PORT=8080` dans un fichier `frontend1/.env`.

Après une modification du code : `docker compose up -d --build`.

## Développement (rechargement à chaud)

```powershell
npm install
npm run dev
```

Ouvrir http://localhost:5173. Vite relaie `/api` vers `http://localhost:4000` avec la clé de `../backend/.env`.

## Fonctionnalités

- Réponses en streaming, bouton stop
- Markdown, tableaux, coloration du code et bouton copier
- Historique des conversations (stocké dans le navigateur), regroupé par date, renommer et supprimer
- Modifier un message envoyé, régénérer la dernière réponse, copier
- Paramètres : modèle, instructions système, température, longueur max, thème clair, sombre ou système
- Indicateur d'état de l'API, version mobile

## Structure

```
src/
├── App.tsx              état global, envoi et streaming
├── api.ts               appels à l'API (format OpenAI, SSE)
├── storage.ts           sauvegarde localStorage
├── styles.css           thème et mise en page
└── components/          Sidebar, ChatView, MessageItem, Composer, Markdown, SettingsModal, Icons
```
