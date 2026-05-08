/**
 * checkPermission middleware
 * Verifies JWT from Authorization: Bearer <token> header.
 * Attaches decoded user to req.user.
 *
 * FIXED: Added all missing permission keys that routes use.
 * Previously only 3 permissions were defined — every quotation and
 * retailer route was returning 403 Forbidden to ALL users.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

const PERMISSION_ROLES = {
    // Operations / analytics
    VIEW_OPERATIONS:          ['admin'],
    VIEW_ANALYTICS:           ['admin'],

    // Products
    MANAGE_PRODUCTS:          ['admin'],

    // Quotations
    VIEW_QUOTATIONS:          ['admin', 'dealer'],   // both roles can list/view
    CREATE_QUOTATION:         ['admin', 'dealer'],   // dealers create quotations
    UPDATE_QUOTATION:         ['admin'],
    MANAGE_QUOTATION_STATUS:  ['admin'],
    DELETE_QUOTATION:         ['admin'],

    // Retailers
    VIEW_RETAILERS:           ['admin'],
    CREATE_RETAILER:          ['admin', 'dealer'],
    UPDATE_RETAILER:          ['admin'],
    DELETE_RETAILER:          ['admin'],

    // Suppliers
    VIEW_SUPPLIERS:           ['admin'],
    MANAGE_SUPPLIERS:         ['admin'],

    // Bales / inventory
    MANAGE_BALES:             ['admin'],

    // Sales / transactions
    RECORD_SALE:              ['admin'],
    VIEW_SALES:               ['admin'],

    // AI agents
    USE_AGENTS:               ['admin'],
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

        const allowedRoles = PERMISSION_ROLES[requiredPermission];

        // Unknown permission key — fail safe (deny)
        if (!allowedRoles) {
            console.warn(`[checkPermission] Unknown permission: '${requiredPermission}' — denying request`);
            return res.status(403).json({ error: `Forbidden: unknown permission '${requiredPermission}'` });
        }

        if (!allowedRoles.includes(decoded.role)) {
            return res.status(403).json({ error: `Forbidden: requires ${requiredPermission}` });
        }

        req.user = decoded; // { user_id, username, role, iat, exp }
        next();
    };
}
