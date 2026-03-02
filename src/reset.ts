import {
    readdirSync,
    unlinkSync,
    renameSync,
    existsSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killSession } from './tmux.js';
import { loadConfig } from './config.js';
import { runSetup } from './setup.js';

function log(msg: string): void {
    process.stderr.write(`[reset] ${msg}\n`);
}

function getSubmoduleDir(): string {
    const thisFile = fileURLToPath(import.meta.url);
    return dirname(dirname(thisFile));
}

/** Shell-escape a string for safe use in commands. */
function esc(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}

export function runReset(projectRoot: string): void {
    const config = loadConfig(projectRoot);
    const submoduleDir = getSubmoduleDir();

    // Step 1: Kill tmux session
    log('Killing tmux session...');
    killSession(config.tmuxSession);

    // Step 2: Remove worktrees
    log('Removing worktrees...');
    const wtDir = join(projectRoot, '.claude', 'worktrees');
    if (existsSync(wtDir)) {
        for (const name of readdirSync(wtDir)) {
            try {
                execSync(
                    `git -C ${esc(projectRoot)} worktree remove --force ${esc(`.claude/worktrees/${name}`)}`,
                    { stdio: 'pipe' },
                );
            } catch { /* already removed */ }
        }
    }
    try {
        execSync(`git -C ${esc(projectRoot)} worktree prune`, { stdio: 'pipe' });
    } catch { /* ignore */ }

    // Step 3: Delete worktree-* branches
    try {
        const branches = execSync(
            `git -C ${esc(projectRoot)} branch --list 'worktree-*'`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
        for (const branch of branches.split('\n').filter(Boolean)) {
            try {
                execSync(`git -C ${esc(projectRoot)} branch -D ${branch.trim()}`, { stdio: 'pipe' });
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }

    // Step 4: Clear lockfiles
    log('Clearing lockfiles...');
    const locksDir = join(projectRoot, '.question-review-locks');
    if (existsSync(locksDir)) {
        for (const f of readdirSync(locksDir).filter(f => f.endsWith('.lock'))) {
            try {
                unlinkSync(join(locksDir, f));
            } catch { /* ignore */ }
        }
    }

    // Step 5: Update submodule
    log('Updating submodule...');
    const submoduleName = basename(submoduleDir);
    try {
        execSync(
            `git -C ${esc(projectRoot)} -c protocol.file.allow=always submodule update --remote ${esc(submoduleName)}`,
            { stdio: 'pipe' },
        );
    } catch (err) {
        log(`Submodule update warning: ${err}`);
    }

    // Step 6: Reinstall settings
    log('Reinstalling settings...');
    runSetup(projectRoot);

    // Step 7: Move resolved questions back to Awaiting
    log('Moving resolved questions back to Awaiting...');
    const resolvedDir = join(projectRoot, 'Questions', 'Resolved');
    const awaitingDir = join(projectRoot, 'Questions', 'Awaiting');
    if (existsSync(resolvedDir)) {
        for (const f of readdirSync(resolvedDir).filter(f => f.startsWith('Q') && f.endsWith('.md'))) {
            renameSync(join(resolvedDir, f), join(awaitingDir, f));
        }
    }

    // Step 8: Commit reset state
    log('Committing reset state...');
    try {
        execSync(
            `git -C ${esc(projectRoot)} add -A && git -C ${esc(projectRoot)} commit -m "Reset project for testing" --allow-empty`,
            { stdio: 'pipe' },
        );
    } catch { /* ignore */ }

    log('Reset complete.');
}
