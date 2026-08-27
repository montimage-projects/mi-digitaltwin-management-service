import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { configureStaticServing } from './middleware/staticServe.js';
import { runStartupChecks, printServerReady } from './utils/startup.js';
import { autoSeedIfEmpty } from './seed/auto-seed.js';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import sectorsRoutes from './routes/sectors.routes.js';
import servicesRoutes from './routes/services.routes.js';
import partnersRoutes from './routes/partners.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import scenariosRoutes from './routes/scenarios.routes.js';
import infrastructuresRoutes from './routes/infrastructures.routes.js';
import { openApiSpec } from './docs/openapi.js';

const app = express();

// Middleware
app.use(compression()); // gzip compression for responses
app.use(
  helmet({
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'cdn.jsdelivr.net'],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'"],
      },
    },
  })
);
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint — public, minimal response (no env/DB disclosure).
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API Documentation (development only)
if (env.NODE_ENV === 'development') {
  app.get('/api/docs', (_req, res) => {
    res.json(openApiSpec);
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/sectors', sectorsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api', scenariosRoutes);
app.use('/api/infrastructures', infrastructuresRoutes);

// Static file serving - always enabled to serve client build
const staticServingEnabled = configureStaticServing(app);

// Error handling (only for API routes when static serving is enabled)
if (!staticServingEnabled) {
  app.use(notFoundHandler);
}
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.info(`\n${signal} received. Shutting down gracefully...`);

  try {
    await disconnectDatabase();
    console.info('Closed all connections');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Run startup checks (validates env, tests MongoDB connection)
    const checksOk = await runStartupChecks();
    if (!checksOk) {
      process.exit(1);
    }

    // Connect to database (uses mongoose for app)
    await connectDatabase();

    // Auto-seed database if empty (for cloud deployments)
    await autoSeedIfEmpty();

    app.listen(env.PORT, () => {
      printServerReady(env.PORT, staticServingEnabled);
    });
  } catch (error) {
    console.error('\nFailed to start server:', error);
    console.error('\nTroubleshooting:');
    console.error('  1. Check MongoDB is running: docker-compose up -d mongodb');
    console.error('  2. Verify .env file exists and has correct values');
    console.error('  3. For Atlas: Ensure IP is whitelisted in Network Access\n');
    process.exit(1);
  }
};

startServer();
