import type {
  Category,
  CategoryInput,
  ChatMessage,
  ChatResult,
  Donnees,
  Fiche,
  FicheDocument,
  FicheType,
  TypeDef,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    // FormData : le navigateur pose lui-même le Content-Type (avec la frontière multipart).
    headers: isForm ? init?.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  list: (q?: string) =>
    request<Category[]>(`/categories${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (input: CategoryInput) => request<Category>('/categories', json('POST', input)),
  update: (id: number, input: CategoryInput) => request<Category>(`/categories/${id}`, json('PUT', input)),
  remove: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
  chat: (messages: ChatMessage[]) =>
    request<ChatResult>(
      '/chat',
      json('POST', {
        messages: messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
      }),
    ),
};

export const fichesApi = {
  types: () => request<TypeDef[]>('/fiches/types'),
  list: (filter: { type?: FicheType; q?: string; expirees?: boolean }) => {
    const p = new URLSearchParams();
    if (filter.type) p.set('type', filter.type);
    if (filter.q) p.set('q', filter.q);
    if (filter.expirees) p.set('expirees', '1');
    return request<Fiche[]>(`/fiches?${p}`);
  },
  get: (id: number) => request<Fiche>(`/fiches/${id}`),
  create: (type: FicheType, donnees: Donnees) => request<Fiche>('/fiches', json('POST', { type, donnees })),
  update: (id: number, donnees: Donnees) => request<Fiche>(`/fiches/${id}`, json('PUT', { donnees })),
  remove: (id: number) => request<void>(`/fiches/${id}`, { method: 'DELETE' }),
  upload: (id: number, role: string, file: File) => {
    const form = new FormData();
    form.append('role', role);
    form.append('fichier', file);
    return request<FicheDocument>(`/fiches/${id}/documents`, { method: 'POST', body: form });
  },
  removeDocument: (id: number, docId: number) =>
    request<void>(`/fiches/${id}/documents/${docId}`, { method: 'DELETE' }),
  documentUrl: (id: number, docId: number) => `/api/fiches/${id}/documents/${docId}`,
  analyse: (id: number) => request<Fiche>(`/fiches/${id}/analyse`, { method: 'POST' }),
};
