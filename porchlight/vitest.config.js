// Vitest settings for the backend (the Forge functions in src/).
// The page in static/porchlight-ui has its own Vitest settings, so only test/unit runs here.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.js'],
    environment: 'node',
  },
});
