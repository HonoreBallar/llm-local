import type { Conversation, Settings } from './types';

const CONV_KEY = 'llm-local.conversations';
const SETTINGS_KEY = 'llm-local.settings';

export const defaultSettings: Settings = {
  model: 'local',
  systemPrompt: "Tu es un assistant utile et précis. Réponds dans la langue de l'utilisateur.",
  temperature: 0.7,
  maxTokens: 2048,
  theme: 'system',
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConversations(convs: Conversation[]): void {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(convs));
  } catch {
    /* stockage indisponible ou plein */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible */
  }
}
