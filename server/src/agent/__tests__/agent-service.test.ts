import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat = vi.fn();
const isServiceQuery = vi.fn();
const retrieveSimilar = vi.fn();
const formatContextForPrompt = vi.fn();
vi.mock('../index.js', () => ({
  getLLMGateway: () => ({ chat }),
  getIntentClassifier: () => ({ isServiceQuery }),
  getRAGRetriever: () => ({
    retrieveSimilar,
    formatContextForPrompt,
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
  beforeEach(() => {
    chat.mockReset();
    isServiceQuery.mockReset().mockResolvedValue(false);
    retrieveSimilar.mockReset().mockResolvedValue([]);
    formatContextForPrompt
      .mockReset()
      .mockReturnValue('No relevant services were retrieved from the catalog.');
  });

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

  it('injects fresh catalog context before a follow-up and stores its citations', async () => {
    const service = {
      serviceId: 'service-1',
      shortName: 'MMT',
      title: 'MMT Probe',
      score: 0.95,
    };
    isServiceQuery.mockResolvedValue(true);
    retrieveSimilar.mockResolvedValue([service]);
    formatContextForPrompt.mockReturnValue('MMT Probe monitors network traffic.');
    chat.mockResolvedValue('Use MMT Probe.');
    const { manager, messages } = fakeConversationManager();
    messages.push(
      { role: 'user', content: 'Which tools are available?' },
      { role: 'assistant', content: 'Several tools are available.' }
    );

    const result = await new AgentService(manager).chat('user-1', 'What monitors traffic?');

    expect(retrieveSimilar).toHaveBeenCalledWith('What monitors traffic?', 4);
    expect(formatContextForPrompt).toHaveBeenCalledWith([service]);
    const prompt = chat.mock.calls[0][0];
    expect(prompt[0]).toEqual({ role: 'system', content: BOSS_AGENT_SYSTEM_PROMPT });
    expect(prompt.at(-2)).toMatchObject({ role: 'system' });
    expect(prompt.at(-2).content).toContain('MMT Probe monitors network traffic.');
    expect(prompt.at(-1)).toEqual({ role: 'user', content: 'What monitors traffic?' });
    expect(result.sources).toEqual([service]);
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Use MMT Probe.',
      sources: [service],
    });
  });

  it('continues answering when catalog retrieval is unavailable', async () => {
    isServiceQuery.mockResolvedValue(true);
    retrieveSimilar.mockRejectedValue(new Error('Vector store unavailable'));
    chat.mockResolvedValue('I can help with your scenario.');
    const { manager, messages } = fakeConversationManager();

    const result = await new AgentService(manager).chat('user-1', 'Which tools can I use?');

    expect(result.sources).toEqual([]);
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'I can help with your scenario.',
      sources: [],
    });
  });
});

describe('BOSS_AGENT_SYSTEM_PROMPT', () => {
  it('restricts offensive tools to in-platform scenario targets', () => {
    expect(BOSS_AGENT_SYSTEM_PROMPT).toMatch(/only be used against targets inside the platform/);
    expect(BOSS_AGENT_SYSTEM_PROMPT).toMatch(/Never reveal credentials/);
  });
});
