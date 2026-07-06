/**
 * Startup validation and diagnostics utility
 * Checks required services and prints helpful information on server start
 */

import { env } from '../config/env.js';
import { APP_NAME } from '../config/branding.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.info(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg: string) => console.info(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg: string) => console.info(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg: string) => console.info(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  header: (msg: string) => console.info(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
  dim: (msg: string) => console.info(`${colors.dim}${msg}${colors.reset}`),
};

interface ValidationResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  fix?: string;
}

/**
 * Check if a value looks like a default/example value
 */
function isDefaultValue(value: string, patterns: string[]): boolean {
  const lowerValue = value.toLowerCase();
  return patterns.some((pattern) => lowerValue.includes(pattern.toLowerCase()));
}

/**
 * Validate environment configuration
 */
function validateEnvironment(): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Check JWT_SECRET
  const jwtSecretDefaults = ['your-super-secret', 'change-in-production', 'example', 'test'];
  if (isDefaultValue(env.JWT_SECRET, jwtSecretDefaults)) {
    results.push({
      name: 'JWT_SECRET',
      status: env.NODE_ENV === 'production' ? 'error' : 'warning',
      message: 'Using default/example JWT_SECRET',
      fix: 'Generate a secure secret: openssl rand -base64 48',
    });
  } else {
    results.push({
      name: 'JWT_SECRET',
      status: 'ok',
      message: `Configured (${env.JWT_SECRET.length} chars)`,
    });
  }

  // Check ENCRYPTION_KEY
  const encryptionDefaults = ['your-32-character', 'default', 'example', 'test'];
  if (isDefaultValue(env.ENCRYPTION_KEY, encryptionDefaults)) {
    results.push({
      name: 'ENCRYPTION_KEY',
      status: env.NODE_ENV === 'production' ? 'error' : 'warning',
      message: 'Using default/example ENCRYPTION_KEY',
      fix: 'Generate a secure key: openssl rand -hex 16',
    });
  } else {
    results.push({
      name: 'ENCRYPTION_KEY',
      status: 'ok',
      message: `Configured (${env.ENCRYPTION_KEY.length} chars)`,
    });
  }

  // Check MongoDB URI
  const isAtlas =
    env.MONGODB_URI.includes('mongodb+srv://') || env.MONGODB_URI.includes('mongodb.net');
  const isLocalhost =
    env.MONGODB_URI.includes('localhost') ||
    env.MONGODB_URI.includes('127.0.0.1') ||
    env.MONGODB_URI.includes('mongodb://mongodb:');

  if (isAtlas) {
    results.push({
      name: 'MONGODB_URI',
      status: 'ok',
      message: 'MongoDB Atlas configured',
    });
  } else if (isLocalhost) {
    results.push({
      name: 'MONGODB_URI',
      status: 'ok',
      message: 'Local MongoDB configured',
    });
  } else {
    results.push({
      name: 'MONGODB_URI',
      status: 'ok',
      message: 'Custom MongoDB configured',
    });
  }

  // Check CORS_ORIGIN in production
  if (env.NODE_ENV === 'production' && env.CORS_ORIGIN.includes('localhost')) {
    results.push({
      name: 'CORS_ORIGIN',
      status: 'warning',
      message: 'CORS allows localhost in production',
      fix: 'Set CORS_ORIGIN to your production domain',
    });
  }

  return results;
}

/**
 * Test MongoDB connection using mongoose
 */
async function testMongoDBConnection(): Promise<ValidationResult> {
  const mongoose = await import('mongoose');

  try {
    // Create a separate connection for testing (don't affect the main app connection)
    const testConnection = await mongoose.default
      .createConnection(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      })
      .asPromise();

    await testConnection.close();

    const isAtlas = env.MONGODB_URI.includes('mongodb+srv://');
    return {
      name: 'MongoDB',
      status: 'ok',
      message: isAtlas ? 'Connected to MongoDB Atlas' : 'Connected to MongoDB',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    let fix = 'Check MONGODB_URI in your .env file';

    if (errorMessage.includes('ECONNREFUSED')) {
      fix = 'Start MongoDB: docker-compose up -d mongodb';
    } else if (errorMessage.includes('authentication failed')) {
      fix = 'Check MongoDB username and password in MONGODB_URI';
    } else if (errorMessage.includes('getaddrinfo') || errorMessage.includes('ENOTFOUND')) {
      fix = 'Check MongoDB host in MONGODB_URI (DNS resolution failed)';
    } else if (errorMessage.includes('network')) {
      fix = 'Check network access in MongoDB Atlas (whitelist your IP)';
    } else if (errorMessage.includes('timed out')) {
      fix =
        'Connection timed out. Check:\n' +
        '         - MongoDB is running\n' +
        '         - Network/firewall allows connection\n' +
        '         - Atlas: IP is whitelisted in Network Access';
    }

    return {
      name: 'MongoDB',
      status: 'error',
      message: errorMessage.slice(0, 80),
      fix,
    };
  }
}

