import { Router, type Router as RouterType } from 'express';
import { Partner } from '../models/Partner.js';
import { authMiddleware } from '../middleware/auth.js';

const router: RouterType = Router();

// GET /api/partners
// By default, partners deprecated by a catalog refresh (see
// `seed/partners.seed.ts`) are excluded. Pass `?includeDeprecated=true` to
// see the full history, e.g. for admin/audit views.
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const includeDeprecated = req.query.includeDeprecated === 'true';
    const query = includeDeprecated ? {} : { deprecated: { $ne: true } };

    const partners = await Partner.find(query).sort({ shortName: 1 });
    res.json(partners);
  } catch (error) {
    next(error);
  }
});

export default router;
