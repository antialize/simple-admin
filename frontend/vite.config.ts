import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxy_target = "127.0.0.1:8182";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sysadmin': {
        target: 'ws://'+proxy_target,
        ws: true,
        changeOrigin: true,
      },
      '/terminal': {
        target: 'ws://'+proxy_target,
        ws: true,
        changeOrigin: true,
      }
    }
  }
})
