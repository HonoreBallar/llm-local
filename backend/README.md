# LLM local (Docker)

Un LLM qui tourne sur ce PC, appelable par API au **format OpenAI** et au **format Claude**.

```
client ──(clé API)──> gateway (LiteLLM, :4000) ──> ollama (modèle, CPU)
```

- `ollama` : moteur d'inférence, non exposé hors de Docker.
- `gateway` : vérifie la clé et expose `/v1/chat/completions` (OpenAI) et `/v1/messages` (Claude).
- `model-init` : télécharge le modèle au premier lancement, puis s'arrête.

## Démarrer

Toutes les commandes se lancent depuis le dossier `backend/`.

```powershell
cd backend
copy .env.example .env      # puis mettre une vraie clé dans LLM_API_KEY
docker compose up -d
docker compose logs -f model-init   # suivre le téléchargement du modèle
```

Arrêter : `docker compose down` (les modèles restent dans le volume `ollama-models`).

## Appeler l'API

Le nom de modèle côté client est toujours **`local`**. La clé est `LLM_API_KEY` du fichier `.env`.

**Format OpenAI**

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LLM_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"local","messages":[{"role":"user","content":"Bonjour"}]}'
```

**Format Claude**

```bash
curl http://localhost:4000/v1/messages \
  -H "x-api-key: $LLM_API_KEY" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json" \
  -d '{"model":"local","max_tokens":200,"messages":[{"role":"user","content":"Bonjour"}]}'
```

**SDK** : voir [examples/test_openai.py](examples/test_openai.py) et [examples/test_anthropic.py](examples/test_anthropic.py).
Il suffit de changer `base_url` (`http://localhost:4000/v1` pour OpenAI, `http://localhost:4000` pour Anthropic).

Test rapide : `.\examples\test.ps1`

## Changer de modèle

1. Modifier `LLM_MODEL` dans `.env` **et** `model:` dans `gateway/litellm.yaml` (`ollama_chat/<modèle>`).
2. `docker compose up -d --force-recreate`

Modèles adaptés à 16 Go de RAM sans GPU NVIDIA :

| Modèle | Taille | Remarque |
|---|---|---|
| `gemma3:1b` | ~0,8 Go | très rapide, qualité limitée |
| `llama3.2:3b` | ~2 Go | rapide |
| `gemma3:4b` | ~3,3 Go | **défaut**, bon compromis, bon en français |
| `qwen3:8b` | ~5,2 Go | meilleur, mais lent sur CPU |

Liste des modèles installés : `docker compose exec ollama ollama list`

## Production (VPS)

API publique : **`https://76.13.51.87:8443`**, en HTTPS avec un certificat auto-signé par Caddy.

- Fichiers : `docker-compose.prod.yml` (Caddy, port 8443 seul exposé, plafonds mémoire), `caddy/Caddyfile`, `deploy/remote-deploy.sh`.
- Sur le VPS, tout est isolé dans `/opt/llm-local/` (projet Docker `llm-local`, utilisateur `llm-deploy`). Le secret `.env` est dans `/opt/llm-local/shared/.env`, jamais dans Git.
- Seules `/v1/*` et `/health/*` sont exposées. L'interface d'admin de LiteLLM ne l'est pas.
- **Déploiement automatique** : un push sur `main` qui modifie `backend/` lance la CI, puis un rsync et un `docker compose up -d` sur le VPS. Une vérification de santé suit, avec retour à la version précédente en cas d'échec. Voir [.github/workflows/deploy-backend.yml](../.github/workflows/deploy-backend.yml).

Appeler l'API de production en vérifiant le certificat (racine : [llm-local-ca.crt](../llm-local-ca.crt)) :

```bash
curl --cacert llm-local-ca.crt https://76.13.51.87:8443/v1/models -H "Authorization: Bearer <clé>"
# Avec le curl de Windows (Schannel), --cacert n'est pas pris en compte : utiliser -k (le certificat n'est alors pas vérifié)
```

SDK Python : `OpenAI(base_url="https://76.13.51.87:8443/v1", api_key=..., http_client=httpx.Client(verify="llm-local-ca.crt"))`.

## Notes

- **CPU uniquement** : comptez quelques mots par seconde ; la première requête est plus lente (chargement du modèle en RAM). Le modèle reste chargé 30 min (`OLLAMA_KEEP_ALIVE`).
- **Mémoire Docker** : WSL2 donne par défaut 50 % de la RAM à Docker (8 Go), suffisant jusqu'à ~8B. Pour changer : fichier `%UserProfile%\.wslconfig` → `[wsl2]` `memory=10GB`, puis `wsl --shutdown`.
- **Accès réseau** : par défaut l'API n'écoute que sur `127.0.0.1`. Mettre `LLM_BIND=0.0.0.0` pour l'ouvrir au réseau local (garder une clé forte).
- Le fichier `.env` contient la clé : ne pas le versionner.
