import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat = vi.fn();
vi.mock('../index.js', () => ({
  getLLMGateway: () => ({ chat }),
  getIntentClassifier: () => ({ isServiceQuery: async () => false }),
  getRAGRetriever: () => ({
    retrieveSimilar: async () => [],
    formatContextForPrompt: () => 'No relevant services were retrieved from the catalog.',
  }),
}));

import { AgentService } from '../agent-service.js';
import type { ConversationManager } from '../conversation-manager.js';
import { BOSS_AGENT_SYSTEM_PROMPT, EMPTY_ANSWER_FALLBACK } from '../prompts.js';

function fakeConversationManager() {
  const messages: { role: string; content: string }[] = [];
  const manager = {
    create: vi.fn(async () => 'conv-1'),
    getHistory: vi.fn(async () => ({ messages })),
    addMessage: vi.fn(async (_id: string, message: { role: string; content: string }) => {
      messages.push(message);
    }),
    ensureTitleFromFirstUserMessage: vi.fn(async () => undefined),
  };
  return { manager: manager as unknown as ConversationManager, messages };
}

describe('AgentService.chat', () => {
  beforeEach(() => chat.mockReset());

  it('stores and streams a fallback when the model returns an empty answer', async () => {
    chat.mockResolvedValue('   ');
    const { manager, messages } = fakeConversationManager();
    const tokens: string[] = [];

    await new AgentService(manager).chat('user-1', 'Hello', undefined, (t) => tokens.push(t));

    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: EMPTY_ANSWER_FALLBACK });
    expect(tokens).toEqual([EMPTY_ANSWER_FALLBACK]);
  });

  it('stores the model answer unchanged when it is not empty', async () => {
    chat.mockResolvedValue('Hi there!');
    const { manager, messages } = fakeConversationManager();

    await new AgentService(manager).chat('user-1', 'Hello');

    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Hi there!' });
  });
});

describe('BOSS_AGENT_SYSTEM_PROMPT', () => {
  it('restricts offensive tools to in-platform scenario targets', () => {
    expect(BOSS_AGENT_SYSTEM_PROMPT).toMatch(/only be used against targets inside the platform/);
    expect(BOSS_AGENT_SYSTEM_PROMPT).toMatch(/Never reveal credentials/);
  });
});

describe('AgentService.chat promptMode (eval-only ablation)', () => {
  beforeEach(() => chat.mockReset().mockResolvedValue('ok'));
  const sent = () => chat.mock.calls[0][0] as { role: string; content: string }[];

  it("'none' without retrieval sends only the conversation (no system messages)", async () => {
    await new AgentService(fakeConversationManager().manager).chat(
      'u',
      'Hello',
      undefined,
      undefined,
      {
        useRag: false,
        promptMode: 'none',
      }
    );
    expect(sent().every((m) => m.role !== 'system')).toBe(true);
  });

  it("'none' with retrieval drops the Boss Agent prompt but keeps the context", async () => {
    await new AgentService(fakeConversationManager().manager).chat(
      'u',
      'Hello',
      undefined,
      undefined,
      {
        useRag: true,
        promptMode: 'none',
      }
    );
    expect(sent().some((m) => m.content === BOSS_AGENT_SYSTEM_PROMPT)).toBe(false);
    expect(
      sent().some((m) => m.role === 'system' && m.content.includes('Repository context'))
    ).toBe(true);
  });

  it('default keeps the Boss Agent prompt', async () => {
    await new AgentService(fakeConversationManager().manager).chat('u', 'Hello');
    expect(sent()[0]).toMatchObject({ role: 'system', content: BOSS_AGENT_SYSTEM_PROMPT });
  });
});
