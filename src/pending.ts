import type { DB } from './db.js';
import type { PendingAction } from './types.js';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
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
    writeFileSync(filepath, JSON.stringify(action), 'utf-8');
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
        try {
            const raw = readFileSync(filepath, 'utf-8');
            const action = JSON.parse(raw) as PendingAction;
            applyAction(db, action);
            processed++;
        } catch (err) {
            console.error(`[review] Skipping invalid pending file ${file}:`, err);
        }
        // Always delete the file (even if invalid — don't reprocess bad files)
        try {
            unlinkSync(filepath);
        } catch {
            // file already gone
        }
    }

    return processed;
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
