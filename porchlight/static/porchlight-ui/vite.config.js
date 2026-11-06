// Vite builds the page into dist/, which manifest.yml uploads as the Custom UI resource.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Paths outside this folder that the page imports. One copy of each, never duplicated:
//  - the design system lives in docs/design (decision D14),
//  - the note rule lives in the backend's src/lib, so page and server share it.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const designSystem = fileURLToPath(new URL('../../../docs/design/design-system', import.meta.url));
const sharedLib = fileURLToPath(new URL('../../src/lib', import.meta.url));

export default defineConfig({
  // Forge serves the build from its own CDN path, so every link must be relative ("./assets/...").
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@ds': designSystem,
      '@lib': sharedLib,
    },
  },
  // Let the dev server read files from the whole repo, not only this folder.
  server: { fs: { allow: [repoRoot] } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
