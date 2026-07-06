import { Category } from '../models/Category.js';
import { upsertRecord, deprecateStale } from './sync-helpers.js';

/**
 * Category taxonomy backing the service catalog seeded in `services.seed.ts`.
 *
 * Refreshed from the SECASSURED source catalogs (see
 * `server/src/seed/services.seed.ts` for the full provenance notes):
 *   - `dev-services` / `ops-services` back the SECASSURED Cybersecurity
 *     Services catalog (INTACT_TOOLBOX table, issue #5).
 *   - the remaining 8 categories back the SECASSURED partner Infrastructure
 *     list (OTHER_SERVICES table, issue #7).
 *
 * Any category previously seeded here (the legacy INTACT toolbox taxonomy)
 * that is no longer listed below is deprecated rather than deleted the next
 * time `seedCategories()` runs — see `sync-helpers.ts`. This is also how
 * issue #6 is resolved: the SECASSURED source lists no dedicated
 * "Cybersecurity Infrastructure" category, so the legacy `infrastructure`
 * category (previously used for the message-broker tool AEGIS-COS) is
 * deprecated instead of being carried forward.
 */
const categoriesData = [
  // Cybersecurity Services catalog (INTACT_TOOLBOX) — SECASSURED Dev/Ops services
  {
    name: 'Dev Services',
    slug: 'dev-services',
    description:
      'Assurance-driven security engineering services for the software/hardware development lifecycle (SECASSURED R1-R3.5)',
  },
  {
    name: 'Ops Services',
    slug: 'ops-services',
    description:
      'AI-driven security orchestration, automation and response services for operations (SECASSURED R5)',
  },
  // Infrastructure list (OTHER_SERVICES) — SECASSURED partner infrastructure
  {
    name: '5G Testbeds',
    slug: '5g-testbeds',
    description:
      'Radio access network and edge/5G laboratories used for cybersecurity testing and validation',
  },
  {
    name: 'HPC & Compute Clusters',
    slug: 'hpc-compute',
    description:
      'High-performance computing clusters and supercomputers used for simulation, modelling and AI training',
  },
  {
    name: 'Manufacturing Labs',
    slug: 'manufacturing-labs',
    description:
      'Digital manufacturing and industrial control laboratories used for joint R&T and testing',
  },
  {
    name: 'Data Center & Hosting',
    slug: 'data-center-hosting',
    description: 'Development servers, operational networks and dedicated hosting infrastructure',
  },
  {
    name: 'Energy Grid Infrastructure',
    slug: 'energy-grid-infrastructure',
    description:
      'Distributed energy resources and prosumer infrastructure connected to the power grid',
  },
  {
    name: 'DevSecOps Platforms',
    slug: 'devsecops-platforms',
    description: 'Platforms supporting secure development and operations activities',
  },
  {
    name: 'Healthcare IoT Platforms',
    slug: 'healthcare-iot-platforms',
    description: 'IoT and edge infrastructure enabling remote healthcare product lines',
  },
  {
    name: 'E-Mobility & IIoT',
    slug: 'e-mobility-iiot',
    description:
      'Charging station testing facilities and industrial IoT labs used for cybersecurity experiments',
  },
];

const activeCategorySlugs = categoriesData.map((c) => c.slug);

export const seedCategories = async (): Promise<void> => {
  console.info('Seeding categories...');

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const categoryData of categoriesData) {
    const action = await upsertRecord(Category, { slug: categoryData.slug }, categoryData);

    if (action === 'created') {
      created++;
      console.info(`  Created category: ${categoryData.name}`);
    } else if (action === 'updated') {
      updated++;
      console.info(`  Updated category: ${categoryData.name}`);
    } else {
      unchanged++;
      console.info(`  Category up to date: ${categoryData.name}`);
    }
  }

  const deprecatedCount = await deprecateStale(Category, {}, 'slug', activeCategorySlugs);
  if (deprecatedCount > 0) {
    console.info(`  Deprecated ${deprecatedCount} categories no longer in the source taxonomy`);
  }

  console.info(
    `Categories seeded successfully (${created} created, ${updated} updated, ${unchanged} unchanged, ${deprecatedCount} deprecated)`
  );
};
