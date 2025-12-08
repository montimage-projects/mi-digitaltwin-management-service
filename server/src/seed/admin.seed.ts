import { User } from '../models/User.js';
import { env } from '../config/env.js';

export const seedAdmin = async (): Promise<void> => {
  console.log('Seeding admin user...');

  const existing = await User.findOne({ username: env.ADMIN_USERNAME.toLowerCase() });

  if (!existing) {
    await User.create({
      username: env.ADMIN_USERNAME.toLowerCase(),
      passwordHash: env.ADMIN_PASSWORD,
      role: 'admin',
    });
    console.log(`  Created admin user: ${env.ADMIN_USERNAME}`);
  } else {
    console.log(`  Admin user exists: ${env.ADMIN_USERNAME}`);
  }

  console.log('Admin user seeded successfully');
};
