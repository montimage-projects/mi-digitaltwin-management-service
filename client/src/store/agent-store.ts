import { create } from 'zustand';
import {
  agentApi,
  type AgentConversationMessage,
  type AgentConversationSummary,
  type AgentHealth,
} from '@/lib/agent-api';
import { toast } from 'sonner';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sources?: Array<{
    serviceId: string;
    shortName: string;
    title: string;
    score: number;
  }>;
}

interface AgentState {
  isOpen: boolean;
  conversations: AgentConversationSummary[];
  activeConversationId: string | null;
  messages: AgentMessage[];
  isStreaming: boolean;
  agentHealth: AgentHealth | null;
  loadingConversations: boolean;
  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  loadConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  newConversation: () => void;
  sendMessage: (message: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
}

function toAgentMessage(message: AgentConversationMessage, index: number): AgentMessage {
  return {
    id: `history-${index}-${message.timestamp}`,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    sources: message.sources,
  };
}

export const useAgentStore = create<AgentState>((set, get) => ({
  isOpen: false,
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  agentHealth: null,
  loadingConversations: false,

  togglePanel: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  setOpen: (open) => {
    set({ isOpen: open });
  },

  loadConversations: async () => {
    set({ loadingConversations: true });
    try {
      const conversations = await agentApi.listConversations();
      set({ conversations });
    } finally {
      set({ loadingConversations: false });
    }
  },

  loadConversation: async (conversationId) => {
    try {
      const detail = await agentApi.getConversation(conversationId);
      const safeMessages = Array.isArray(detail?.messages)
        ? detail.messages.map(toAgentMessage)
        : [];

      set({
        activeConversationId: conversationId,
        messages: safeMessages,
      });
    } catch {
      set({
        activeConversationId: conversationId,
        messages: [],
      });
    }
  },

  newConversation: () => {
    set({ activeConversationId: null, messages: [] });
  },

  sendMessage: async (message) => {
    const trimmed = message.trim();
    if (!trimmed || get().isStreaming) {
      return;
    }

    const now = new Date().toISOString();
    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: now,
    };
    const assistantMessageId = `assistant-${Date.now()}`;

    set((state) => ({
      isStreaming: true,
      messages: [
        ...state.messages,
        userMessage,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: now,
        },
      ],
    }));

    let nextConversationId = get().activeConversationId;

    try {
      const stream = await agentApi.sendMessage(trimmed, get().activeConversationId || undefined);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n\n')) {
          const separatorIndex = buffer.indexOf('\n\n');
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const lines = rawEvent.split('\n');
          const eventLine = lines.find((line) => line.startsWith('event:'));
          const dataLine = lines.find((line) => line.startsWith('data:'));

          if (!eventLine || !dataLine) {
            continue;
          }

          const eventType = eventLine.replace('event:', '').trim();
          const jsonPayload = dataLine.replace('data:', '').trim();

          let parsedData: unknown;
          try {
            parsedData = JSON.parse(jsonPayload);
          } catch {
            continue;
          }

          if (eventType === 'metadata') {
            const data = parsedData as { conversationId: string };
            nextConversationId = data.conversationId;
            set({ activeConversationId: data.conversationId });
            continue;
          }

          if (eventType === 'token') {
            const data = parsedData as { content: string };
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: `${msg.content}${data.content}` }
                  : msg
              ),
            }));
            continue;
          }

          if (eventType === 'sources') {
            const data = parsedData as AgentMessage['sources'];
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, sources: data } : msg
              ),
            }));
            continue;
          }

          if (eventType === 'error') {
            const data = parsedData as { message: string };
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content || `Error: ${data.message}` }
                  : msg
              ),
            }));
          }
        }
      }
    } catch (error) {
      // Handle streaming errors gracefully — show error in the assistant message
      // instead of crashing the React app with an unhandled rejection.
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to communicate with the agent';
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content || `Error: ${errorMessage}` }
            : msg
        ),
      }));
      toast.error('Agent communication failed');
    } finally {
      set({ isStreaming: false, activeConversationId: nextConversationId || null });
      // Only refresh the conversation list sidebar — do NOT reload the active
      // conversation content, as the server may not have persisted the assistant
      // message yet and we would wipe the streamed tokens the user just saw.
      try {
        await get().loadConversations();
      } catch {
        // Sidebar refresh is non-critical; silently ignore
      }
    }
  },

  deleteConversation: async (conversationId) => {
    await agentApi.deleteConversation(conversationId);
    const isCurrent = get().activeConversationId === conversationId;
    if (isCurrent) {
      set({ activeConversationId: null, messages: [] });
    }
    await get().loadConversations();
  },

  refreshHealth: async () => {
    try {
      const agentHealth = await agentApi.checkAgentHealth();
      set({ agentHealth });
    } catch {
      set({
        agentHealth: {
          status: 'offline',
          ollama: false,
          chatModel: { name: 'unknown', available: false },
          embedModel: { name: 'unknown', available: false },
          availableModels: [],
          error: 'Failed to reach agent backend',
        },
      });
    }
  },
}));
