// api.js — Axios instance for all KT IMPEX API calls
//
// In dev: Vite proxy forwards /api/* → http://localhost:5000/api
// In prod: set VITE_API_URL to your backend origin (e.g. https://api.ktimpex.com)
//
// Phase 4 Issue 2 fix: 401 response interceptor added.
//   When any API call returns 401 (JWT expired after 8h or token invalid):
//   1. Token + user data cleared from localStorage
//   2. 'kt:session-expired' custom event dispatched on window
//   3. App.jsx listens for this event and shows a session-expired banner
//      then redirects to /login after 3 seconds.
//   This prevents the user seeing silent empty states or broken UI.

import axios from 'axios'

const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL + '/api'
        : '/api',
    headers: { 'Content-Type': 'application/json' }
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('kt_impex_token')
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
})

// ── Response interceptor: handle 401 session expiry ──────────────────────────
// Issue 2 fix: intercept 401 responses globally.
// The login route itself is excluded — a wrong password also returns 401
// and should NOT trigger the session-expired flow.
API.interceptors.response.use(
    (response) => response,
    (error) => {
        const status   = error?.response?.status
        const url      = error?.config?.url || ''
        const isLogin  = url.includes('/login') || url.includes('/signup')

        if (status === 401 && !isLogin) {
            // Clear stale credentials
            localStorage.removeItem('kt_impex_token')
            localStorage.removeItem('kt_impex_user')

            // Notify App.jsx — avoids tight coupling between api.js and React state
            window.dispatchEvent(new CustomEvent('kt:session-expired'))
        }

        return Promise.reject(error)
    }
)

export default API
