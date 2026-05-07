/**
 * agentMemory.js
 * Read and write agent MEMORY.md files across three scopes.
 * Mirrors the agentMemory.ts + agentMemorySnapshot.ts pattern from Claude Code.
 *
 * Scopes:
 *   project  — shared via git, lives in backend/memory/
 *   user     — per-salesperson, lives in backend/memory/users/{username}/
 *   local    — machine-specific, lives in backend/memory/local/ (gitignored)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_BASE = path.join(__dirname, '..', '..', 'memory');

/**
 * Resolve the absolute path to a memory file based on scope.
 */
function resolvePath(file, scope, username) {
  switch (scope) {
    case 'user':
      if (!username) throw new Error('agentMemory: username required for user scope');
      return path.join(MEMORY_BASE, 'users', username, path.basename(file));
    case 'local':
      return path.join(MEMORY_BASE, 'local', path.basename(file));
    case 'project':
    default:
      return path.join(MEMORY_BASE, path.basename(file));
  }
}

/**
 * Read a MEMORY.md file. Returns empty string if the file doesn't exist yet.
 */
export async function readMemory(file, scope, username) {
  const fullPath = resolvePath(file, scope, username);
  try {
    return await fs.readFile(fullPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return ''; // No memory yet — fresh agent
    throw err;
  }
}

/**
 * Write (overwrite) a MEMORY.md file.
 * Creates parent directories if they don't exist.
 */
export async function writeMemory(file, scope, content, username) {
  const fullPath = resolvePath(file, scope, username);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
}

/**
 * Append a timestamped update to an existing MEMORY.md.
 * Used when an agent observes new retailer/supplier behavior mid-session.
 */
export async function appendMemory(file, scope, update, username) {
  const existing = await readMemory(file, scope, username);
  const timestamp = new Date().toISOString().split('T')[0];
  const newContent = `${existing}\n\n## Update ${timestamp}\n${update}`;
  await writeMemory(file, scope, newContent.trim(), username);
}

/**
 * Write a snapshot of project memory to local scope.
 * Called after a sync from remote to keep local salesperson devices current.
 * Mirrors agentMemorySnapshot.ts pendingSnapshotUpdate pattern.
 */
export async function writeMemorySnapshot(file, scope, content, username) {
  // Always write to the target scope
  await writeMemory(file, scope, content, username);

  // If project scope, also snapshot to local for offline access
  if (scope === 'project') {
    await writeMemory(file, 'local', `# Snapshot from project scope\n${content}`);
  }
}

/**
 * List all memory files in a given scope directory.
 */
export async function listMemoryFiles(scope, username) {
  const dir = scope === 'user'
    ? path.join(MEMORY_BASE, 'users', username || '_default')
    : scope === 'local'
      ? path.join(MEMORY_BASE, 'local')
      : MEMORY_BASE;

  try {
    const files = await fs.readdir(dir);
    return files.filter(f => f.endsWith('.MEMORY.md'));
  } catch {
    return [];
  }
}
