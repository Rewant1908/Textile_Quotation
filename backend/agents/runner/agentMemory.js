// agentMemory.js — Memory read/write/append layer with Redis caching
// Phase 6: AI Memory Design
//
// Three memory scopes:
//   project → backend/memory/{agentName}.MEMORY.md   (committed to git, shared)
//   user    → backend/memory/users/{username}/{agentName}.MEMORY.md (not committed)
//   local   → backend/memory/local/{agentName}.MEMORY.md (not committed, machine-specific)
//
// Memory update sentinel:
//   Agents signal a memory update by wrapping content between:
//     MEMORY_UPDATE:
//     ...content...
//     END_MEMORY
//   agentRunner.js extracts this block and calls writeMemorySnapshot().
//
// Redis caching:
//   - readMemory()          checks Redis (TTL: 5 min) before hitting disk
//   - writeMemorySnapshot() writes disk then busts the Redis key immediately
//   - appendMemory()        appends a timestamped entry, then busts cache

import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { resolve, dirname }                    from 'path'
import { existsSync }                          from 'fs'
import * as cache                              from '../../cache.js'

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
 * Caches in Redis for MEMORY_TTL seconds to avoid repeated file I/O.
 * Falls back gracefully if Redis is unavailable.
 */
export async function readMemory(scope, agentName, username = 'system') {
    const key = memoryCacheKey(scope, agentName, username)

    const cached = await cache.get(key)
    if (cached !== null) return cached

    const path = memoryPath(scope, agentName, username)
    let content = ''
    try {
        content = await readFile(path, 'utf-8')
    } catch {
        // memory file doesn't exist yet — that's fine
    }

    await cache.set(key, content, MEMORY_TTL)
    return content
}

/**
 * writeMemorySnapshot — overwrites the memory file for a scope.
 * Creates directories if they don't exist.
 * Busts Redis cache immediately after writing.
 */
export async function writeMemorySnapshot(scope, agentName, username = 'system', content) {
    const path = memoryPath(scope, agentName, username)
    const dir  = dirname(path)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
    }
    await writeFile(path, content, 'utf-8')
    await cache.del(memoryCacheKey(scope, agentName, username))
}

/**
 * appendMemory — appends a timestamped entry to an existing memory file
 * without overwriting it. Useful for incremental learning logs.
 * Creates the file if it doesn't exist.
 */
export async function appendMemory(scope, agentName, username = 'system', newEntry) {
    const existing = await readMemory(scope, agentName, username)
    const timestamp = new Date().toISOString().split('T')[0]
    const appended = existing
        ? `${existing.trimEnd()}\n\n<!-- appended ${timestamp} -->\n${newEntry}`
        : `<!-- appended ${timestamp} -->\n${newEntry}`
    await writeMemorySnapshot(scope, agentName, username, appended)
}

/**
 * listMemoryFiles — returns array of { agentName, scope, path, sizeBytes }
 * for all .MEMORY.md files under the given scope.
 * Used by the admin memory inspection endpoint.
 */
export async function listMemoryFiles(scope = 'project', username = 'system') {
    let dir
    switch (scope) {
        case 'user':
            dir = resolve(MEMORY_ROOT, 'users', username)
            break
        case 'local':
            dir = resolve(MEMORY_ROOT, 'local')
            break
        case 'project':
        default:
            dir = MEMORY_ROOT
    }

    if (!existsSync(dir)) return []

    try {
        const entries = await readdir(dir, { withFileTypes: true })
        const files = entries
            .filter(e => e.isFile() && e.name.endsWith('.MEMORY.md'))
            .map(e => ({
                agentName: e.name.replace('.MEMORY.md', ''),
                scope,
                path: resolve(dir, e.name),
                sizeBytes: 0, // filled below
            }))

        // Get sizes
        await Promise.all(files.map(async f => {
            try {
                const content = await readFile(f.path, 'utf-8')
                f.sizeBytes = Buffer.byteLength(content, 'utf-8')
            } catch { /* skip */ }
        }))

        return files
    } catch {
        return []
    }
}
