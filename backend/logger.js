// logger.js — structured logging utility
// Issue 4: replaces all console.log / console.error calls across the backend.
//
// In development (NODE_ENV != 'production'):
//   Uses pino-pretty for human-readable coloured output.
// In production:
//   Emits newline-delimited JSON — Railway / Datadog / Logtail can ingest this.
//
// Usage:
//   import logger from '../logger.js'
//   logger.info({ agentName, durationMs }, 'Agent run complete')
//   logger.error({ err, route: '/api/agents/query' }, 'Agent query failed')
//   logger.warn({ permission }, 'Unknown permission requested')

import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

const logger = pino(
    isDev
        ? {
              level:     process.env.LOG_LEVEL || 'debug',
              transport: {
                  target:  'pino-pretty',
                  options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
              },
          }
        : {
              level: process.env.LOG_LEVEL || 'info',
          }
)

export default logger
