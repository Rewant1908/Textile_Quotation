import axios from 'axios'

// Centralised Axios instance.
// All backend routes are registered under /api — baseURL must include it.
// Set VITE_API_URL in frontend/.env to override for production (include /api in the value).
const API = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api',
    headers: { 'Content-Type': 'application/json' }
})

export default API
