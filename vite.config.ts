import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lvglPlugin } from './src/server/plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const esphomeDir =
    mode === 'demo'
      ? resolve(__dirname, 'samples')
      : resolve(__dirname, '../home-assistant/esphome');

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), lvglPlugin({ esphomeDir })],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    server: {
      fs: {
        // Explicit `allow` overrides Vite's default, which otherwise would only
        // include the project root. Uncomment esphomeDir if/when an asset
        // endpoint needs to serve files from there to the browser.
        allow: [
          resolve(__dirname),
          // esphomeDir,
        ],
      },
    },
  };
});
