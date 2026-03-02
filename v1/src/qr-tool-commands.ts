import type { DB } from './db.js';
import type { Question } from './types.js';
import { getQuestion, listByStatus, listAll, getGroup } from './questions.js';
import { listResponses } from './responses.js';
import { getBlockers, getBlocked } from './dependencies.js';
import { writePending } from './pending.js';

// ── Read commands (hit DB directly) ──

export function cmdRead(db: DB, qnum: number): string {
    const q = getQuestion(db, qnum);
    if (!q) return `Error: Question Q${qnum} not found.`;

    const responses = listResponses(db, qnum);
    const lines: string[] = [];

    lines.push(`Q${q.qnum}: ${q.title}`);
    lines.push(`Status: ${q.status}  Group: ${q.group ?? '(none)'}`);
    lines.push(`Created: ${q.created_at}`);
    if (q.resolved_at) lines.push(`Resolved: ${q.resolved_at}`);
    lines.push('');

    if (q.description) {
        lines.push(q.description);
        lines.push('');
    }

    if (responses.length === 0) {
        lines.push('(no responses)');
    } else {
        for (const r of responses) {
            const label = r.author === 'agent' ? 'Agent' : 'You';
            lines.push(`── ${label} ── ${r.created_at} ──`);
            lines.push(r.body);
            lines.push('');
        }
    }

    return lines.join('\n');
}

const VALID_STATUSES = ['Awaiting', 'Active', 'Deferred', 'User_Deferred', 'Resolved'];

export function cmdList(db: DB, options: { status?: string; group?: string }): string {
    let questions: Question[];

    if (options.status) {
        if (!VALID_STATUSES.includes(options.status)) {
            return `Error: Invalid status "${options.status}". Valid: ${VALID_STATUSES.join(', ')}`;
        }
        questions = listByStatus(db, options.status as import('./types.js').QuestionStatus);
    } else if (options.group) {
        questions = getGroup(db, options.group);
    } else {
        questions = listAll(db);
    }

    // Apply group filter on top of status filter
    if (options.status && options.group) {
        questions = questions.filter(q => q.group === options.group);
    }

    if (questions.length === 0) return '(no questions found)';

    const lines: string[] = [];
    lines.push(padRight('QNUM', 8) + padRight('STATUS', 12) + padRight('GROUP', 20) + 'TITLE');
    lines.push('-'.repeat(70));

    for (const q of questions) {
        lines.push(
            padRight(`Q${q.qnum}`, 8) +
            padRight(q.status, 12) +
            padRight(q.group ?? '', 20) +
            q.title
        );
    }

    return lines.join('\n');
}

export function cmdInfo(db: DB, qnum: number): string {
    const q = getQuestion(db, qnum);
    if (!q) return `Error: Question Q${qnum} not found.`;

    const blockers = getBlockers(db, qnum);
    const blocked = getBlocked(db, qnum);
    const responses = listResponses(db, qnum);

    const lines: string[] = [];
    lines.push(`Q${q.qnum}: ${q.title}`);
    lines.push(`Status: ${q.status}`);
    lines.push(`Group: ${q.group ?? '(none)'}`);
    lines.push(`Created: ${q.created_at}`);
    if (q.resolved_at) lines.push(`Resolved: ${q.resolved_at}`);
    lines.push(`Responses: ${responses.length}`);
    lines.push(`Blocked by: ${blockers.length > 0 ? blockers.map(b => `Q${b.qnum}`).join(', ') : '(none)'}`);
    lines.push(`Blocks: ${blocked.length > 0 ? blocked.map(b => `Q${b.qnum}`).join(', ') : '(none)'}`);

    return lines.join('\n');
}

export function cmdStatus(db: DB): string {
    const all = listAll(db);
    const counts: Record<string, number> = {
        Awaiting: 0,
        Active: 0,
        Deferred: 0,
        User_Deferred: 0,
        Resolved: 0,
    };

    for (const q of all) {
        counts[q.status] = (counts[q.status] ?? 0) + 1;
    }

    const lines: string[] = [];
    lines.push(`Total: ${all.length}`);
    lines.push(`  Awaiting:       ${counts['Awaiting']}`);
    lines.push(`  Active:         ${counts['Active']}`);
    lines.push(`  Deferred:       ${counts['Deferred']}`);
    lines.push(`  User_Deferred:  ${counts['User_Deferred']}`);
    lines.push(`  Resolved:       ${counts['Resolved']}`);

    return lines.join('\n');
}

// ── Write commands (write to .pending/) ──

export function cmdRespond(pendingDir: string, qnum: number, author: 'user' | 'agent', body: string): string {
    writePending(pendingDir, { action: 'respond', qnum, author, body });
    return `Pending: ${author} response for Q${qnum}`;
}

export function cmdCreate(pendingDir: string, title: string, description: string, group?: string): string {
    writePending(pendingDir, { action: 'create', title, description, group });
    return `Pending: create question "${title}"`;
}

export function cmdBlockBy(pendingDir: string, blocked: number, blocker: number): string {
    writePending(pendingDir, { action: 'block-by', blocked, blocker });
    return `Pending: Q${blocked} blocked by Q${blocker}`;
}

export function cmdBlockByGroup(pendingDir: string, blocked: number, group: string): string {
    writePending(pendingDir, { action: 'block-by-group', blocked, group });
    return `Pending: Q${blocked} blocked by group "${group}"`;
}

export function cmdAddToGroup(pendingDir: string, qnum: number, group: string): string {
    writePending(pendingDir, { action: 'add-to-group', qnum, group });
    return `Pending: Q${qnum} added to group "${group}"`;
}

// ── Helpers ──

function padRight(s: string, width: number): string {
    return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
