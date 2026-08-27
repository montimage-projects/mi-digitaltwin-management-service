import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router: RouterType = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  role: z.enum(['admin']).optional(),
});

const updateUserSchema = z
  .object({
    username: z.string().min(3).max(50).optional(),
    role: z.enum(['admin']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update is required',
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
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

// PUT /api/users/:id - Update a user (admin only)
router.put('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, role } = req.body;
    const currentUserId = req.user?.userId;
    const currentUserRole = req.user?.role;

    // Only admins can update users
    if (currentUserRole !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

    // Prevent self-update of role
    if (id === currentUserId && role !== undefined && role !== 'admin') {
      throw new AppError('Cannot change your own role', 400);
    }

    const user = await User.findById(id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if username already exists (and is different from current)
    if (username && username.toLowerCase() !== user.username) {
      const existingUser = await User.findOne({ username: username.toLowerCase() });
      if (existingUser) {
        throw new AppError('Username already exists', 409);
      }
      user.username = username.toLowerCase();
    }

    if (role !== undefined) {
      user.role = role;
    }

    await user.save();

    res.json({
      _id: user._id,
      username: user.username,
      role: user.role,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id/password - Change user password (requires current password)
router.put('/:id/password', validate(changePasswordSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const currentUserId = req.user?.userId;
    const currentUserRole = req.user?.role;

    const user = await User.findById(id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Ownership validation: user can only change their own password, or admin can change any
    if (id !== currentUserId && currentUserRole !== 'admin') {
      throw new AppError("Access denied: cannot change another user's password", 403);
    }

    // Admin reset: skip current password check for admin password reset
    if (id === currentUserId) {
      // User changing own password — verify current password
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        throw new AppError('Current password is incorrect', 401);
      }
    }

    // Validate new password is different from current
    const isSame = await user.comparePassword(newPassword);
    if (isSame) {
      throw new AppError('New password must be different from current password', 400);
    }

    user.passwordHash = newPassword; // Will be hashed by pre-save hook
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id/password - Reset user password (admin-only, no current password needed)
router.patch('/:id/password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const currentUserRole = req.user?.role;

    // Only admins can use PATCH reset
    if (currentUserRole !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

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

// DELETE /api/users/:id - Delete a user (admin only, validates ownership)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;
    const currentUserRole = req.user?.role;

    // Only admins can delete users
    if (currentUserRole !== 'admin') {
      throw new AppError('Admin access required', 403);
    }

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

export default router;
