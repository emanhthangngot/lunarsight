import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Same asset layout as the official CesiumGS/cesium-vite-example.
const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify('/' + cesiumBaseUrl) },
  plugins: [
    react(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((directory) => ({
        src: cesiumSource + '/' + directory,
        dest: cesiumBaseUrl,
        // static-copy v4 preserves the full source path unless explicitly stripped.
        rename: { stripBase: 4 },
      })),
    }),
  ],
  test: { environment: 'node', maxWorkers: 1, fileParallelism: false },
});
