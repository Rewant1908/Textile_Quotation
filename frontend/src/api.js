import axios from 'axios'

// Centralised Axios instance.
// Set VITE_API_URL in frontend/.env to override for production.
const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    headers: { 'Content-Type': 'application/json' }
})

export default API
