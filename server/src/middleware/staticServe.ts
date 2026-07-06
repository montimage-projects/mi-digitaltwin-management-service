import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

const getClientDistPath = (): string => {
  // Client builds to server/public directory
  const publicPath = path.join(process.cwd(), 'public');

  if (fs.existsSync(publicPath)) {
    return publicPath;
  }

  // Fallback: try relative to this file
  const fallbackPath = path.resolve(__dirname, '..', '..', 'public');
  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return publicPath;
};

export const configureStaticServing = (app: Express): boolean => {
  const clientDistPath = getClientDistPath();
  const indexPath = path.join(clientDistPath, 'index.html');

  // Check if dist directory and index.html exist
  if (!fs.existsSync(clientDistPath)) {
    console.warn(`[Static] Warning: Client dist directory not found at ${clientDistPath}`);
    console.warn(
      '[Static] Running in API-only mode. Build client with: cd client && npm run build'
    );
    return false;
  }

  if (!fs.existsSync(indexPath)) {
    console.warn(`[Static] Warning: index.html not found at ${indexPath}`);
    console.warn(
      '[Static] Running in API-only mode. Build client with: cd client && npm run build'
    );
    return false;
  }

  console.info(`[Static] Serving client build from: ${clientDistPath}`);

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
