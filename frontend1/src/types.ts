export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  theme: Theme;
}
