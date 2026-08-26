import { User } from '../models/User.js';
import { DEFAULT_ADMIN_PASSWORDS, env } from '../config/env.js';

export const seedAdmin = async (): Promise<void> => {
  console.log('Seeding admin user...');

  const isKnownDefault = (DEFAULT_ADMIN_PASSWORDS as readonly string[]).includes(
    env.ADMIN_PASSWORD.toLowerCase()
  );

  if (isKnownDefault) {
    throw new Error(
      `Refusing to seed admin user: ADMIN_PASSWORD matches a known default ` +
        `(${DEFAULT_ADMIN_PASSWORDS.join(', ')}). ` +
        'Set a strong ADMIN_PASSWORD and re-run seeding.'
    );
  }

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
