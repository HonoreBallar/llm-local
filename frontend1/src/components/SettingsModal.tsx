import { useEffect, useState } from 'react';
import type { Settings, Theme } from '../types';
import { defaultSettings } from '../storage';
import { X } from './Icons';

interface Props {
  settings: Settings;
  models: string[];
  onSave: (s: Settings) => void;
  onClose: () => void;
  onClearAll: () => void;
}

export default function SettingsModal({ settings, models, onSave, onClose, onClearAll }: Props) {
  const [s, setS] = useState(settings);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const modelList = models.includes(s.model) ? models : [s.model, ...models];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="settings-title">Paramètres</h2>
          <button type="button" className="icon-btn" title="Fermer" onClick={onClose}><X /></button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>Modèle</span>
            <select value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>
              {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Instructions système</span>
            <textarea
              rows={4}
              value={s.systemPrompt}
              placeholder="Ex. : Tu es un expert Python, réponds de façon concise."
              onChange={(e) => setS({ ...s, systemPrompt: e.target.value })}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Température : {s.temperature.toFixed(1)}</span>
              <input type="range" min={0} max={2} step={0.1} value={s.temperature}
                onChange={(e) => setS({ ...s, temperature: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Longueur max (tokens)</span>
              <input type="number" min={64} max={8192} step={64} value={s.maxTokens}
                onChange={(e) => setS({ ...s, maxTokens: Number(e.target.value) || defaultSettings.maxTokens })} />
            </label>
          </div>

          <div className="field">
            <span>Thème</span>
            <div className="segmented">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button key={t} type="button" className={s.theme === t ? 'on' : ''} onClick={() => setS({ ...s, theme: t })}>
                  {t === 'system' ? 'Système' : t === 'light' ? 'Clair' : 'Sombre'}
                </button>
              ))}
            </div>
          </div>

          <div className="danger-zone">
            <span>Effacer toutes les conversations enregistrées dans ce navigateur.</span>
            <button type="button" className="btn btn-danger"
              onClick={() => { if (confirm('Supprimer toutes les conversations ?')) { onClearAll(); onClose(); } }}>
              Tout effacer
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setS(defaultSettings)}>Réinitialiser</button>
          <button type="button" className="btn btn-primary" onClick={() => { onSave(s); onClose(); }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
