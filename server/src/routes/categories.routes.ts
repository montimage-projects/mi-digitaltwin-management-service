import { Router, type Router as RouterType } from 'express';
import { Category } from '../models/Category.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/entityLoader.js';

const router: RouterType = Router();

// GET /api/categories
// By default, categories deprecated by a catalog refresh (see
// `seed/categories.seed.ts`) are excluded. Pass `?includeDeprecated=true` to
// see the full history, e.g. for admin/audit views.
router.get(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const includeDeprecated = req.query.includeDeprecated === 'true';
    const query = includeDeprecated ? {} : { deprecated: { $ne: true } };

    const categories = await Category.find(query).sort({ name: 1 });
    res.json(categories);
  })
);

export default router;
