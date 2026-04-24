import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lvglPlugin } from './src/server/plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** ESPHome configs directory (sibling repo). */
const ESPHOME_DIR = resolve(__dirname, '../home-assistant/esphome');

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    lvglPlugin({ esphomeDir: ESPHOME_DIR }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    fs: {
      // Explicit `allow` overrides Vite's default, which otherwise would only
      // include the project root. Uncomment ESPHOME_DIR if/when an asset
      // endpoint needs to serve files from there to the browser.
      allow: [
        resolve(__dirname),
        // ESPHOME_DIR,
      ],
    },
  },
});
