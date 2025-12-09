import { Router } from 'express';
import { Sector } from '../models/Sector.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/sectors - List all sectors sorted by category (essential first) then name
router.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const sectors = await Sector.find().sort({ category: 1, name: 1 });
    res.json(sectors);
  } catch (error) {
    next(error);
  }
});

export default router;
