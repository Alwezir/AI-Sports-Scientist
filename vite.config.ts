import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    {
      name: 'normalize-base-path',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/AI-Sports-Scientist') {
            res.writeHead(302, { Location: '/AI-Sports-Scientist/' });
            res.end();
            return;
          }
          next();
        });
      },
    },
    react(),
  ],
  base: '/AI-Sports-Scientist/',
  server: {
    port: 3000,
    strictPort: true,
    host: '127.0.0.1',
    hmr: {
      host: '127.0.0.1',
      clientPort: 3000,
    },
    open: true,
    proxy: {
      '/profile-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/profile-api/, ''),
      },
      '/coach-api': {
        target: env.COACH_API_TARGET || 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coach-api/, '/api/v1'),
        headers: {
          ...(env.COACH_API_KEY ? { Authorization: `Bearer ${env.COACH_API_KEY}` } : {}),
          ...(env.VITE_COACH_API_KEY ? { Authorization: `Bearer ${env.VITE_COACH_API_KEY}` } : {}),
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  };
});
