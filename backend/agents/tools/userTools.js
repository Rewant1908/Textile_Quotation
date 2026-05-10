// backend/agents/tools/userTools.js
// Schema aligned to actual users table (standard RBAC from auth system):
//   TABLE: users
//     user_id, username, email, role, is_active, created_at
//   Roles: 'admin' | 'salesperson' | 'viewer'
// NOTE: Never return or expose password_hash.

export const userTools = [
  {
    name: 'list_users',
    description: 'List all system users. Admin-only. Use when asked to see users, team members, or staff accounts.',
    parameters: { type: 'object', properties: {
      role:   { type: 'string',  description: "Filter by role: 'admin', 'salesperson', 'viewer'. Omit for all." },
      active: { type: 'boolean', description: 'Filter by active status. Omit for all.' }
    }, required: [] },
    execute: async (args, db) => {
      let where = 'WHERE 1=1'
      const params = []
      if (args.role !== undefined && args.role !== null) {
        where += ' AND role = ?'
        params.push(args.role)
      }
      if (args.active !== undefined && args.active !== null) {
        where += ' AND is_active = ?'
        params.push(args.active ? 1 : 0)
      }
      const rows = await db.query(
        `SELECT user_id, username, email, role, is_active, created_at
         FROM users ${where} ORDER BY created_at DESC`, params
      )
      return { users: rows, count: rows.length }
    }
  },

  {
    name: 'get_user',
    description: 'Get details of a specific user by ID.',
    parameters: { type: 'object', properties: {
      user_id: { type: 'number', description: 'User ID.' }
    }, required: ['user_id'] },
    execute: async (args, db) => {
      const rows = await db.query(
        `SELECT user_id, username, email, role, is_active, created_at
         FROM users WHERE user_id = ?`, [args.user_id]
      )
      if (!rows[0]) return { error: `User #${args.user_id} not found` }
      return { user: rows[0] }
    }
  },

  {
    name: 'update_user_role',
    description: 'Change the role of a user. Admin-only. Use when user asks to promote, demote, or change role of a staff member.',
    parameters: { type: 'object', properties: {
      user_id: { type: 'number', description: 'User ID to update.' },
      role:    { type: 'string', description: "New role: 'admin', 'salesperson', 'viewer'." }
    }, required: ['user_id', 'role'] },
    execute: async (args, db) => {
      const valid = ['admin', 'salesperson', 'viewer']
      if (!valid.includes(args.role))
        return { error: `Invalid role "${args.role}". Must be one of: ${valid.join(', ')}` }
      const check = (await db.query(`SELECT user_id FROM users WHERE user_id = ?`, [args.user_id]))[0]
      if (!check) return { error: `User #${args.user_id} not found` }
      await db.query(`UPDATE users SET role = ? WHERE user_id = ?`, [args.role, args.user_id])
      return { success: true, message: `User #${args.user_id} role changed to "${args.role}".` }
    }
  },

  {
    name: 'toggle_user_active',
    description: 'Enable or disable a user account. Admin-only. Use when asked to deactivate, suspend, or reactivate a user.',
    parameters: { type: 'object', properties: {
      user_id:   { type: 'number',  description: 'User ID.' },
      is_active: { type: 'boolean', description: 'true to activate, false to deactivate.' }
    }, required: ['user_id', 'is_active'] },
    execute: async (args, db) => {
      const check = (await db.query(`SELECT user_id FROM users WHERE user_id = ?`, [args.user_id]))[0]
      if (!check) return { error: `User #${args.user_id} not found` }
      await db.query(
        `UPDATE users SET is_active = ? WHERE user_id = ?`,
        [args.is_active ? 1 : 0, args.user_id]
      )
      return {
        success: true,
        message: `User #${args.user_id} ${args.is_active ? 'activated' : 'deactivated'}.`
      }
    }
  },

  {
    name: 'get_user_activity',
    description: 'Get a summary of recent activity by a specific user: their quotations created and total value.',
    parameters: { type: 'object', properties: {
      user_id: { type: 'number', description: 'User ID.' },
      days:    { type: 'number', description: 'Look-back days. Default 30.' }
    }, required: ['user_id'] },
    execute: async (args, db) => {
      const days = args.days ?? 30
      const user = (await db.query(
        `SELECT user_id, username, role FROM users WHERE user_id = ?`, [args.user_id]
      ))[0]
      if (!user) return { error: `User #${args.user_id} not found` }
      const quotations = (await db.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total_value
         FROM quotations
         WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [args.user_id, days]
      ))[0]
      return { user, quotations_last_n_days: quotations, period_days: days }
    }
  }
]
