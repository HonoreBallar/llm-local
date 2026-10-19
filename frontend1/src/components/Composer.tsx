import { useEffect, useRef } from 'react';
import { ArrowUp, Stop } from './Icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  models: string[];
  model: string;
  onModelChange: (m: string) => void;
  placeholder?: string;
}

export default function Composer({ value, onChange, onSend, onStop, streaming, models, model, onModelChange, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Hauteur automatique, plafonnée par le CSS (max-height).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const canSend = value.trim().length > 0 && !streaming;
  const modelList = models.includes(model) ? models : [model, ...models];

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      onClick={() => ref.current?.focus()}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder ?? 'Écris ton message…'}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="composer-bar">
        <span className="composer-hint">Entrée pour envoyer · Maj+Entrée pour aller à la ligne</span>
        <div className="composer-right">
          <select
            className="model-select"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            title="Modèle"
          >
            {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {streaming ? (
            <button type="button" className="send-btn" title="Arrêter" onClick={onStop}>
              <Stop size={16} />
            </button>
          ) : (
            <button type="submit" className="send-btn" title="Envoyer" disabled={!canSend}>
              <ArrowUp size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
