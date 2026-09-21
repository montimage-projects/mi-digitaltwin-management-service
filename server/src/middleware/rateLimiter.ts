import { rateLimit } from 'express-rate-limit';

// Strict rate limit for login: 5 attempts per 5 minutes, 429 on the 6th.
export const loginRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // allow 5 attempts; the 6th gets 429
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});
