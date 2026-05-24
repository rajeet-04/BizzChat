import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const DEV_BACKEND_URL = process.env.VITE_DEV_BACKEND_URL?.trim() || 'http://localhost:3000'?.trim() || 'http://20.205.47.92:3000/'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: DEV_BACKEND_URL,
        changeOrigin: true,
      },
      '/socket.io': {
        target: DEV_BACKEND_URL,
        changeOrigin: true,
        ws: true,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
