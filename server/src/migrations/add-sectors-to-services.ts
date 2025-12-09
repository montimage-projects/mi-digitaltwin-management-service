import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Service } from '../models/Service.js';
import { Sector } from '../models/Sector.js';

/**
 * Migration: Add sectors to existing OTHER_SERVICES
 *
 * This migration assigns the "Digital infrastructure" sector to all existing
 * services with repositoryTable: OTHER_SERVICES that don't have a sectorId.
 */
const migrate = async (): Promise<void> => {
  console.log('Starting migration: add-sectors-to-services\n');

  try {
    await connectDatabase();

    // Find the "Digital infrastructure" sector (default for migration)
    const defaultSector = await Sector.findOne({ slug: 'digital-infrastructure' });

    if (!defaultSector) {
      console.error('Error: "Digital infrastructure" sector not found.');
      console.log('Please run the seed script first: bun run seed');
      process.exit(1);
    }

    console.log(`Default sector: ${defaultSector.name} (${defaultSector._id})\n`);

    // Find all OTHER_SERVICES without a sectorId
    const servicesToMigrate = await Service.find({
      repositoryTable: 'OTHER_SERVICES',
      sectorId: { $exists: false },
    });

    console.log(`Found ${servicesToMigrate.length} services to migrate\n`);

    if (servicesToMigrate.length === 0) {
      console.log('No services need migration.');
    } else {
      for (const service of servicesToMigrate) {
        await Service.findByIdAndUpdate(service._id, {
          $set: { sectorId: defaultSector._id },
        });
        console.log(`  Migrated: ${service.shortName}`);
      }

      console.log(`\nMigrated ${servicesToMigrate.length} services successfully!`);
    }

    // Also ensure all services have uiType (default 'web')
    const servicesWithoutUiType = await Service.find({
      uiType: { $exists: false },
    });

    if (servicesWithoutUiType.length > 0) {
      console.log(`\nFound ${servicesWithoutUiType.length} services without uiType`);

      await Service.updateMany(
        { uiType: { $exists: false } },
        { $set: { uiType: 'web' } }
      );

      console.log(`Updated ${servicesWithoutUiType.length} services with default uiType: 'web'`);
    }

    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

migrate();
