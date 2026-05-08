import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * FIXED: Added dev proxy so that in local development all /api/* requests
 * from the Vite dev server (port 5173) are forwarded to the Express backend
 * (port 5000) — eliminating CORS preflight failures during local dev.
 *
 * In production the VITE_API_URL env var in frontend/.env is used instead
 * and the proxy is not active.
 */
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
})
