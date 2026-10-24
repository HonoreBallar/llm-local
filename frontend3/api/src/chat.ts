import {
  createCategory,
  findCategoryByName,
  listCategories,
  updateCategory,
} from './categories.js';
import { HttpError } from './http.js';
import { startAnalyse } from './fiches/analyse.js';
import { findFicheByName, fullName, listFiches } from './fiches/repo.js';
import { FICHE_TYPES, isFicheType } from './fiches/schema.js';
import { completion, type ToolCall } from './llm.js';

const MODEL = process.env.LLM_MODEL_ALIAS || 'local';
const MAX_STEPS = 5;
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `Tu es l'assistant d'une application qui gère des catégories et des fiches clients (fiches CNI et fiches KYC).
Tu réponds toujours en français, de façon brève.
Pour lire ou modifier les catégories, utilise UNIQUEMENT les outils fournis ; n'invente jamais de catégorie ni de résultat.
- Avant de répondre sur le contenu de la liste, appelle list_categories.
- Pour supprimer, appelle delete_category : la suppression n'est faite qu'après confirmation de l'utilisateur via un bouton. Ne dis donc jamais qu'elle est faite, demande-lui de confirmer.
- Si un outil renvoie une erreur, explique-la simplement à l'utilisateur.
- Recopie les noms et descriptions EXACTEMENT comme l'utilisateur les écrit (majuscules, accents, espaces). Si une description est donnée, passe-la à l'outil.
- Fiches : list_fiches pour les chercher (par type, nom, ou CNI expirées), analyse_fiche pour vérifier que le document joint est bien le bon (CNI ivoirienne ou justificatif KYC). L'analyse prend quelques minutes : dis à l'utilisateur que le résultat apparaîtra sur la fiche.
- Si la demande n'a rien à voir avec les catégories ou les fiches, réponds poliment que tu ne gères que cela.`;

// Format OpenAI (tool calling), traduit par LiteLLM pour Ollama.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Liste les catégories existantes, éventuellement filtrées par un texte.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Texte à chercher dans le nom ou la description (optionnel).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Crée une nouvelle catégorie.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom exact de la catégorie, avec majuscules et accents.' },
          description: {
            type: 'string',
            description: "Description de la catégorie, si l'utilisateur en donne une.",
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_category',
      description: "Renomme une catégorie et/ou change sa description. Identifie la catégorie par son nom actuel.",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom actuel de la catégorie à modifier (seulement le nom).' },
          new_name: { type: 'string', description: 'Nouveau nom exact, avec majuscules et accents (optionnel).' },
          description: { type: 'string', description: 'Nouvelle description (optionnelle).' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: "Demande la suppression d'une catégorie (l'utilisateur devra confirmer).",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom de la catégorie à supprimer.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_fiches',
      description: 'Liste les fiches clients (CNI et/ou KYC), avec le résultat de leur dernière analyse.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['cni', 'kyc'], description: 'Type de fiche (optionnel).' },
          search: { type: 'string', description: 'Nom, prénom, numéro… à chercher (optionnel).' },
          expired_only: { type: 'boolean', description: 'true pour ne garder que les CNI expirées.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyse_fiche',
      description: "Lance l'analyse du document joint à une fiche pour vérifier que c'est bien le bon document.",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom et/ou prénoms de la personne de la fiche.' },
          type: { type: 'string', enum: ['cni', 'kyc'], description: 'Type de fiche, si précisé (optionnel).' },
        },
        required: ['name'],
      },
    },
  },
];

type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface PendingDelete {
  id: number;
  nom: string;
}

export interface ChatResult {
  reply: string;
  changed: boolean; // la base a été modifiée : le front recharge le tableau
  pendingDelete: PendingDelete | null;
}

const VERDICTS: Record<string, string> = {
  conforme: 'conforme',
  a_verifier: 'à vérifier',
  non_conforme: 'non conforme (mauvais document)',
};

