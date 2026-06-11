import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function precachePlugin() {
  return {
    name: 'precache-plugin',
    closeBundle() {
      const distPath = path.resolve(__dirname, 'dist');
      const assetsPath = path.resolve(distPath, 'assets');
      
      let filesToCache = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/manifest.json'];
      if (fs.existsSync(assetsPath)) {
        const files = fs.readdirSync(assetsPath);
        files.forEach(file => {
          filesToCache.push(`/assets/${file}`);
        });
      }
      
      const swPath = path.resolve(distPath, 'sw.js');
      if (fs.existsSync(swPath)) {
        let swContent = fs.readFileSync(swPath, 'utf8');
        swContent = swContent.replace(
          /const ASSETS_TO_CACHE = \[[\s\S]*?\];/,
          `const ASSETS_TO_CACHE = ${JSON.stringify(filesToCache, null, 2)};`
        );
        fs.writeFileSync(swPath, swContent, 'utf8');
        console.log('Successfully injected assets to sw.js precache list:', filesToCache);
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), precachePlugin()],
  server: {
    proxy: {
      '/chat': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/fine': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/challan': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

