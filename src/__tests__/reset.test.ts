import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runReset } from '../reset.js';
import { killSession } from '../tmux.js';
import {
    mkdtempSync,
    rmSync,
    existsSync,
    writeFileSync,
    mkdirSync,
    readdirSync,
    readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// Test session name to avoid collisions
const TEST_SESSION = 'qr-reset-test';

describe('reset — runReset', () => {
    let tmpDir: string;

    beforeEach(() => {
        killSession(TEST_SESSION);
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-reset-test-'));

        // Initialize a git repo so git commands don't fail
        execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
        execSync('git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'pipe' });

        // Create minimal structure (setup will be called by reset)
        mkdirSync(join(tmpDir, 'Questions', 'Awaiting'), { recursive: true });
        mkdirSync(join(tmpDir, 'Questions', 'Resolved'), { recursive: true });
        mkdirSync(join(tmpDir, 'Questions', 'Deferred'), { recursive: true });
    });

    afterEach(() => {
        killSession(TEST_SESSION);
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('clears lockfiles', () => {
        const locksDir = join(tmpDir, '.question-review-locks');
        mkdirSync(locksDir, { recursive: true });
        writeFileSync(join(locksDir, 'Q1.lock'), '{"paneId":"%99","qnum":1,"headCommit":"abc"}');
        writeFileSync(join(locksDir, 'Q2.lock'), '{"paneId":"%98","qnum":2,"headCommit":"def"}');

        runReset(tmpDir);

        const remaining = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
        expect(remaining).toHaveLength(0);
    });

    it('moves resolved questions back to Awaiting', () => {
        writeFileSync(join(tmpDir, 'Questions', 'Resolved', 'Q1.md'), '# Q1');
        writeFileSync(join(tmpDir, 'Questions', 'Resolved', 'Q2.md'), '# Q2');

        runReset(tmpDir);

        expect(existsSync(join(tmpDir, 'Questions', 'Awaiting', 'Q1.md'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'Awaiting', 'Q2.md'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'Resolved', 'Q1.md'))).toBe(false);
        expect(existsSync(join(tmpDir, 'Questions', 'Resolved', 'Q2.md'))).toBe(false);
    });

    it('preserves non-question files in Resolved/', () => {
        writeFileSync(join(tmpDir, 'Questions', 'Resolved', '.gitkeep'), '');

        runReset(tmpDir);

        expect(existsSync(join(tmpDir, 'Questions', 'Resolved', '.gitkeep'))).toBe(true);
    });

    it('installs settings.json via runSetup', () => {
        runReset(tmpDir);

        expect(existsSync(join(tmpDir, '.claude', 'settings.json'))).toBe(true);
    });

    it('does not crash on empty project', () => {
        // No lockfiles, no resolved questions — should complete without error
        runReset(tmpDir);
    });
});
