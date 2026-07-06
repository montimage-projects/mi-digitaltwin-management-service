import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { seedCategories } from './categories.seed.js';
import { seedSectors } from './sectors.seed.js';
import { seedServices } from './services.seed.js';
import { seedPartners } from './partners.seed.js';
import { seedAdmin } from './admin.seed.js';

const runSeeds = async (): Promise<void> => {
  console.info('Starting database seeding...\n');

  try {
    await connectDatabase();

    // Run seeds in order (categories and sectors must be first for services)
    await seedCategories();
    console.info('');

    await seedSectors();
    console.info('');

    await seedServices();
    console.info('');

    await seedPartners();
    console.info('');

    await seedAdmin();
    console.info('');

    console.info('All seeds completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

runSeeds();
