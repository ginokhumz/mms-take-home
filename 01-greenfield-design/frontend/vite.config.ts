// defineConfig comes from vitest/config, not vite: the `test` block below is Vitest's and the
// vite export does not type it.
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
