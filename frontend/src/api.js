import axios from 'axios'

// Centralised Axios instance.
// All backend routes are registered under /api — baseURL must include it.
// Set VITE_API_URL in frontend/.env to override for production (include /api in the value).
const API = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api',
    headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request automatically.
// Token is stored under 'kt_impex_token' by App.jsx on login.
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('kt_impex_token')
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
})

// On 401, clear stale credentials so the user is sent back to login.
API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401) {
            localStorage.removeItem('kt_impex_token')
            localStorage.removeItem('kt_impex_user')
            // Force reload to the login screen (LoginPage renders when user state is null)
            window.location.reload()
        }
        return Promise.reject(error)
    }
)

export default API
