import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { seedCategories } from './categories.seed.js';
import { seedSectors } from './sectors.seed.js';
import { seedServices } from './services.seed.js';
import { seedAdmin } from './admin.seed.js';
import { seedEmbeddings } from './embeddings.seed.js';

const runSeeds = async (): Promise<void> => {
  console.log('Starting database seeding...\n');

  try {
    await connectDatabase();

    // Run seeds in order (categories and sectors must be first for services)
    await seedCategories();
    console.log('');

    await seedSectors();
    console.log('');

    await seedServices();
    console.log('');

    await seedAdmin();
    console.log('');

    await seedEmbeddings();
    console.log('');

    console.log('All seeds completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

runSeeds();
