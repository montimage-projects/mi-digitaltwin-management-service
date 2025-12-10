import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

const getClientDistPath = (): string => {
  // Try multiple possible paths for the client dist directory
  const possiblePaths = [
    path.join(process.cwd(), '..', 'client', 'dist'), // From server directory (cd server && bun start)
    path.join(process.cwd(), 'client', 'dist'), // From project root
    path.resolve(__dirname, '..', '..', '..', 'client', 'dist'), // Relative to this file (compiled)
    path.resolve(__dirname, '..', '..', 'client', 'dist'), // Relative to src directory
  ];

  console.log('[Static] Searching for client dist in:');
  for (const p of possiblePaths) {
    const exists = fs.existsSync(p);
    console.log(`[Static]   ${exists ? '✓' : '✗'} ${p}`);
    if (exists) {
      return p;
    }
  }

  // Default path (may not exist)
  return possiblePaths[0];
};

export const configureStaticServing = (app: Express): boolean => {
  const clientDistPath = getClientDistPath();
  const indexPath = path.join(clientDistPath, 'index.html');

  // Check if dist directory and index.html exist
  if (!fs.existsSync(clientDistPath)) {
    console.warn(`[Static] Warning: Client dist directory not found at ${clientDistPath}`);
    console.warn(
      '[Static] Running in API-only mode. Build client with: cd client && bun run build'
    );
    return false;
  }

  if (!fs.existsSync(indexPath)) {
    console.warn(`[Static] Warning: index.html not found at ${indexPath}`);
    console.warn(
      '[Static] Running in API-only mode. Build client with: cd client && bun run build'
    );
    return false;
  }

  console.log(`[Static] Serving client build from: ${clientDistPath}`);

  // Serve static files with caching headers
  app.use(
    express.static(clientDistPath, {
      maxAge: '1y',
      immutable: true,
      index: false, // Don't serve index.html for directory requests (we handle SPA fallback)
      setHeaders: (res, filePath) => {
        // index.html should not be cached (for SPA updates)
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
        // Hashed assets can be cached immutably
        else if (filePath.match(/\.(js|css)$/) && filePath.includes('.')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // Images and fonts: cache for a day
        else if (filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    })
  );

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes (they should have already been handled)
    if (req.path.startsWith('/api')) {
      return next();
    }

    // Serve index.html for SPA routing
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(indexPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });

  return true;
};
