import axios from 'axios'

// Centralised Axios instance.
// All backend routes are registered under /api — baseURL must include it.
// Set VITE_API_URL in frontend/.env to override for production.
const API = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api',
    headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request automatically.
// Token is stored under 'kt_impex_token' by LoginPage on successful login.
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('kt_impex_token')
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
})

export default API
