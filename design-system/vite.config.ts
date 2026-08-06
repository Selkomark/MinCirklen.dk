import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/MinCirklen.dk/' : '/',
  build: {
    outDir: 'dist-docs',
  },
  server: {
    port: 5190,
    strictPort: true,
  },
}))
