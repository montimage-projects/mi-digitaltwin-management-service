import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { resolveBrandingProfile } from './src/lib/branding-profiles';

// Fill index.html branding tokens from the active profile at build/serve time.
// Vite's native %VITE_X% substitution only does literal env lookups; it cannot
// run the profile resolution, so we do it here.
function brandingHtmlPlugin(env: Record<string, string>): Plugin {
  const profile = resolveBrandingProfile(env.VITE_BRANDING_PROFILE);
  const appName = env.VITE_APP_NAME || profile.appName;
  const faviconSrc = env.VITE_FAVICON_SRC || profile.faviconSrc;
  return {
    name: 'branding-html',
    transformIndexHtml(html) {
      return html
        .replace('__APP_NAME__', () => appName)
        .replace('__FAVICON_SRC__', () => faviconSrc);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), brandingHtmlPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Output to server/public for easy static serving
      outDir: path.resolve(__dirname, '../server/public'),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
