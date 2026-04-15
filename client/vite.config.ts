import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
        // Long timeout for LLM inference (local models can take 30-120s)
        timeout: 300000,
        // Disable proxy response buffering so SSE tokens stream in real time
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Signal to the proxy that this is a streaming request
            if (req.headers.accept === 'text/event-stream') {
              proxyReq.setHeader('Cache-Control', 'no-cache');
            }
          });
        },
      },
    },
  },
});
