import { Router, type Router as RouterType } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { validate } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginSchema } from '../validators/auth.validator.js';
import { asyncHandler } from '../middleware/entityLoader.js';

const router: RouterType = Router();

// POST /api/auth/login
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    const user = await User.findById(userId).select('-passwordHash').lean();
    if (!user) {
      throw new Error('User not found');
    }

    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
    });
  })
);

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  // JWT is stateless, logout is handled client-side
  res.json({ message: 'Logged out successfully' });
});

export default router;
