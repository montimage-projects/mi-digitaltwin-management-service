import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginSchema } from '../validators/auth.validator.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.userId).select('-passwordHash');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  // JWT is stateless, logout is handled client-side
  res.json({ message: 'Logged out successfully' });
});

export default router;
