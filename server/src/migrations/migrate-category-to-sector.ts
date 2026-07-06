import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Service } from '../models/Service.js';
import { Sector } from '../models/Sector.js';
import { Category } from '../models/Category.js';

// Mapping from category slugs to sector slugs for OTHER_SERVICES
//
// Refreshed alongside the SECASSURED catalog data in
// `server/src/seed/categories.seed.ts` / `services.seed.ts` (issues #5, #6,
// #7). `seedServices()` now sets `sectorId` directly from each seed entry's
// own `sectorSlug` at create/update time, so this table is only a fallback
// default per category for this one-off backfill migration — a handful of
// the categories below legitimately span more than one sector in the seed
// data (e.g. `5g-testbeds` covers both `digital-infrastructure` and
// `research` entries); the mapping picks the most common/representative
// sector for those cases.
const categoryToSectorMapping: Record<string, string> = {
  // Cybersecurity Services catalog (INTACT_TOOLBOX)
  'dev-services': 'ict-service-management-b2b',
  'ops-services': 'ict-service-management-b2b',

  // Infrastructure list (OTHER_SERVICES)
  '5g-testbeds': 'digital-infrastructure',
  'hpc-compute': 'research',
  'manufacturing-labs': 'manufacturing',
  'data-center-hosting': 'digital-infrastructure',
  'energy-grid-infrastructure': 'energy',
  'devsecops-platforms': 'energy',
  'healthcare-iot-platforms': 'health',
  'e-mobility-iiot': 'energy',
};

const migrateCategoriesToSectors = async (): Promise<void> => {
  console.info('Starting migration: Category to Sector for OTHER_SERVICES...\n');

  try {
    await connectDatabase();

    // Get all sectors indexed by slug
    const sectors = await Sector.find();
    const sectorBySlug = new Map(sectors.map((s) => [s.slug, s]));

    console.info(`Found ${sectors.length} sectors in database`);
    if (sectors.length === 0) {
      console.info('\nNo sectors found. Please run "bun run seed" first to seed sectors.');
      return;
    }

    // Get all categories indexed by ID
    const categories = await Category.find();
    const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));

    console.info(`Found ${categories.length} categories in database\n`);

    // Get all OTHER_SERVICES that don't have a sector assigned
    const services = await Service.find({
      repositoryTable: 'OTHER_SERVICES',
    });

    console.info(`Found ${services.length} services in OTHER_SERVICES table\n`);

    let updated = 0;
    let skipped = 0;
    let noMapping = 0;

    for (const service of services) {
      // Skip if already has a sector
      if (service.sectorId) {
        console.info(`  [SKIP] ${service.shortName} - already has sector assigned`);
        skipped++;
        continue;
      }

      // Get the category for this service
      const category = categoryById.get(service.categoryId?.toString() || '');
      if (!category) {
        console.info(`  [WARN] ${service.shortName} - no category found`);
        noMapping++;
        continue;
      }

      // Find the sector mapping
      const sectorSlug = categoryToSectorMapping[category.slug];
      if (!sectorSlug) {
        console.info(
          `  [WARN] ${service.shortName} - no sector mapping for category "${category.slug}"`
        );
        noMapping++;
        continue;
      }

      const sector = sectorBySlug.get(sectorSlug);
      if (!sector) {
        console.info(
          `  [WARN] ${service.shortName} - sector "${sectorSlug}" not found in database`
        );
        noMapping++;
        continue;
      }

      // Update the service with the sector
      await Service.updateOne({ _id: service._id }, { $set: { sectorId: sector._id } });

      console.info(`  [OK] ${service.shortName}: ${category.name} -> ${sector.name}`);
      updated++;
    }

    console.info('\n--- Migration Summary ---');
    console.info(`Total services: ${services.length}`);
    console.info(`Updated: ${updated}`);
    console.info(`Skipped (already has sector): ${skipped}`);
    console.info(`No mapping available: ${noMapping}`);
    console.info('\nMigration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

migrateCategoriesToSectors();
