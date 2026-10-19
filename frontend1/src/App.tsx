import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsModal from './components/SettingsModal';
import { checkHealth, listModels, streamChat, type ChatMessage } from './api';
import { loadConversations, loadSettings, saveConversations, saveSettings, uid } from './storage';
import type { Conversation, Message, Settings } from './types';

const isMobile = () => window.innerWidth <= 768;

function makeTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 48)}…` : oneLine;
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [models, setModels] = useState<string[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => saveConversations(conversations), [conversations]);
  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Surveille l'état de l'API et récupère la liste des modèles quand elle répond.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const ok = await checkHealth();
      if (cancelled) return;
      setOnline(ok);
      if (ok) listModels().then((m) => !cancelled && setModels(m)).catch(() => {});
    };
    poll();
    const t = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const updateConv = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const updateMessage = useCallback((convId: string, msgId: string, fn: (m: Message) => Message) => {
    updateConv(convId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) }));
  }, [updateConv]);

  // Lance une génération à partir d'un historique se terminant par un message utilisateur.
  const run = async (convId: string, history: Message[]) => {
    const reply: Message = { id: uid(), role: 'assistant', content: '', createdAt: Date.now() };
    updateConv(convId, (c) => ({ ...c, messages: [...history, reply], updatedAt: Date.now() }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreamingId(reply.id);

    const payload: ChatMessage[] = [
      ...(settings.systemPrompt.trim() ? [{ role: 'system' as const, content: settings.systemPrompt.trim() }] : []),
      ...history.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content })),
    ];

    try {
      await streamChat({
        model: settings.model,
        messages: payload,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        signal: ctrl.signal,
        onToken: (t) => updateMessage(convId, reply.id, (m) => ({ ...m, content: m.content + t })),
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const msg = (e as Error).message;
        const text = msg === 'Failed to fetch' ? "Impossible de joindre l'API. Le backend est-il démarré ?" : msg;
        updateMessage(convId, reply.id, (m) => (m.content ? m : { ...m, content: text, error: true }));
      }
    } finally {
      abortRef.current = null;
      setStreamingId(null);
    }
  };

  const send = (text: string) => {
    if (streamingId) return;
    const userMsg: Message = { id: uid(), role: 'user', content: text, createdAt: Date.now() };
    if (active) {
      run(active.id, [...active.messages, userMsg]);
      return;
    }
    const conv: Conversation = { id: uid(), title: makeTitle(text), messages: [userMsg], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations((cs) => [conv, ...cs]);
    setActiveId(conv.id);
    run(conv.id, [userMsg]);
  };

  const regenerate = () => {
    if (!active || streamingId) return;
    const msgs = active.messages;
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === 'assistant') end--;
    if (end > 0) run(active.id, msgs.slice(0, end));
  };

  const edit = (messageId: string, text: string) => {
    if (!active || streamingId) return;
    const idx = active.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    run(active.id, [...active.messages.slice(0, idx), { ...active.messages[idx], content: text }]);
  };

  const stop = () => abortRef.current?.abort();

  const select = (id: string | null) => {
    if (streamingId) stop();
    setActiveId(id);
    if (isMobile()) setSidebarOpen(false);
  };

  const remove = (id: string) => {
    if (id === activeId) select(null);
    setConversations((cs) => cs.filter((c) => c.id !== id));
  };

  return (
    <div className={`app${sidebarOpen ? ' with-sidebar' : ''}`}>
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        online={online}
        onToggle={() => setSidebarOpen((o) => !o)}
        onNew={() => select(null)}
        onSelect={select}
        onRename={(id, title) => updateConv(id, (c) => ({ ...c, title }))}
        onDelete={remove}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ChatView
        conversation={active}
        streamingId={streamingId}
        online={online}
        models={models}
        model={settings.model}
        onModelChange={(model) => setSettings((s) => ({ ...s, model }))}
        onSend={send}
        onStop={stop}
        onRegenerate={regenerate}
        onEdit={edit}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      {showSettings && (
        <SettingsModal
          settings={settings}
          models={models}
          onSave={setSettings}
          onClose={() => setShowSettings(false)}
          onClearAll={() => { select(null); setConversations([]); }}
        />
      )}
    </div>
  );
}
