import { defineConfig } from 'vite';

/**
 * Milestone 1 Vite config for local dev/build parity with the static host.
 */
export default defineConfig({
  server: {
    open: false,
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true
  }
});
