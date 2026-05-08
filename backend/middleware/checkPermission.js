/**
 * checkPermission middleware
 * Reads user_id from (in order):
 *   1. req.headers['x-user-id']  — used by GET requests that can't send a body
 *   2. req.body.user_id          — used by POST/PUT/PATCH
 *   3. req.query.user_id         — used by GET with query params
 *
 * Bug 3 fix: added MANAGE_QUOTATION_STATUS permission for PATCH /api/quotations/:id/status
 */

import pool from '../db.js';

const PERMISSION_ROLES = {
    MANAGE_PRODUCTS:          ['admin'],
    MANAGE_QUOTATION_STATUS:  ['admin'],
    VIEW_OPERATIONS:          ['admin'],
};

export function checkPermission(requiredPermission) {
    return async (req, res, next) => {
        const user_id =
            req.headers['x-user-id'] ??
            req.body?.user_id ??
            req.query?.user_id;

        if (!user_id) {
            return res.status(401).json({ error: 'Unauthorized: user_id required' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            const [user] = await conn.query(
                'SELECT role FROM users WHERE user_id = ?', [user_id]
            );

            if (!user) {
                return res.status(401).json({ error: 'Unauthorized: user not found' });
            }

            const allowedRoles = PERMISSION_ROLES[requiredPermission] || [];
            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({ error: `Forbidden: requires ${requiredPermission}` });
            }

            next();
        } catch (err) {
            console.error('checkPermission error:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            if (conn) conn.release();
        }
    };
}
