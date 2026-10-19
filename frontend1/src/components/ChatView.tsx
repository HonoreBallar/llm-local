import { useEffect, useRef, useState } from 'react';
import type { Conversation } from '../types';
import Composer from './Composer';
import MessageItem from './MessageItem';
import { Book, Bulb, Code, Feather, PanelLeft, Sparkle } from './Icons';

const SUGGESTIONS = [
  { icon: Feather, label: 'Écrire', prompt: 'Aide-moi à rédiger un e-mail professionnel pour ' },
  { icon: Book, label: 'Apprendre', prompt: 'Explique-moi simplement comment fonctionne ' },
  { icon: Code, label: 'Code', prompt: 'Écris une fonction Python qui ' },
  { icon: Bulb, label: 'Idées', prompt: 'Donne-moi 5 idées originales pour ' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5 || h >= 18) return 'Bonsoir';
  if (h < 12) return 'Bonjour';
  return 'Bon après-midi';
}

interface Props {
  conversation: Conversation | null;
  streamingId: string | null;
  online: boolean | null;
  models: string[];
  model: string;
  onModelChange: (m: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onEdit: (messageId: string, text: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function ChatView(props: Props) {
  const { conversation, streamingId, online, models, model, onModelChange, onSend, onStop, onRegenerate, onEdit, sidebarOpen, onToggleSidebar } = props;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const busy = streamingId !== null;
  const messages = conversation?.messages ?? [];

  // Défilement automatique, sauf si l'utilisateur est remonté dans l'historique.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    stickToBottom.current = true;
    setDraft('');
  }, [conversation?.id]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    stickToBottom.current = true;
    onSend(text);
    setDraft('');
  };

  const composer = (
    <Composer
      value={draft}
      onChange={setDraft}
      onSend={send}
      onStop={onStop}
      streaming={busy}
      models={models}
      model={model}
      onModelChange={onModelChange}
      placeholder={conversation ? 'Répondre…' : 'Comment puis-je t’aider ?'}
    />
  );

  const offline = online === false && (
    <div className="offline-banner">
      L'API ne répond pas. Lance le backend : <code>cd backend && docker compose up -d</code>
    </div>
  );

  return (
    <main className="main">
      <header className="topbar">
        {!sidebarOpen && (
          <button type="button" className="icon-btn" title="Ouvrir la barre latérale" onClick={onToggleSidebar}>
            <PanelLeft />
          </button>
        )}
        <span className="topbar-title">{conversation?.title ?? ''}</span>
      </header>

      {!conversation ? (
        <div className="welcome">
          <h1 className="welcome-title">
            <Sparkle size={34} className="accent" />
            {greeting()}
          </h1>
          <div className="welcome-composer">
            {offline}
            {composer}
          </div>
          <div className="chips">
            {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
              <button key={label} type="button" className="chip" onClick={() => setDraft(prompt)}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div
            className="scroll"
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            <div className="thread">
              {messages.map((m, i) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  streaming={m.id === streamingId}
                  isLast={i === messages.length - 1}
                  busy={busy}
                  onRegenerate={onRegenerate}
                  onEdit={(text) => onEdit(m.id, text)}
                />
              ))}
            </div>
          </div>
          <div className="bottom">
            {offline}
            {composer}
            <p className="disclaimer">Modèle local : les réponses peuvent contenir des erreurs.</p>
          </div>
        </>
      )}
    </main>
  );
}
