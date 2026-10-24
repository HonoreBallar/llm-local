# frontend2 : le veilleur

Agent qui lit les logs des conteneurs du LLM (Ollama, passerelle LiteLLM, frontend1, Caddy sur le VPS), calcule ce qui s'est passé et fait **rédiger un rapport en français par le LLM local lui-même**. C'est à la fois un outil de surveillance et un test du modèle en conditions réelles.

```
docker.sock ──(lecture seule)──> socket-proxy ──> veilleur (:3001) ──/v1/chat/completions──> gateway ──> ollama
                                                     │
                                         navigateur ─┘  tableau de bord + rapport + logs
```

## Démarrer (Docker)

Le backend doit tourner (il crée le réseau `llm-local_default`) :

```powershell
cd backend;   docker compose up -d
cd ../frontend2; docker compose up -d --build
```

Ouvrir http://localhost:3001. Pour changer le port : `VEILLEUR_PORT=8081` dans un fichier `frontend2/.env`.

## Comment il travaille

1. **Collecte** ([collect.py](agent/veilleur/collect.py)) : état, redémarrages et mémoire des conteneurs, plus leurs logs sur la période choisie (1 h à 72 h).
2. **Tri** ([parsers.py](agent/veilleur/parsers.py)) : chaque ligne devient un événement (requête HTTP, temps de génération, chargement du modèle, erreur…). Les sondes de santé et les détails internes de llama.cpp sont classés comme « bruit » (environ 80 % des lignes).
3. **Constats** ([analyse.py](agent/veilleur/analyse.py)) : des règles fixes, **sans IA**, décident de la gravité et de la commande proposée. Exemples : conteneur arrêté, mémoire saturée, erreurs 5xx, mauvaise clé API, modèle lent ou souvent rechargé, robot qui cherche des failles.
4. **Rapport** ([llm.py](agent/veilleur/llm.py)) : le LLM ne reçoit que ce résumé chiffré (jamais les logs bruts) et l'explique en français, en streaming.
5. **Test du LLM** : chaque rapport est contrôlé automatiquement :
   - **Chiffres fidèles** : tout nombre cité doit figurer dans les données envoyées.
   - **Gravité respectée** : le bon emoji 🟢 / 🟠 / 🔴.
   - **Longueur** : 150 mots demandés.
   - **Vitesse** : délai avant le premier mot, durée totale, tokens/s.

Les rapports sont gardés dans le volume `veilleur-data` (100 derniers) et consultables dans l'historique.

## Sécurité

- L'agent ne touche jamais au socket Docker directement : [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) n'autorise que la **lecture** des conteneurs (`CONTAINERS=1`, `POST=0`). Aucun démarrage, arrêt, `exec` ni suppression n'est possible.
- Les commandes affichées sont **proposées, jamais exécutées**.
- Les logs ne quittent pas la machine : c'est le LLM local qui les analyse.
- Port lié à `127.0.0.1`, sans mot de passe : prévu pour un usage local. Avant de l'exposer sur le VPS, ajouter une authentification.

## Développement

API (Docker) + interface avec rechargement à chaud :

```powershell
docker compose up -d --build     # API sur :3001
cd web; npm install; npm run dev # interface sur http://localhost:5174, /api relayé vers :3001
```

Tests de l'agent (analyseurs et règles, sur de vraies lignes de logs) :

```powershell
cd agent
python -m venv .venv; .venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest
```

## Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `WATCH_PROJECTS` | `llm-local,llm-local-frontend1,llm-local-frontend2` | projets Compose surveillés |
| `WATCH_EXCLUDE_SERVICES` | `socket-proxy` | services ignorés |
| `LLM_GATEWAY_URL` | `http://gateway:4000` | passerelle appelée pour le rapport |
| `LLM_API_KEY` | lue dans `../backend/.env` | clé de la passerelle |
| `REPORT_MAX_TOKENS` | `400` | longueur maximale du rapport |
| `MAX_LINES_PER_CONTAINER` | `20000` | lignes lues au plus par conteneur |

## API

| Route | Rôle |
|---|---|
| `GET /api/overview?hours=24` | conteneurs, statistiques, constats, verdict |
| `GET /api/logs?hours=&service=&level=&q=&noise=` | lignes de logs filtrées (400 plus récentes) |
| `POST /api/report` `{"hours": 24}` | rapport du LLM en flux SSE : `meta`, `delta`…, `done` (fidélité, performance) |
| `GET /api/reports`, `GET /api/reports/{id}` | historique des rapports |

## Structure

```
agent/veilleur/
├── collect.py   lecture Docker (via le proxy)
├── parsers.py   Ollama, LiteLLM, nginx, Caddy -> événements
├── analyse.py   statistiques + constats par règles
├── llm.py       prompt, streaming, contrôle de fidélité
├── store.py     historique des rapports
└── main.py      API FastAPI + service de l'interface
web/src/
├── App.tsx      page, période, rafraîchissement toutes les 30 s
└── components/  Constats, Indicateurs, Chronologie, Services, Rapport, Logs
```