function describeAnalyse(a: Record<string, unknown> | null): string {
  if (!a) return 'non analysée';
  if (a.statut === 'en_cours') return 'analyse en cours';
  if (a.statut === 'erreur') return `échec de l'analyse : ${a.message}`;
  return VERDICTS[String(a.verdict)] ?? 'inconnue';
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  state: { changed: boolean; pendingDelete: PendingDelete | null },
): Promise<unknown> {
  switch (name) {
    case 'list_categories': {
      const rows = await listCategories(str(args.search));
      return rows.map((c) => ({ nom: c.nom, description: c.description }));
    }
    case 'create_category': {
      // Les petits modèles confondent parfois les noms de paramètres : on accepte les variantes.
      const c = await createCategory({
        nom: args.name,
        description: str(args.description) ?? str(args.new_description),
      });
      state.changed = true;
      return { ok: true, creee: { nom: c.nom, description: c.description } };
    }
    case 'update_category': {
      const current = await findCategoryByName(String(args.name ?? args.current_name ?? ''));
      const c = await updateCategory(current.id, {
        nom: str(args.new_name),
        description: str(args.description) ?? str(args.new_description),
      });
      state.changed = true;
      return { ok: true, modifiee: { nom: c.nom, description: c.description } };
    }
    case 'delete_category': {
      // Jamais exécutée ici : le front affiche un bouton de confirmation.
      const c = await findCategoryByName(String(args.name ?? ''));
      state.pendingDelete = { id: c.id, nom: c.nom };
      return {
        ok: true,
        statut: `La suppression de « ${c.nom} » n'est PAS encore faite. Demande à l'utilisateur de cliquer sur le bouton Confirmer.`,
      };
    }
    case 'list_fiches': {
      const type = isFicheType(args.type) ? args.type : undefined;
      const rows = await listFiches({ type, q: str(args.search), expirees: args.expired_only === true });
      return rows.map((f) => ({
        type: f.type.toUpperCase(),
        nom: fullName(f.donnees),
        reference: f.donnees[FICHE_TYPES[f.type].reference] ?? null,
        ...(f.type === 'cni' ? { date_expiration: f.donnees.date_expiration ?? null } : {}),
        documents: f.nb_documents,
        analyse: describeAnalyse(f.analyse),
      }));
    }
    case 'analyse_fiche': {
      const type = isFicheType(args.type) ? args.type : undefined;
      const fiche = await findFicheByName(String(args.name ?? ''), type);
      await startAnalyse(fiche.id);
      state.changed = true;
      return {
        ok: true,
        statut: `Analyse de la fiche ${fiche.type.toUpperCase()} de ${fullName(fiche.donnees)} lancée. Le résultat apparaîtra sur la fiche dans quelques minutes.`,
      };
    }
    default:
      throw new HttpError(400, `Outil inconnu : ${name}`);
  }
}

const callLlm = (messages: LlmMessage[]) =>
  completion({ model: MODEL, messages, tools: TOOLS, temperature: 0 }, 300_000);

export async function chat(history: ChatInput[]): Promise<ChatResult> {
  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
  ];
  const state = { changed: false, pendingDelete: null as PendingDelete | null };

  for (let step = 0; step < MAX_STEPS; step++) {
    const answer = await callLlm(messages);
    const calls = answer.tool_calls ?? [];
    if (!calls.length) {
      return { reply: answer.content?.trim() || "Je n'ai pas compris, peux-tu reformuler ?", ...state };
    }

    messages.push({ role: 'assistant', content: answer.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let result: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        console.log('Outil', call.function.name, JSON.stringify(args));
        result = await runTool(call.function.name, args, state);
      } catch (err) {
        result = { erreur: err instanceof HttpError ? err.message : 'Erreur interne.' };
        if (!(err instanceof HttpError)) console.error(err);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "J'ai fait plusieurs actions sans arriver au bout, peux-tu préciser ?", ...state };
}
