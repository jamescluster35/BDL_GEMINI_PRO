import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // This loads variables from your .env file locally
  // On GitHub, it will look at the 'env' we set in the YAML file
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    css: {
      transformer: 'postcss', 
    },
  define: {
      // Use the native Vite way
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
      'import.meta.env.VITE_APPS_SCRIPT_URL': JSON.stringify(env.VITE_APPS_SCRIPT_URL),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    // CHANGED THIS: GitHub Pages needs the repo name as the base
    base: '/BDL_GEMINI_PRO/', 
  };
});