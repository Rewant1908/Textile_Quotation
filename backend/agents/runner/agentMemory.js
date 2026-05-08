// agentMemory.js — Memory read/write layer with Redis caching
// Phase 4: Technical Foundation
//
// Three memory scopes:
//   project → backend/memory/{agentName}.MEMORY.md   (committed to git, shared)
//   user    → backend/memory/users/{username}/{agentName}.MEMORY.md (not committed)
//   local   → backend/memory/local/{agentName}.MEMORY.md (not committed, machine-specific)
//
// Redis caching:
//   - readMemory()          checks Redis (TTL: 5 min) before hitting disk
//   - writeMemorySnapshot() writes disk then busts the Redis key immediately

import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve, dirname }           from 'path'
import { existsSync }                 from 'fs'
import * as cache                     from '../../cache.js'

const MEMORY_ROOT = resolve(import.meta.dirname, '../../memory')
const MEMORY_TTL  = 300 // 5 minutes

function memoryPath(scope, agentName, username = 'system') {
    switch (scope) {
        case 'user':
            return resolve(MEMORY_ROOT, 'users', username, `${agentName}.MEMORY.md`)
        case 'local':
            return resolve(MEMORY_ROOT, 'local', `${agentName}.MEMORY.md`)
        case 'project':
        default:
            return resolve(MEMORY_ROOT, `${agentName}.MEMORY.md`)
    }
}

function memoryCacheKey(scope, agentName, username = 'system') {
    return `memory:${scope}:${username}:${agentName}`
}

/**
 * readMemory — returns memory file contents or empty string if not found.
 * Caches in Redis for MEMORY_TTL seconds to avoid repeated file I/O on
 * every agent call. Falls back gracefully if Redis is unavailable.
 */
export async function readMemory(scope, agentName, username = 'system') {
    const key = memoryCacheKey(scope, agentName, username)

    // Try Redis first
    const cached = await cache.get(key)
    if (cached !== null) return cached

    // Fall back to disk
    const path = memoryPath(scope, agentName, username)
    let content = ''
    try {
        content = await readFile(path, 'utf-8')
    } catch {
        // memory file doesn't exist yet — that's fine
    }

    // Cache result (even empty string, so we don't re-hit disk on every call)
    await cache.set(key, content, MEMORY_TTL)
    return content
}

/**
 * writeMemorySnapshot — writes or overwrites the memory file for a scope.
 * Creates directories if they don't exist.
 * Busts the Redis cache key immediately after writing so the next
 * readMemory() call gets fresh content from disk.
 */
export async function writeMemorySnapshot(scope, agentName, username = 'system', content) {
    const path = memoryPath(scope, agentName, username)
    const dir  = dirname(path)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
    }
    await writeFile(path, content, 'utf-8')

    // Bust cache so next read reflects the updated memory file
    await cache.del(memoryCacheKey(scope, agentName, username))
}