/**
 * Print startup banner
 */
export function printBanner(): void {
  console.info(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║                                                                ║
║   ${colors.bright}${APP_NAME}${colors.reset}${colors.cyan}                       ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

/**
 * Print environment information
 */
export function printEnvironmentInfo(): void {
  log.header('Environment Configuration');

  const mongoDisplay = env.MONGODB_URI.includes('@')
    ? env.MONGODB_URI.replace(/:([^:@]+)@/, ':****@')
    : env.MONGODB_URI;

  console.info(`
  ${colors.dim}NODE_ENV:${colors.reset}        ${env.NODE_ENV}
  ${colors.dim}PORT:${colors.reset}            ${env.PORT}
  ${colors.dim}MONGODB_URI:${colors.reset}     ${mongoDisplay}
  ${colors.dim}CORS_ORIGIN:${colors.reset}     ${env.CORS_ORIGIN}
  ${colors.dim}JWT_EXPIRES_IN:${colors.reset}  ${env.JWT_EXPIRES_IN}
  ${colors.dim}MAESTRO_URL:${colors.reset}     ${env.MAESTRO_BASE_URL}
`);
}

/**
 * Run all startup checks and print results
 */
export async function runStartupChecks(): Promise<boolean> {
  printBanner();
  printEnvironmentInfo();

  log.header('Startup Checks');

  let hasErrors = false;
  let hasWarnings = false;

  // Environment validation
  const envResults = validateEnvironment();
  for (const result of envResults) {
    if (result.status === 'ok') {
      log.success(`${result.name}: ${result.message}`);
    } else if (result.status === 'warning') {
      log.warn(`${result.name}: ${result.message}`);
      if (result.fix) {
        log.dim(`         Fix: ${result.fix}`);
      }
      hasWarnings = true;
    } else {
      log.error(`${result.name}: ${result.message}`);
      if (result.fix) {
        log.dim(`         Fix: ${result.fix}`);
      }
      hasErrors = true;
    }
  }

  // MongoDB connection test
  log.info('Testing MongoDB connection...');
  const mongoResult = await testMongoDBConnection();

  if (mongoResult.status === 'ok') {
    log.success(`${mongoResult.name}: ${mongoResult.message}`);
  } else {
    log.error(`${mongoResult.name}: ${mongoResult.message}`);
    if (mongoResult.fix) {
      log.dim(`         Fix: ${mongoResult.fix}`);
    }
    hasErrors = true;
  }

  // Summary
  console.info('');
  if (hasErrors) {
    log.header('Startup Failed');
    log.error('Please fix the errors above before starting the server.');
    console.info(`
${colors.dim}Common fixes:
  1. Copy .env.example to .env: cp .env.example .env
  2. Start MongoDB: docker-compose up -d mongodb
  3. Generate secrets:
     - JWT_SECRET: openssl rand -base64 48
     - ENCRYPTION_KEY: openssl rand -hex 16
  4. For MongoDB Atlas: Whitelist your IP in Network Access${colors.reset}
`);
    return false;
  }

  if (hasWarnings) {
    log.warn('Server starting with warnings. Review the issues above for production.');
  }

  return true;
}

/**
 * Print server ready message
 */
export function printServerReady(port: number, staticEnabled: boolean): void {
  log.header('Server Ready');

  console.info(`
  ${colors.green}API:${colors.reset}     http://localhost:${port}/api
  ${colors.green}Health:${colors.reset}  http://localhost:${port}/api/health${
    staticEnabled
      ? `
  ${colors.green}Client:${colors.reset}  http://localhost:${port}/`
      : ''
  }${
    env.NODE_ENV === 'development'
      ? `
  ${colors.green}Docs:${colors.reset}    http://localhost:${port}/api/docs`
      : ''
  }
`);
}
