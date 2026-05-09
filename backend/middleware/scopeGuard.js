/**
 * scopeGuard.js — Memory scope access control
 * Phase 6 Task 1: prevent user-scope memory leaks between users
 *
 * Three scopes and their rules:
 *
 *   project  → shared, admin-write / everyone-read
 *              READ:  any authenticated user
 *              WRITE: admin only
 *
 *   user     → per-user private memory (salesperson notes, preferences)
 *              READ:  only req.user.username === requested username
 *                     (admin can read any user's memory for support purposes)
 *              WRITE: only req.user.username === requested username
 *                     (admin CAN write to any user's memory — intentional)
 *
 *   local    → agent-session only, never persisted cross-request.
 *              READ/WRITE: admin only (diagnostic use)
 *
 * Usage:
 *   import { assertMemoryScope } from '../middleware/scopeGuard.js'
 *
 *   // in a route handler, after checkPermission has set req.user:
 *   const guardError = assertMemoryScope(req.user, scope, requestedUsername, 'READ')
 *   if (guardError) return res.status(guardError.status).json({ error: guardError.message })
 */

import logger from '../logger.js'

/**
 * assertMemoryScope
 *
 * @param {object} reqUser         - req.user from JWT (has .username, .role, .user_id)
 * @param {string} scope           - 'project' | 'user' | 'local'
 * @param {string} targetUsername  - username whose memory is being accessed
 * @param {'READ'|'WRITE'} op      - operation type
 * @returns {null | { status: number, message: string }}
 *   null   = access granted
 *   object = access denied, use .status and .message for the HTTP response
 */
export function assertMemoryScope(reqUser, scope, targetUsername, op = 'READ') {
    if (!reqUser) {
        return { status: 401, message: 'Unauthorized: no user context on request' }
    }

    const isAdmin   = reqUser.role === 'admin'
    const isSelf    = reqUser.username === targetUsername
    const isSysUser = targetUsername === 'system'  // non-user agent runs

    switch (scope) {
        case 'project':
            // READ: everyone
            if (op === 'READ') return null
            // WRITE: admin only
            if (op === 'WRITE' && isAdmin) return null
            logger.warn(
                { username: reqUser.username, scope, op },
                '[scopeGuard] project-scope write blocked for non-admin'
            )
            return {
                status:  403,
                message: 'Forbidden: only admins can write to project-scoped memory'
            }

        case 'user':
            // System-user placeholder is always allowed (internal agent runs)
            if (isSysUser) return null
            // Admin can read and write any user's memory
            if (isAdmin) return null
            // Non-admin can only access their own memory
            if (isSelf) return null
            logger.warn(
                { username: reqUser.username, targetUsername, scope, op },
                '[scopeGuard] user-scope cross-user access blocked'
            )
            return {
                status:  403,
                message: `Forbidden: you can only access your own user-scoped memory (${op.toLowerCase()})`
            }

        case 'local':
            // Local scope is for agent sessions — admin-only for inspection
            if (isAdmin) return null
            logger.warn(
                { username: reqUser.username, scope, op },
                '[scopeGuard] local-scope access blocked for non-admin'
            )
            return {
                status:  403,
                message: 'Forbidden: local-scope memory is admin-only'
            }

        default:
            return {
                status:  400,
                message: `Invalid memory scope '${scope}'. Must be project, user, or local.`
            }
    }
}

/**
 * scopeGuardMiddleware — Express middleware factory
 *
 * Wraps assertMemoryScope for use in route chains.
 * Reads scope from req.params.scope and username from:
 *   1. req.body.username (write operations)
 *   2. req.query.username (read operations)
 *   3. Falls back to req.user.username (self-access)
 *
 * Usage:
 *   router.get('/memory/:scope', checkPermission('VIEW_OPERATIONS'), scopeGuardMiddleware('READ'), handler)
 *   router.put('/memory/:scope', checkPermission('MANAGE_SYSTEM'),   scopeGuardMiddleware('WRITE'), handler)
 */
export function scopeGuardMiddleware(op = 'READ') {
    return (req, res, next) => {
        const scope          = req.params.scope
        const targetUsername = req.body?.username
                            || req.query?.username
                            || req.user?.username
                            || 'system'

        const guardError = assertMemoryScope(req.user, scope, targetUsername, op)
        if (guardError) {
            return res.status(guardError.status).json({ error: guardError.message })
        }

        // Attach resolved username so the route handler doesn't re-derive it
        req.resolvedMemoryUsername = targetUsername
        next()
    }
}
