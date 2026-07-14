import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // local-only: lets headless-Chrome-in-Docker reach `vite preview` for screenshot QA
  preview: { allowedHosts: ['host.docker.internal'] },
})
