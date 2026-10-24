# frontend3 : catégories, fiches clients et chatbot

Deux modules, avec un **chatbot flottant** qui les pilote en langage naturel grâce au LLM local du dossier [backend](../backend/README.md) :

- **Catégories** : CRUD complet, depuis le tableau ou depuis le chat.
- **Fiches** : CRUD de fiches **CNI** (carte nationale d'identité de Côte d'Ivoire) et **KYC** (connaissance client), avec documents joints et un bouton **Analyser** qui vérifie, avec un modèle de vision, que le document est bien celui attendu.

```
navigateur ──> web (nginx :3002) ──/api──> api (Express) ──> db (PostgreSQL)
                                              │         └──> volume uploads (documents)
                                              └──> gateway (:4000) ──> ollama
                                                   « local » = qwen2.5:3b (chat, outils)
                                                   « vision » = gemma3:4b (analyse d'images)
```

- **db** : PostgreSQL 16, données dans le volume `db-data`. Tables créées au démarrage de l'API : `categories`, `fiches` (champs propres au type dans `donnees` JSONB, dernier résultat dans `analyse`), `fiche_documents`.
- **api** : REST `/api/categories`, `/api/fiches` et `/api/chat`. La clé LLM reste côté serveur.
- **web** : React + Vite. Menu « Catégories | Fiches », bulle de chat en bas à droite. Les pages se rechargent dès que le chatbot modifie la base.

## Fiches CNI et KYC

| Type | Champs (\* obligatoire) | Documents |
|---|---|---|
| CNI | nom\*, prénoms\*, sexe, date et lieu de naissance, n° de CNI\*, dates de délivrance et d'expiration | recto\* et verso |
| KYC | nom\*, prénoms\*, date de naissance, téléphone\*, e-mail, adresse\*, ville, profession, employeur, source de revenus, n° de pièce | justificatifs\* (plusieurs) : domicile (CIE, SODECI, quittance…), formulaire KYC signé, revenus |

La définition des champs est dans [api/src/fiches/schema.ts](api/src/fiches/schema.ts) : le formulaire du front est généré à partir d'elle (`GET /api/fiches/types`).

**Documents** : JPG, PNG ou PDF, 10 Mo maximum. Le contenu réel du fichier est vérifié, pas seulement l'extension. Les fichiers sont stockés dans le volume Docker `uploads` sous un nom aléatoire ; ce sont des données personnelles, rien ne sort de la machine.

### Le bouton « Analyser »

1. Le recto et le verso (ou les deux premiers justificatifs) sont réduits en JPEG. Pour un PDF, c'est la première page, convertie avec `pdftoppm`.
2. Le modèle `vision` répond en JSON : est-ce le document attendu ? Quelle est sa nature, avec quelle confiance et pour quelles raisons ? Il renvoie aussi les champs qu'il a lus.
3. L'API compare les champs lus avec la fiche : noms (sans casse ni accents, mots dans n'importe quel ordre), dates, numéros, adresse. Elle ajoute des alertes : CNI expirée, justificatif KYC de plus de 3 mois, confiance inférieure à 60 %.
4. Verdict :
   - **Conforme** ;
   - **À vérifier** (écart avec la fiche ou alerte) ;
   - **Non conforme** (ce n'est pas le bon document).

L'analyse tourne **en tâche de fond**, une à la fois. Sur CPU, elle prend de 2 à 5 minutes, et un peu plus quand Ollama doit passer de qwen à gemma3. La page affiche « Analyse en cours » et se met à jour toute seule. Pendant l'analyse, la fiche et ses documents sont verrouillés. Toute modification ultérieure efface le résultat, puisqu'il ne correspond plus à la fiche.

C'est une **aide à la vérification** par un petit modèle local : il peut mal lire un champ. Le résultat ne remplace pas un contrôle humain.

## Démarrer (Docker)

Le backend doit tourner avec les deux modèles : `local` (`qwen2.5:3b`, appel d'outils) et `vision` (`gemma3:4b`). `model-init` les télécharge.

```powershell
cd backend;   docker compose up -d
cd ../frontend3; docker compose up -d --build
```

Ouvrir http://localhost:3002. Variables facultatives dans `frontend3/.env` : `FRONT_PORT` (3002), `DB_PORT` (5433, publié seulement sur 127.0.0.1) et `DB_PASSWORD`.

## API

| Méthode | Route | Corps / effet |
|---|---|---|
| GET | `/api/categories?q=texte` | liste, filtre optionnel sur le nom ou la description |
| GET | `/api/categories/:id` | une catégorie |
| POST | `/api/categories` | `{ "nom": "...", "description": "..." }` → 201 |
| PUT | `/api/categories/:id` | champs à modifier → 200 |
| DELETE | `/api/categories/:id` | 204 |
| GET | `/api/fiches/types` | définition des champs et des documents par type |
| GET | `/api/fiches?type=cni&q=texte&expirees=1` | liste (filtres facultatifs) |
| GET | `/api/fiches/:id` | une fiche, avec ses documents et sa dernière analyse |
| POST | `/api/fiches` | `{ "type": "cni", "donnees": { "nom": "...", ... } }` → 201 |
| PUT | `/api/fiches/:id` | `{ "donnees": { ... } }` (remplace tous les champs) → 200 |
| DELETE | `/api/fiches/:id` | supprime la fiche et ses fichiers → 204 |
| POST | `/api/fiches/:id/documents` | multipart : `role` (`recto`, `verso`, `justificatif`) + `fichier` → 201 |
| GET | `/api/fiches/:id/documents/:docId` | le fichier |
| DELETE | `/api/fiches/:id/documents/:docId` | 204 |
| POST | `/api/fiches/:id/analyse` | lance l'analyse → 202 ; suivre `analyse.statut` (`en_cours`, `termine`, `erreur`) |
| POST | `/api/chat` | `{ "messages": [{ "role": "user", "content": "..." }] }` → `{ reply, changed, pendingDelete }` |

Erreurs : `{ "error": "..." }`, avec les statuts 400 (validation), 404, 409 (nom déjà pris, analyse en cours) et 502 (LLM indisponible).

## Développement (rechargement à chaud)

La base et le backend tournent dans Docker. L'API et le front tournent en local :

```powershell
cd frontend3; docker compose up -d db
cd api; npm install; npm run dev     # :8080, lit la clé dans ../../backend/.env
cd ../web; npm install; npm run dev  # http://localhost:5175, /api relayé vers :8080
```

En local, les documents sont rangés dans `api/uploads/`, qui est ignoré par Git. L'analyse des PDF demande `pdftoppm` (poppler) dans le PATH ; il est déjà installé dans l'image Docker.

## Exemples pour le chatbot

- « Liste les catégories »
- « Crée une catégorie Électronique avec la description téléphones et ordinateurs »
- « Renomme Électronique en High-Tech »
- « Supprime High-Tech », puis bouton Confirmer
- « Liste les fiches CNI »
- « Quelles CNI sont expirées ? »
- « Analyse la fiche CNI de Kouassi »

La recherche par nom côté chatbot ignore la casse et les accents, et accepte un nom approchant s'il est unique. Sur CPU, comptez environ 10 à 20 s par réponse, et plus pour la première, le temps de charger le modèle.
