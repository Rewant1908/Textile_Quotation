/**
 * checkPermission middleware
 * Verifies JWT from Authorization: Bearer <token> header.
 * Attaches decoded user to req.user.
 *
 * Role 'user' (the DB default for new signups) must have permissions
 * otherwise every non-admin user gets 403 on every request after login.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

const PERMISSION_ROLES = {
    // Operations / analytics — admin only
    VIEW_OPERATIONS:          ['admin'],
    VIEW_ANALYTICS:           ['admin'],

    // Products
    MANAGE_PRODUCTS:          ['admin'],

    // Quotations — 'user' is the default DB role for new signups
    VIEW_QUOTATIONS:          ['admin', 'dealer', 'user'],
    CREATE_QUOTATION:         ['admin', 'dealer', 'user'],
    UPDATE_QUOTATION:         ['admin'],
    MANAGE_QUOTATION_STATUS:  ['admin'],
    DELETE_QUOTATION:         ['admin'],

    // Retailers
    VIEW_RETAILERS:           ['admin', 'user', 'dealer'],
    CREATE_RETAILER:          ['admin', 'dealer', 'user'],
    UPDATE_RETAILER:          ['admin'],
    DELETE_RETAILER:          ['admin'],

    // Suppliers
    VIEW_SUPPLIERS:           ['admin', 'user', 'dealer'],
    MANAGE_SUPPLIERS:         ['admin'],

    // Bales / inventory
    MANAGE_BALES:             ['admin'],

    // Sales / transactions
    RECORD_SALE:              ['admin'],
    VIEW_SALES:               ['admin'],

    // AI agents
    USE_AGENTS:               ['admin'],
    USE_DEALER_AGENT:         ['admin', 'dealer', 'user'],

    // Issue 1 fix: MANAGE_SYSTEM was used in agents.js but missing here
    // PUT  /api/agents/memory/:scope      — overwrite agent memory
    // POST /api/agents/memory/:scope/append — append to agent memory
    MANAGE_SYSTEM:            ['admin'],
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

        if (!allowedRoles) {
            console.warn(`[checkPermission] Unknown permission: '${requiredPermission}' — denying request`);
            return res.status(403).json({ error: `Forbidden: unknown permission '${requiredPermission}'` });
        }

        if (!allowedRoles.includes(decoded.role)) {
            return res.status(403).json({ error: `Forbidden: requires ${requiredPermission}` });
        }

        req.user = decoded;
        next();
    };
}
