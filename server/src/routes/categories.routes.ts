import { Router } from 'express';
import { Category } from '../models/Category.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/categories
router.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

export default router;
