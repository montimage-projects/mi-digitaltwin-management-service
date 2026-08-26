import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { seedAdmin } from '../admin.seed.js';

vi.mock('../../models/User.js', () => ({
  User: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

/**
 * Unit tests for the admin seeding guard.
 *
 * Seeding must refuse to install the admin user when ADMIN_PASSWORD matches
 * a known default (F-SEC-002): a committed default would put a publicly
 * known credential into production paths.
 */
describe('seedAdmin', () => {
  const originalPassword = env.ADMIN_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findOne).mockResolvedValue(null);
  });

  afterEach(() => {
    env.ADMIN_PASSWORD = originalPassword;
  });

  it.each(['intact2025', 'admin', 'password'])(
    'refuses to seed when ADMIN_PASSWORD is the known default "%s"',
    async (defaultPassword) => {
      env.ADMIN_PASSWORD = defaultPassword;

      await expect(seedAdmin()).rejects.toThrow(/known default/i);
      expect(User.findOne).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    }
  );

  it('refuses case-insensitive matches against known defaults', async () => {
    env.ADMIN_PASSWORD = 'INTACT2025';

    await expect(seedAdmin()).rejects.toThrow(/ADMIN_PASSWORD/i);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('seeds the admin user with a strong non-default password', async () => {
    env.ADMIN_PASSWORD = 'correct-horse-battery-staple';

    await seedAdmin();

    expect(User.create).toHaveBeenCalledWith({
      username: 'admin',
      passwordHash: 'correct-horse-battery-staple',
      role: 'admin',
    });
  });
});
