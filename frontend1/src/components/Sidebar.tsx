import { useState } from 'react';
import type { Conversation } from '../types';
import { Chat, Gear, PanelLeft, Pencil, Plus, Sparkle, Trash } from './Icons';

interface Props {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  online: boolean | null;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

function groupLabel(ts: number): string {
  const day = 86_400_000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (ts >= startOfToday) return "Aujourd'hui";
  if (ts >= startOfToday - day) return 'Hier';
  if (ts >= startOfToday - 7 * day) return '7 derniers jours';
  return 'Plus ancien';
}

export default function Sidebar({ open, conversations, activeId, online, onToggle, onNew, onSelect, onRename, onDelete, onOpenSettings }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const groups: { label: string; items: Conversation[] }[] = [];
  for (const c of sorted) {
    const label = groupLabel(c.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  const commitRename = () => {
    if (editingId && title.trim()) onRename(editingId, title.trim());
    setEditingId(null);
  };

  return (
    <>
      <div className={`backdrop${open ? ' show' : ''}`} onClick={onToggle} />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand">
            <Sparkle size={20} className="accent" />
            <span>Assistant local</span>
          </div>
          <button type="button" className="icon-btn" title="Fermer la barre latérale" onClick={onToggle}>
            <PanelLeft />
          </button>
        </div>

        <button type="button" className="new-chat" onClick={onNew}>
          <span className="new-chat-icon"><Plus size={14} strokeWidth={2.4} /></span>
          Nouvelle conversation
        </button>

        <nav className="conv-list">
          {conversations.length === 0 && <p className="empty">Aucune conversation pour l'instant.</p>}
          {groups.map((g) => (
            <div key={g.label} className="conv-group">
              <div className="conv-group-label">{g.label}</div>
              {g.items.map((c) => (
                <div key={c.id} className={`conv-item${c.id === activeId ? ' active' : ''}`}>
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <>
                      <button type="button" className="conv-link" onClick={() => onSelect(c.id)} title={c.title}>
                        <Chat size={15} />
                        <span>{c.title}</span>
                      </button>
                      <div className="conv-actions">
                        <button type="button" className="icon-btn sm" title="Renommer"
                          onClick={() => { setEditingId(c.id); setTitle(c.title); }}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="icon-btn sm" title="Supprimer"
                          onClick={() => { if (confirm(`Supprimer « ${c.title} » ?`)) onDelete(c.id); }}>
                          <Trash size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className={`status ${online === null ? '' : online ? 'ok' : 'ko'}`}>
            <span className="dot" />
            {online === null ? 'Connexion…' : online ? 'API connectée' : 'API hors ligne'}
          </span>
          <button type="button" className="icon-btn" title="Paramètres" onClick={onOpenSettings}>
            <Gear />
          </button>
        </div>
      </aside>
    </>
  );
}
