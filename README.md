# llm-local

LLM local dans Docker, appelable par API (formats OpenAI et Claude), avec une interface de chat.

| Dossier | Contenu |
|---|---|
| [backend/](backend/README.md) | Ollama (modèle) + LiteLLM (passerelle API avec clé), port 4000 |
| [frontend1/](frontend1/README.md) | Chatbot web React servi par nginx, port 3000 |
| [frontend2/](frontend2/README.md) | Veilleur : analyse les logs du LLM et les fait expliquer en français par le LLM, port 3001 |
| [frontend3/](frontend3/README.md) | CRUD de catégories et de fiches CNI / KYC (PostgreSQL), analyse des documents par un modèle de vision, chatbot flottant qui pilote le tout, port 3002 |

## Démarrage rapide

```powershell
cd backend
copy .env.example .env        # puis choisir une clé LLM_API_KEY
docker compose up -d
cd ../frontend1
docker compose up -d --build
cd ../frontend2              # optionnel : le veilleur des logs
docker compose up -d --build
cd ../frontend3              # optionnel : catégories, fiches CNI/KYC + chatbot
docker compose up -d --build
```

Interface : http://localhost:3000 · API : http://localhost:4000 · Veilleur : http://localhost:3001 · Catégories : http://localhost:3002
