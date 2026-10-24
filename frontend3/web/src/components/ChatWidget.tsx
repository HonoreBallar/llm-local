import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../api';
import type { ChatMessage, PendingDelete } from '../types';

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    'Bonjour ! Je peux lister, créer, modifier ou supprimer des catégories. Par exemple : « crée une catégorie Livres ».',
};

const SUGGESTIONS = ['Liste les catégories', 'Crée une catégorie Sport', 'Renomme Sport en Sports'];

export default function ChatWidget({ onDataChanged }: { onDataChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const say = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setPending(null);
    setInput('');
    // Le message d'accueil est local : on ne l'envoie pas au LLM.
    const history = [...messages, { role: 'user' as const, content }];
    setMessages(history);
    setBusy(true);
    try {
      const result = await api.chat(history.slice(1));
      say({ role: 'assistant', content: result.reply });
      setPending(result.pendingDelete);
      if (result.changed) onDataChanged();
    } catch (err) {
      say({ role: 'assistant', content: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pending) return;
    const target = pending;
    setPending(null);
    try {
      await api.remove(target.id);
      say({ role: 'assistant', content: `La catégorie « ${target.nom} » a été supprimée.` });
      onDataChanged();
    } catch (err) {
      say({ role: 'assistant', content: (err as Error).message, error: true });
    }
  }

  function cancelDelete() {
    if (pending) say({ role: 'assistant', content: `Suppression de « ${pending.nom} » annulée.` });
    setPending(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <>
      {open && (
        <section className="chat-panel" aria-label="Assistant">
          <header className="chat-header">
            <div>
              <strong>Assistant</strong>
              <span className="chat-model">LLM local</span>
            </div>
            <button
              className="icon-btn"
              title="Nouvelle conversation"
              onClick={() => {
                setMessages([WELCOME]);
                setPending(null);
              }}
            >
              ↺
            </button>
          </header>

          <div className="chat-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg msg-${m.role}${m.error ? ' msg-error' : ''}`}>
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="pending">
                <span>
                  Supprimer « <strong>{pending.nom}</strong> » ?
                </span>
                <div className="pending-actions">
                  <button className="btn btn-sm" onClick={cancelDelete}>
                    Annuler
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={confirmDelete}>
                    Confirmer
                  </button>
                </div>
              </div>
            )}
            {busy && (
              <div className="msg msg-assistant typing" aria-label="L'assistant réfléchit">
                <span />
                <span />
                <span />
              </div>
            )}
            {messages.length === 1 && !busy && (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="chat-input" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder="Écrivez votre demande…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Envoyer">
              ↑
            </button>
          </form>
        </section>
      )}

      <button
        className={`chat-fab${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
      >
        {open ? '✕' : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
