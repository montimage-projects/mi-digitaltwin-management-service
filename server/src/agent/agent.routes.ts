import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { getLLMGateway, getRAGRetriever } from './index.js';
import { AgentService } from './agent-service.js';
import { ConversationManager } from './conversation-manager.js';
import { chatRequestSchema } from '../validators/agent.validators.js';
import { env } from '../config/env.js';

const router: RouterType = Router();

const conversationManager = new ConversationManager();
const agentService = new AgentService(conversationManager);

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

router.use(authMiddleware);

router.get('/health', async (_req, res, next) => {
  try {
    const health = await getLLMGateway().healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      status: health.status,
      ollama: health.ollamaReachable,
      chatModel: {
        name: env.OLLAMA_MODEL,
        available: health.chatModelAvailable,
      },
      embedModel: {
        name: env.OLLAMA_EMBED_MODEL,
        available: health.embedModelAvailable,
      },
      availableModels: health.availableModels,
      error: health.error,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/conversations', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const conversations = await conversationManager.listForUser(userId);
    res.set(noStoreHeaders);
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const conversation = await conversationManager.getHistory(req.params.id, userId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    res.set(noStoreHeaders);
    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

router.delete('/conversations/:id', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const deleted = await conversationManager.delete(req.params.id, userId);
    if (!deleted) {
      throw new AppError('Conversation not found', 404);
    }

    res.json({ message: 'Conversation deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/rag/reindex', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const retriever = getRAGRetriever();
    const readiness = await retriever.canIndexEmbeddings();
    if (!readiness.ready) {
      throw new AppError(readiness.reason || 'RAG indexing prerequisites are not met', 503);
    }

    const result = await retriever.reindexAll();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/chat', validateBody(chatRequestSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const { message, conversationId } = req.body as {
      message: string;
      conversationId?: string;
    };

    let activeConversationId = conversationId;
    if (activeConversationId) {
      const existing = await conversationManager.getHistory(activeConversationId, userId);
      if (!existing) {
        throw new AppError('Conversation not found', 404);
      }
    } else {
      activeConversationId = await conversationManager.create(userId);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeEvent = (type: string, data: unknown) => {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const messageId = `msg-${Date.now()}`;

    writeEvent('metadata', {
      conversationId: activeConversationId,
      messageId,
    });

    const result = await agentService.chat(userId, message, activeConversationId, (token) => {
      writeEvent('token', { content: token });
    });

    writeEvent('sources', result.sources);
    writeEvent('done', { ok: true });
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      next(error);
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message, code: 'AGENT_STREAM_ERROR' })}\n\n`);
    res.end();
  }
});

export default router;
