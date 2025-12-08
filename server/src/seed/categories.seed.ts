import { Category } from '../models/Category.js';

const categoriesData = [
  // INTACT Toolbox Categories
  {
    name: 'Predictive Threat Intelligence',
    slug: 'predictive-threat-intelligence',
    description: 'Tools for predicting and analyzing cyber threats using AI/ML techniques',
  },
  {
    name: 'AI Attack-Defence Emulation',
    slug: 'ai-attack-defence-emulation',
    description: 'AI-powered attack simulation and defense testing tools',
  },
  {
    name: 'Automated Threat Inspection',
    slug: 'automated-threat-inspection',
    description: 'Automated tools for inspecting, detecting, and analyzing threats',
  },
  {
    name: 'Zero-Trust Architecture',
    slug: 'zero-trust-architecture',
    description: 'Zero-trust architecture and distributed security components',
  },
  {
    name: 'Digital Twin Construction',
    slug: 'digital-twin-construction',
    description: 'Agents for digital twin synchronization and data collection',
  },
  {
    name: 'User Interface',
    slug: 'user-interface',
    description: 'Visualization dashboards and human-in-the-loop tools',
  },
  {
    name: 'Explainable AI',
    slug: 'explainable-ai',
    description: 'Explainable AI tools for interpreting security decisions',
  },
  {
    name: 'Service Management',
    slug: 'service-management',
    description: 'Open Security Service Repository for catalog and management',
  },
  {
    name: 'Training & Simulation',
    slug: 'training-simulation',
    description: 'Security training and simulation tools',
  },
  {
    name: 'Orchestration',
    slug: 'orchestration',
    description: 'Service orchestration and deployment tools',
  },
  {
    name: 'Infrastructure',
    slug: 'infrastructure',
    description: 'Message brokers and infrastructure components',
  },
  // Related Infrastructure Categories
  {
    name: '5G Core',
    slug: '5g-core',
    description: '5G Core network functions and components',
  },
  {
    name: '5G RAN',
    slug: '5g-ran',
    description: '5G Radio Access Network components',
  },
  {
    name: 'User Equipment',
    slug: 'user-equipment',
    description: 'End-user devices and equipment',
  },
  {
    name: 'Attack Emulation',
    slug: 'attack-emulation',
    description: 'Attack emulation and replay tools',
  },
  {
    name: 'Healthcare Equipment',
    slug: 'healthcare-equipment',
    description: 'Medical devices and healthcare IoT',
  },
  {
    name: 'Virtualization',
    slug: 'virtualization',
    description: 'Containerization and virtualization platforms',
  },
  {
    name: 'Network Simulation',
    slug: 'network-simulation',
    description: 'Network emulation and simulation tools',
  },
  {
    name: 'Monitoring',
    slug: 'monitoring',
    description: 'Data visualization and metrics platforms',
  },
  {
    name: 'Security Tools',
    slug: 'security-tools',
    description: 'VPN and security infrastructure tools',
  },
  {
    name: 'Testing Tools',
    slug: 'testing-tools',
    description: 'Security and model testing tools',
  },
];

export const seedCategories = async (): Promise<void> => {
  console.log('Seeding categories...');

  for (const categoryData of categoriesData) {
    const existing = await Category.findOne({ slug: categoryData.slug });

    if (!existing) {
      await Category.create(categoryData);
      console.log(`  Created category: ${categoryData.name}`);
    } else {
      console.log(`  Category exists: ${categoryData.name}`);
    }
  }

  console.log('Categories seeded successfully');
};
