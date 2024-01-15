import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxy_target = "example.com";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sysadmin': {
        target: 'wss://'+proxy_target,
        ws: true,
        changeOrigin: true,
      },
      '/terminal': {
        target: 'wss://'+proxy_target,
        ws: true,
        changeOrigin: true,
      }
    }
  }
})
