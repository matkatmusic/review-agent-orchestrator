import type { DB } from './db.js';
import type { PendingAction } from './types.js';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { addResponse } from './responses.js';
import { createQuestion, updateStatus } from './questions.js';
import { addBlocker, blockByGroup } from './dependencies.js';

export function writePending(pendingDir: string, action: PendingAction): string {
    mkdirSync(pendingDir, { recursive: true });
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    const filename = `${timestamp}-${random}.json`;
    const filepath = join(pendingDir, filename);
    const tmppath = filepath + '.tmp';
    writeFileSync(tmppath, JSON.stringify(action), 'utf-8');
    renameSync(tmppath, filepath);
    return filepath;
}

export function processPendingQueue(db: DB, pendingDir: string): number {
    let files: string[];
    try {
        files = readdirSync(pendingDir).filter(f => f.endsWith('.json')).sort();
    } catch {
        return 0; // directory doesn't exist yet
    }

    let processed = 0;

    for (const file of files) {
        const filepath = join(pendingDir, file);
        let action: PendingAction;

        // Phase 1: Parse — permanent failure if JSON is invalid
        try {
            const raw = readFileSync(filepath, 'utf-8');
            action = JSON.parse(raw) as PendingAction;
        } catch (err) {
            console.error(`[review] Skipping invalid pending file ${file}:`, err);
            safeUnlink(filepath);
            continue;
        }

        // Phase 2: Apply — may be transient (SQLITE_BUSY, FK timing)
        try {
            applyAction(db, action);
            processed++;
            safeUnlink(filepath);
        } catch (err) {
            if (isTransientError(err)) {
                // Keep the file for retry on next scan cycle
                console.error(`[review] Transient error on ${file} (will retry):`, err);
            } else {
                // Permanent error (unknown action, constraint violation) — delete
                console.error(`[review] Permanent error on ${file} (deleting):`, err);
                safeUnlink(filepath);
            }
        }
    }

    return processed;
}

function safeUnlink(filepath: string): void {
    try {
        unlinkSync(filepath);
    } catch {
        // file already gone
    }
}

/**
 * Classify whether an error is transient (retry-worthy) or permanent.
 * SQLITE_BUSY is the primary transient case — the daemon should retry next cycle.
 */
function isTransientError(err: unknown): boolean {
    if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED';
    }
    return false;
}

function applyAction(db: DB, action: PendingAction): void {
    switch (action.action) {
        case 'respond':
            addResponse(db, action.qnum, action.author, action.body);
            break;
        case 'block-by':
            addBlocker(db, action.blocked, action.blocker);
            break;
        case 'block-by-group':
            blockByGroup(db, action.blocked, action.group);
            break;
        case 'add-to-group':
            db.run('UPDATE questions SET "group" = ? WHERE qnum = ?', action.group, action.qnum);
            break;
        case 'create':
            createQuestion(db, action.title, action.description, action.group);
            break;
        default:
            throw new Error(`Unknown action: ${(action as { action: string }).action}`);
    }
}
