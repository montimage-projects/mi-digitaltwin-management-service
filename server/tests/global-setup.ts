/**
 * Vitest global setup — starts an in-memory MongoDB instance shared by all
 * test files so every test runs hermetically (no shared state, no real DB).
 *
 * The server URI is written to `process.env.MONGODB_URI` so that every test
 * file and module under test connects to the same in-memory instance.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export default async function globalSetup(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri().replace(/\/$/, ''); // strip trailing slash for DB-name concatenation
  process.env.MONGODB_URI = uri;
  process.env.SEED_TEST_MONGODB_URI = uri;
  // Keep the server alive for the entire test run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__MONGOD__ = mongod;
}

export async function globalTeardown(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (globalThis as any).__MONGOD__?.stop();
}
