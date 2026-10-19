import { useEffect, useRef, useState } from 'react';
import type { Message } from '../types';
import Markdown from './Markdown';
import { Check, Copy, Pencil, Refresh, Sparkle } from './Icons';

function Thinking() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="thinking">
      <Sparkle size={20} className="thinking-spark" />
      {seconds >= 5 && (
        <span>{seconds < 20 ? 'Réflexion…' : 'Chargement du modèle en mémoire…'} {seconds} s</span>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      title="Copier"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

interface Props {
  message: Message;
  streaming: boolean;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
}

export default function MessageItem({ message, streaming, isLast, busy, onRegenerate, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      const el = editRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  if (message.role === 'user') {
    if (editing) {
      return (
        <div className="msg msg-user">
          <div className="edit-box">
            <textarea
              ref={editRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
            />
            <div className="edit-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setDraft(message.content); }}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!draft.trim()}
                onClick={() => { setEditing(false); onEdit(draft.trim()); }}
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="msg msg-user">
        <div className="bubble">{message.content}</div>
        <div className="msg-actions">
          <CopyButton text={message.content} />
          {!busy && (
            <button type="button" className="icon-btn" title="Modifier" onClick={() => setEditing(true)}>
              <Pencil size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`msg msg-assistant${isLast ? ' is-last' : ''}`}>
      {message.error ? (
        <div className="error-box">
          <p>{message.content || 'La génération a échoué.'}</p>
          {!busy && <button type="button" className="btn btn-ghost" onClick={onRegenerate}>Réessayer</button>}
        </div>
      ) : message.content ? (
        <>
          <Markdown text={message.content} />
          {streaming && <span className="caret" />}
        </>
      ) : streaming ? (
        <Thinking />
      ) : (
        <p className="muted">Réponse interrompue.</p>
      )}
      {!streaming && !message.error && message.content && (
        <div className="msg-actions">
          <CopyButton text={message.content} />
          {isLast && !busy && (
            <button type="button" className="icon-btn" title="Régénérer" onClick={onRegenerate}>
              <Refresh size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
