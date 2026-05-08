import axios from 'axios'

// In dev: Vite proxy forwards /api/* → http://localhost:5000/api
// In prod: set VITE_API_URL to your backend origin (e.g. https://api.ktimpex.com)
const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL + '/api'
        : '/api',
    headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request automatically.
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('kt_impex_token')
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
})

export default API
