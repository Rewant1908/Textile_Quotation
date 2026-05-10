-- =============================================================================
-- KT IMPEX — migration_v4.sql
-- Phase 9: dealer_sessions table for login analytics
-- Safe to re-run: CREATE TABLE IF NOT EXISTS used throughout.
-- =============================================================================

-- ── dealer_sessions ───────────────────────────────────────────────────────────
-- Tracks each dealer login session for security auditing.
-- login_at is set on login; logout_at is updated on explicit logout or expiry.
CREATE TABLE IF NOT EXISTS dealer_sessions (
    session_id   INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id      INT          NOT NULL
                              COMMENT 'FK → users.user_id',
    ip_address   VARCHAR(45)  NULL
                              COMMENT 'IPv4 or IPv6 address at login time.',
    user_agent   TEXT         NULL
                              COMMENT 'Browser / client user-agent string.',
    login_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logout_at    DATETIME     NULL
                              COMMENT 'NULL = session still active or expired silently.',
    CONSTRAINT fk_dealer_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Phase 9: per-login session records for dealer users.';

CREATE INDEX IF NOT EXISTS idx_dealer_sessions_user
    ON dealer_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_dealer_sessions_login
    ON dealer_sessions (login_at);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this migration:
--   mysql -u root -p kt_impex < backend/database/migration_v4.sql
-- OR via npm:
--   npm run db:migrate   (if script points to this file)
SELECT 'migration_v4 complete' AS status;
