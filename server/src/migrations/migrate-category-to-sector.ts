import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Service } from '../models/Service.js';
import { Sector } from '../models/Sector.js';
import { Category } from '../models/Category.js';

// Mapping from category slugs to sector slugs for OTHER_SERVICES
const categoryToSectorMapping: Record<string, string> = {
  // 5G and Telecom related -> Digital infrastructure
  '5g-core': 'digital-infrastructure',
  '5g-ran': 'digital-infrastructure',
  'user-equipment': 'digital-infrastructure',
  'network-simulation': 'digital-infrastructure',

  // Healthcare related -> Health
  'healthcare-equipment': 'health',

  // Monitoring and Infrastructure -> ICT service management
  monitoring: 'ict-service-management-b2b',
  infrastructure: 'ict-service-management-b2b',
  virtualization: 'ict-service-management-b2b',

  // Attack/Security related -> Digital providers or ICT
  'attack-emulation': 'digital-infrastructure',

  // Default mappings for other categories that might be used
  'predictive-threat-intelligence': 'ict-service-management-b2b',
  'ai-attack-defence-emulation': 'ict-service-management-b2b',
  'automated-threat-inspection': 'ict-service-management-b2b',
  'zero-trust-architecture': 'ict-service-management-b2b',
  'digital-twin-construction': 'ict-service-management-b2b',
  'user-interface': 'digital-providers',
  'explainable-ai': 'research',
  'service-management': 'ict-service-management-b2b',
  'training-simulation': 'research',
  orchestration: 'ict-service-management-b2b',

  // Security and Testing tools
  'security-tools': 'ict-service-management-b2b',
  'testing-tools': 'ict-service-management-b2b',
};

const migrateCategoriesToSectors = async (): Promise<void> => {
  console.log('Starting migration: Category to Sector for OTHER_SERVICES...\n');

  try {
    await connectDatabase();

    // Get all sectors indexed by slug
    const sectors = await Sector.find();
    const sectorBySlug = new Map(sectors.map((s) => [s.slug, s]));

    console.log(`Found ${sectors.length} sectors in database`);
    if (sectors.length === 0) {
      console.log('\nNo sectors found. Please run "bun run seed" first to seed sectors.');
      return;
    }

    // Get all categories indexed by ID
    const categories = await Category.find();
    const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));

    console.log(`Found ${categories.length} categories in database\n`);

    // Get all OTHER_SERVICES that don't have a sector assigned
    const services = await Service.find({
      repositoryTable: 'OTHER_SERVICES',
    });

    console.log(`Found ${services.length} services in OTHER_SERVICES table\n`);

    let updated = 0;
    let skipped = 0;
    let noMapping = 0;

    for (const service of services) {
      // Skip if already has a sector
      if (service.sectorId) {
        console.log(`  [SKIP] ${service.shortName} - already has sector assigned`);
        skipped++;
        continue;
      }

      // Get the category for this service
      const category = categoryById.get(service.categoryId?.toString() || '');
      if (!category) {
        console.log(`  [WARN] ${service.shortName} - no category found`);
        noMapping++;
        continue;
      }

      // Find the sector mapping
      const sectorSlug = categoryToSectorMapping[category.slug];
      if (!sectorSlug) {
        console.log(
          `  [WARN] ${service.shortName} - no sector mapping for category "${category.slug}"`
        );
        noMapping++;
        continue;
      }

      const sector = sectorBySlug.get(sectorSlug);
      if (!sector) {
        console.log(`  [WARN] ${service.shortName} - sector "${sectorSlug}" not found in database`);
        noMapping++;
        continue;
      }

      // Update the service with the sector
      await Service.updateOne({ _id: service._id }, { $set: { sectorId: sector._id } });

      console.log(`  [OK] ${service.shortName}: ${category.name} -> ${sector.name}`);
      updated++;
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total services: ${services.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already has sector): ${skipped}`);
    console.log(`No mapping available: ${noMapping}`);
    console.log('\nMigration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

migrateCategoriesToSectors();
