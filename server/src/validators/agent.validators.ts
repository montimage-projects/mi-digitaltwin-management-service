import { z } from 'zod';

export const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(4000),
  useRag: z.boolean().optional(),
  injectionScheme: z.enum(['pre-user', 'static']).optional(),
  // Eval-only (requires AGENT_EVAL_OPTIONS=true): 'none' drops the system prompt.
  promptMode: z.enum(['full', 'none']).optional(),
});

export const conversationIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
