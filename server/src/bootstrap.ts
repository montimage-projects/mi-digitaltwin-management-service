import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chdir } from 'node:process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

// Normalize working directory so relative paths (dist, data) resolve consistently.
chdir(dirname(fileURLToPath(import.meta.url)) + '/..');

const DATA_DIR = process.env.DATA_DIR ?? `${process.cwd()}/data`;
const SEED_MARKER = `${DATA_DIR}/.seeded`;
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/intact';

const ensureDataDir = async (): Promise<void> => {
  await mkdir(DATA_DIR, { recursive: true });
};

const waitForMongoDb = async (): Promise<void> => {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const conn = await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
      await conn.disconnect();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.warn('Could not verify MongoDB connection, continuing startup');
};

const runSeedScript = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['dist/seed/index.js'], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
};

const runSeedIfNeeded = async (): Promise<void> => {
  const shouldSeed = process.env.SEED_ON_STARTUP === 'true' || process.env.SEED_ON_STARTUP === '1';
  if (!shouldSeed) {
    return;
  }

  await ensureDataDir();

  try {
    await access(SEED_MARKER);
    return;
  } catch {
    // Marker missing, continue with seeding.
  }

  await waitForMongoDb();

  const seeded = await runSeedScript();
  if (seeded) {
    await writeFile(SEED_MARKER, new Date().toISOString(), 'utf8');
  } else {
    console.warn('Database seeding failed, continuing startup');
  }
};

const main = async (): Promise<void> => {
  await runSeedIfNeeded();
  await import('./app.js');
};

main().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
