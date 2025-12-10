import { Sector } from '../models/Sector.js';

const sectorsData = [
  // Essential sectors (Annex I of NIS2)
  {
    name: 'Energy',
    slug: 'energy',
    category: 'essential' as const,
    description: 'Electricity, district heating and cooling, oil, gas, and hydrogen sectors',
  },
  {
    name: 'Transport',
    slug: 'transport',
    category: 'essential' as const,
    description: 'Air, rail, water, and road transport sectors',
  },
  {
    name: 'Banking',
    slug: 'banking',
    category: 'essential' as const,
    description: 'Credit institutions and financial services',
  },
  {
    name: 'Financial market infrastructures',
    slug: 'financial-market-infrastructures',
    category: 'essential' as const,
    description: 'Trading venues, central counterparties, and settlement systems',
  },
  {
    name: 'Health',
    slug: 'health',
    category: 'essential' as const,
    description: 'Healthcare providers, EU reference laboratories, and medical research',
  },
  {
    name: 'Drinking water',
    slug: 'drinking-water',
    category: 'essential' as const,
    description: 'Suppliers and distributors of water for human consumption',
  },
  {
    name: 'Wastewater',
    slug: 'wastewater',
    category: 'essential' as const,
    description: 'Collection, disposal, and treatment of urban and industrial wastewater',
  },
  {
    name: 'Digital infrastructure',
    slug: 'digital-infrastructure',
    category: 'essential' as const,
    description:
      'Internet exchange points, DNS providers, TLD registries, cloud computing, data centers, CDNs, trust service providers, and electronic communications networks',
  },
  {
    name: 'ICT service management (B2B)',
    slug: 'ict-service-management-b2b',
    category: 'essential' as const,
    description: 'Managed service providers and managed security service providers',
  },
  {
    name: 'Public administration',
    slug: 'public-administration',
    category: 'essential' as const,
    description: 'Central and regional government entities',
  },
  {
    name: 'Space',
    slug: 'space',
    category: 'essential' as const,
    description: 'Operators of ground-based infrastructure supporting space-based services',
  },
  // Important sectors (Annex II of NIS2)
  {
    name: 'Postal and courier services',
    slug: 'postal-courier-services',
    category: 'important' as const,
    description: 'Postal service providers including courier services',
  },
  {
    name: 'Waste management',
    slug: 'waste-management',
    category: 'important' as const,
    description: 'Waste collection, treatment, and disposal operators',
  },
  {
    name: 'Manufacture, production and distribution of chemicals',
    slug: 'chemicals',
    category: 'important' as const,
    description: 'Undertakings carrying out manufacture, production, and distribution of chemicals',
  },
  {
    name: 'Production, processing and distribution of food',
    slug: 'food',
    category: 'important' as const,
    description:
      'Food businesses engaged in wholesale distribution, industrial production, and processing',
  },
  {
    name: 'Manufacturing',
    slug: 'manufacturing',
    category: 'important' as const,
    description:
      'Manufacturers of medical devices, computers, electronics, machinery, motor vehicles, and transport equipment',
  },
  {
    name: 'Digital providers',
    slug: 'digital-providers',
    category: 'important' as const,
    description: 'Online marketplaces, search engines, and social networking service platforms',
  },
  {
    name: 'Research',
    slug: 'research',
    category: 'important' as const,
    description: 'Research organisations with significant research activities',
  },
];

export const seedSectors = async (): Promise<void> => {
  console.log('Seeding NIS2 sectors...');

  for (const sectorData of sectorsData) {
    const existing = await Sector.findOne({ slug: sectorData.slug });

    if (!existing) {
      await Sector.create(sectorData);
      console.log(`  Created sector: ${sectorData.name} (${sectorData.category})`);
    } else {
      console.log(`  Sector exists: ${sectorData.name}`);
    }
  }

  console.log('NIS2 sectors seeded successfully');
};
