import api from './api';
import { useAuthStore } from '@/store/auth-store';

export interface AgentHealth {
  status: 'healthy' | 'degraded' | 'offline';
  ollama: boolean;
  chatModel: { name: string; available: boolean };
  embedModel: { name: string; available: boolean };
  availableModels: string[];
  error?: string;
}

export interface AgentConversationSummary {
  _id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Array<{
    serviceId: string;
    shortName: string;
    title: string;
    score: number;
  }>;
}

export interface AgentConversationDetail {
  _id: string;
  title: string;
  messages: AgentConversationMessage[];
  updatedAt: string;
}

export type AgentSSEEvent =
  | { type: 'metadata'; data: { conversationId: string; messageId: string } }
  | { type: 'token'; data: { content: string } }
  | {
      type: 'sources';
      data: Array<{ serviceId: string; shortName: string; title: string; score: number }>;
    }
  | { type: 'done'; data: { ok: boolean } }
  | { type: 'error'; data: { message: string; code: string } };

export const agentApi = {
  async sendMessage(message: string, conversationId?: string): Promise<ReadableStream<Uint8Array>> {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('No auth token available');
    }

    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(bodyText || `Agent chat failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('SSE stream not available');
    }
    return response.body;
  },

  async listConversations(): Promise<AgentConversationSummary[]> {
    const { data } = await api.get('/agent/conversations');
    return data;
  },

  async getConversation(id: string): Promise<AgentConversationDetail> {
    const { data } = await api.get(`/agent/conversations/${id}`);
    return data;
  },

  async deleteConversation(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/agent/conversations/${id}`);
    return data;
  },

  async checkAgentHealth(): Promise<AgentHealth> {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error('No auth token available');
    }

    const response = await fetch('/api/agent/health', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const body = (await response.json()) as AgentHealth;
    return body;
  },

  async triggerReindex(): Promise<{ indexed: number; duration: number }> {
    const { data } = await api.post('/agent/rag/reindex');
    return data;
  },
};
