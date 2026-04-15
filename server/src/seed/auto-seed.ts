/**
 * Auto-seed utility for cloud deployments
 * Automatically seeds the database on first startup if it's empty
 */

import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Sector } from '../models/Sector.js';
import { Service } from '../models/Service.js';
import { seedCategories } from './categories.seed.js';
import { seedSectors } from './sectors.seed.js';
import { seedServices } from './services.seed.js';
import { seedAdmin } from './admin.seed.js';
import { seedEmbeddings } from './embeddings.seed.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Check if the database needs seeding
 * Returns true if any essential collection is empty
 */
async function isDatabaseEmpty(): Promise<boolean> {
  const [userCount, categoryCount, sectorCount, serviceCount] = await Promise.all([
    User.countDocuments(),
    Category.countDocuments(),
    Sector.countDocuments(),
    Service.countDocuments(),
  ]);

  return userCount === 0 || categoryCount === 0 || sectorCount === 0 || serviceCount === 0;
}

/**
 * Get current database statistics
 */
async function getDatabaseStats(): Promise<{
  users: number;
  categories: number;
  sectors: number;
  services: number;
}> {
  const [users, categories, sectors, services] = await Promise.all([
    User.countDocuments(),
    Category.countDocuments(),
    Sector.countDocuments(),
    Service.countDocuments(),
  ]);

  return { users, categories, sectors, services };
}

/**
 * Run all seed scripts
 */
async function runAllSeeds(): Promise<void> {
  // Run seeds in order (categories and sectors must be first for services)
  await seedCategories();
  await seedSectors();
  await seedServices();
  await seedAdmin();
  await seedEmbeddings();
}

/**
 * Auto-seed the database if it's empty
 * This is safe to call on every startup - it only seeds if needed
 */
export async function autoSeedIfEmpty(): Promise<void> {
  console.log(`${colors.blue}[SEED]${colors.reset} Checking database status...`);

  const needsSeeding = await isDatabaseEmpty();

  if (!needsSeeding) {
    const stats = await getDatabaseStats();
    console.log(`${colors.green}[SEED]${colors.reset} Database already has data:`);
    console.log(
      `${colors.dim}       Users: ${stats.users}, Categories: ${stats.categories}, Sectors: ${stats.sectors}, Services: ${stats.services}${colors.reset}`
    );
    return;
  }

  console.log(`${colors.yellow}[SEED]${colors.reset} Empty database detected, running seed...`);
  console.log('');

  try {
    await runAllSeeds();

    const stats = await getDatabaseStats();
    console.log('');
    console.log(`${colors.green}[SEED]${colors.reset} Database seeded successfully!`);
    console.log(
      `${colors.dim}       Users: ${stats.users}, Categories: ${stats.categories}, Sectors: ${stats.sectors}, Services: ${stats.services}${colors.reset}`
    );
    console.log(`${colors.cyan}[SEED]${colors.reset} Default login: admin / intact2025`);
  } catch (error) {
    console.error(`${colors.yellow}[SEED]${colors.reset} Seeding failed:`, error);
    // Don't throw - allow server to start even if seeding fails
    // The user can manually run `bun run seed` later
  }
}
