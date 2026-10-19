# llm-local

LLM local dans Docker, appelable par API (formats OpenAI et Claude), avec une interface de chat.

| Dossier | Contenu |
|---|---|
| [backend/](backend/README.md) | Ollama (modèle) + LiteLLM (passerelle API avec clé), port 4000 |
| [frontend1/](frontend1/README.md) | Chatbot web React servi par nginx, port 3000 |

## Démarrage rapide

```powershell
cd backend
copy .env.example .env        # puis choisir une clé LLM_API_KEY
docker compose up -d
cd ../frontend1
docker compose up -d --build
```

Interface : http://localhost:3000 · API : http://localhost:4000
