// agentMemory.js — Memory read/write layer
// Phase 4: Technical Foundation
//
// Three memory scopes:
//   project → backend/memory/{agentName}.MEMORY.md   (committed to git, shared)
//   user    → backend/memory/users/{username}/{agentName}.MEMORY.md (not committed)
//   local   → backend/memory/local/{agentName}.MEMORY.md (not committed, machine-specific)

import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve, dirname }           from 'path'
import { existsSync }                 from 'fs'

const MEMORY_ROOT = resolve(import.meta.dirname, '../../memory')

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

/**
 * readMemory — returns memory file contents or empty string if not found.
 */
export async function readMemory(scope, agentName, username = 'system') {
    const path = memoryPath(scope, agentName, username)
    try {
        return await readFile(path, 'utf-8')
    } catch {
        return '' // memory file doesn't exist yet — that's fine
    }
}

/**
 * writeMemorySnapshot — writes or overwrites the memory file for a scope.
 * Creates directories if they don't exist.
 */
export async function writeMemorySnapshot(scope, agentName, username = 'system', content) {
    const path = memoryPath(scope, agentName, username)
    const dir  = dirname(path)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
    }
    await writeFile(path, content, 'utf-8')
}
