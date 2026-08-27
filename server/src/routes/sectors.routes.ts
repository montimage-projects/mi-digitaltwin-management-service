import { Router, type Router as RouterType } from 'express';
import { Sector } from '../models/Sector.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/entityLoader.js';

const router: RouterType = Router();

// GET /api/sectors - List all sectors sorted by category (essential first) then name
router.get(
  '/',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const sectors = await Sector.find().sort({ category: 1, name: 1 });
    res.json(sectors);
  })
);

export default router;
