/**
 * checkPermission middleware
 * Verifies JWT from Authorization: Bearer <token> header.
 * Attaches decoded user to req.user.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

const PERMISSION_ROLES = {
    MANAGE_PRODUCTS:         ['admin'],
    MANAGE_QUOTATION_STATUS: ['admin'],
    VIEW_OPERATIONS:         ['admin'],
};

export function checkPermission(requiredPermission) {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: missing or malformed token' });
        }

        const token = authHeader.slice(7);

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired — please log in again' });
            }
            return res.status(401).json({ error: 'Invalid token' });
        }

        const allowedRoles = PERMISSION_ROLES[requiredPermission] || [];
        if (!allowedRoles.includes(decoded.role)) {
            return res.status(403).json({ error: `Forbidden: requires ${requiredPermission}` });
        }

        req.user = decoded; // { user_id, username, role, iat, exp }
        next();
    };
}
