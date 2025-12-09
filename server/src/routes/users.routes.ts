import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  role: z.enum(['admin']).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6).max(100),
});

// GET /api/users - List all users
router.get('/', async (_req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create a new user
router.post('/', validate(createUserSchema), async (req, res, next) => {
  try {
    const { username, password, role = 'admin' } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      throw new AppError('Username already exists', 409);
    }

    const user = new User({
      username: username.toLowerCase(),
      passwordHash: password, // Will be hashed by pre-save hook
      role,
    });

    await user.save();

    res.status(201).json({
      _id: user._id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - Delete a user
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;

    // Prevent self-deletion
    if (id === currentUserId) {
      throw new AppError('Cannot delete your own account', 400);
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id/password - Reset user password
router.patch('/:id/password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const user = await User.findById(id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.passwordHash = password; // Will be hashed by pre-save hook
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
