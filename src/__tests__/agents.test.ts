import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createLockfile,
    removeLockfile,
    readLockfile,
    listLockfiles,
    isAgentRunning,
    cleanupStaleLocks,
    buildInitialPrompt,
    buildClaudeCommand,
    spawnAgent,
    repromptAgent,
    killAgent,
    sendInitialPrompt,
} from '../agents.js';
import {
    isTmuxAvailable,
    hasSession,
    createSession,
    killSession,
    isPaneAlive,
    capturePaneTail,
} from '../tmux.js';
import type { Config, LockfileData } from '../types.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeConfig(overrides?: Partial<Config>): Config {
    return {
        maxAgents: 6,
        tmuxSession: 'q-review',
        projectRoot: '/tmp/test-project',
        scanInterval: 10,
        terminalApp: 'Terminal',
        agentPrompt: 'prompts/review-agent.md',
        codeRoot: '',
        ...overrides,
    };
}

describe('agents — lockfile management', () => {
    let tmpDir: string;
    let config: Config;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-agents-test-'));
        config = makeConfig({ projectRoot: tmpDir });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('createLockfile writes JSON lockfile', () => {
        const data: LockfileData = { paneId: '%42', qnum: 7, headCommit: 'abc123' };
        createLockfile(config, data);

        const lockPath = join(tmpDir, '.question-review-locks', 'Q7.lock');
        expect(existsSync(lockPath)).toBe(true);

        const contents = JSON.parse(readFileSync(lockPath, 'utf-8'));
        expect(contents.paneId).toBe('%42');
        expect(contents.qnum).toBe(7);
        expect(contents.headCommit).toBe('abc123');
    });

    it('createLockfile creates locks directory if missing', () => {
        const locksPath = join(tmpDir, '.question-review-locks');
        expect(existsSync(locksPath)).toBe(false);

        createLockfile(config, { paneId: '%1', qnum: 1, headCommit: 'abc' });
        expect(existsSync(locksPath)).toBe(true);
    });

    it('removeLockfile deletes the lockfile', () => {
        createLockfile(config, { paneId: '%1', qnum: 5, headCommit: 'abc' });
        const lockPath = join(tmpDir, '.question-review-locks', 'Q5.lock');
        expect(existsSync(lockPath)).toBe(true);

        removeLockfile(config, 5);
        expect(existsSync(lockPath)).toBe(false);
    });

    it('removeLockfile is safe when lockfile does not exist', () => {
        // Should not throw
        removeLockfile(config, 999);
    });

    it('readLockfile returns lockfile data', () => {
        const data: LockfileData = { paneId: '%10', qnum: 3, headCommit: 'def456' };
        createLockfile(config, data);

        const result = readLockfile(config, 3);
        expect(result).toEqual(data);
    });

    it('readLockfile returns undefined for nonexistent lockfile', () => {
        expect(readLockfile(config, 999)).toBeUndefined();
    });

    it('readLockfile returns undefined for malformed lockfile', () => {
        const dir = join(tmpDir, '.question-review-locks');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'Q1.lock'), 'not json!!!');

        expect(readLockfile(config, 1)).toBeUndefined();
    });

    it('listLockfiles returns all valid lockfiles', () => {
        createLockfile(config, { paneId: '%1', qnum: 1, headCommit: 'a' });
        createLockfile(config, { paneId: '%2', qnum: 2, headCommit: 'b' });
        createLockfile(config, { paneId: '%3', qnum: 3, headCommit: 'c' });

        const locks = listLockfiles(config);
        expect(locks).toHaveLength(3);
        expect(locks.map(l => l.qnum).sort()).toEqual([1, 2, 3]);
    });

    it('listLockfiles returns empty when locks dir does not exist', () => {
        expect(listLockfiles(config)).toEqual([]);
    });

    it('listLockfiles skips malformed lockfiles', () => {
        createLockfile(config, { paneId: '%1', qnum: 1, headCommit: 'a' });
        const dir = join(tmpDir, '.question-review-locks');
        writeFileSync(join(dir, 'Q99.lock'), 'not json');

        const locks = listLockfiles(config);
        expect(locks).toHaveLength(1);
        expect(locks[0]!.qnum).toBe(1);
    });

    it('isAgentRunning returns false when no lockfile', () => {
        expect(isAgentRunning(config, 42)).toBe(false);
    });

    it('isAgentRunning returns false when pane is dead', () => {
        // Create a lockfile with a fake pane ID that doesn't exist
        createLockfile(config, { paneId: '%99999', qnum: 42, headCommit: 'abc' });
        expect(isAgentRunning(config, 42)).toBe(false);
    });
});

describe('agents — buildInitialPrompt', () => {
    it('includes qnum, title, and description', () => {
        const config = makeConfig({ projectRoot: '/home/user/project' });
        const prompt = buildInitialPrompt(config, 7, 'Fix auth bug', 'The auth flow is broken');

        expect(prompt).toContain('Q7');
        expect(prompt).toContain('Fix auth bug');
        expect(prompt).toContain('The auth flow is broken');
        expect(prompt).toContain('Main tree path: /home/user/project');
    });

    it('includes code tree path when codeRoot differs', () => {
        const config = makeConfig({
            projectRoot: '/home/user/project',
            codeRoot: '/home/user/code',
        });
        const prompt = buildInitialPrompt(config, 7, 'title', 'desc');

        expect(prompt).toContain('Code tree path: /home/user/code');
    });

    it('omits code tree path when codeRoot is empty', () => {
        const config = makeConfig({
            projectRoot: '/home/user/project',
            codeRoot: '',
        });
        const prompt = buildInitialPrompt(config, 7, 'title', 'desc');

        expect(prompt).not.toContain('Code tree path');
    });

    it('omits code tree path when codeRoot equals projectRoot', () => {
        const config = makeConfig({
            projectRoot: '/home/user/project',
            codeRoot: '/home/user/project',
        });
        const prompt = buildInitialPrompt(config, 7, 'title', 'desc');

        expect(prompt).not.toContain('Code tree path');
    });
});

describe('agents — buildClaudeCommand', () => {
    it('includes exec claude, PATH export, and --worktree', () => {
        const config = makeConfig({ projectRoot: '/home/user/project' });
        const cmd = buildClaudeCommand(config, 7);

        expect(cmd).toContain('exec claude');
        expect(cmd).toContain('export PATH=');
        expect(cmd).toContain('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=95');
        expect(cmd).toContain('--worktree');
        expect(cmd).toContain('--add-dir');
        expect(cmd).toContain(config.agentPrompt);
    });

    it('includes code root --add-dir when codeRoot differs', () => {
        const config = makeConfig({
            projectRoot: '/home/user/project',
            codeRoot: '/home/user/code',
        });
        const cmd = buildClaudeCommand(config, 7);

        // Should have two --add-dir flags
        const addDirCount = (cmd.match(/--add-dir/g) || []).length;
        expect(addDirCount).toBe(2);
    });

    it('has single --add-dir when codeRoot is same as projectRoot', () => {
        const config = makeConfig({
            projectRoot: '/home/user/project',
            codeRoot: '/home/user/project',
        });
        const cmd = buildClaudeCommand(config, 7);

        const addDirCount = (cmd.match(/--add-dir/g) || []).length;
        expect(addDirCount).toBe(1);
    });
});

describe('agents — cleanupStaleLocks', () => {
    let tmpDir: string;
    let config: Config;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-agents-cleanup-'));
        config = makeConfig({ projectRoot: tmpDir });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('removes lockfiles with dead pane IDs', () => {
        // Create lockfiles with fake pane IDs that don't exist
        createLockfile(config, { paneId: '%99998', qnum: 1, headCommit: 'a' });
        createLockfile(config, { paneId: '%99999', qnum: 2, headCommit: 'b' });

        const cleaned = cleanupStaleLocks(config);
        expect(cleaned).toContain(1);
        expect(cleaned).toContain(2);
        expect(cleaned).toHaveLength(2);

        // Lockfiles should be gone
        expect(readLockfile(config, 1)).toBeUndefined();
        expect(readLockfile(config, 2)).toBeUndefined();
    });

    it('returns empty when no stale locks', () => {
        // No lockfiles at all
        expect(cleanupStaleLocks(config)).toEqual([]);
    });
});

describe('agents — killAgent', () => {
    let tmpDir: string;
    let config: Config;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-agents-kill-'));
        config = makeConfig({ projectRoot: tmpDir });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('removes lockfile even when pane is already dead', () => {
        createLockfile(config, { paneId: '%99999', qnum: 5, headCommit: 'abc' });
        expect(readLockfile(config, 5)).toBeDefined();

        killAgent(config, 5);
        expect(readLockfile(config, 5)).toBeUndefined();
    });

    it('is safe when no lockfile exists', () => {
        // Should not throw
        killAgent(config, 999);
    });
});

// Integration tests that require tmux
const tmuxAvailable = isTmuxAvailable();
const describeIfTmux = tmuxAvailable ? describe : describe.skip;

describeIfTmux('agents — tmux integration', () => {
    const TEST_SESSION = 'qr-agents-test';
    let tmpDir: string;
    let config: Config;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-agents-tmux-'));
        config = makeConfig({
            projectRoot: tmpDir,
            tmuxSession: TEST_SESSION,
        });
        killSession(TEST_SESSION);
    });

    afterEach(() => {
        killSession(TEST_SESSION);
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('spawnAgent creates pane, lockfile, and session', () => {
        const data = spawnAgent(config, 7, 'Test question', 'Some description');

        expect(data.paneId).toMatch(/^%\d+$/);
        expect(data.qnum).toBe(7);
        expect(hasSession(TEST_SESSION)).toBe(true);

        // Lockfile should exist
        const lock = readLockfile(config, 7);
        expect(lock).toBeDefined();
        expect(lock!.paneId).toBe(data.paneId);
    });

    it('spawnAgent reuses existing session for subsequent agents', () => {
        const data1 = spawnAgent(config, 1, 'Q1', 'desc');
        const data2 = spawnAgent(config, 2, 'Q2', 'desc');

        expect(data1.paneId).not.toBe(data2.paneId);
        expect(isPaneAlive(data1.paneId, TEST_SESSION)).toBe(true);
        expect(isPaneAlive(data2.paneId, TEST_SESSION)).toBe(true);
    });

    it('repromptAgent returns true for live pane', () => {
        // Create a long-lived pane directly (spawnAgent's pane command may exit
        // quickly if claude isn't installed or fails to start)
        const paneId = createSession(TEST_SESSION, { cwd: tmpDir, cmd: 'sleep 60' });
        createLockfile(config, { paneId, qnum: 7, headCommit: 'abc' });

        const result = repromptAgent(config, 7);
        expect(result).toBe(true);
    });

    it('repromptAgent returns false for dead pane and cleans up lockfile', () => {
        // Create lockfile with fake dead pane
        createLockfile(config, { paneId: '%99999', qnum: 42, headCommit: 'abc' });

        const result = repromptAgent(config, 42);
        expect(result).toBe(false);

        // Lockfile should have been cleaned up
        expect(readLockfile(config, 42)).toBeUndefined();
    });

    it('repromptAgent returns false when no lockfile', () => {
        expect(repromptAgent(config, 999)).toBe(false);
    });

    it('killAgent kills live pane and removes lockfile', () => {
        const data = spawnAgent(config, 7, 'Test', 'desc');
        expect(isPaneAlive(data.paneId, TEST_SESSION)).toBe(true);

        killAgent(config, 7);
        expect(isPaneAlive(data.paneId, TEST_SESSION)).toBe(false);
        expect(readLockfile(config, 7)).toBeUndefined();
    });

    it('isAgentRunning returns true for live agent', () => {
        spawnAgent(config, 7, 'Test', 'desc');
        expect(isAgentRunning(config, 7)).toBe(true);
    });

    it('cleanupStaleLocks preserves live agents', () => {
        const data = spawnAgent(config, 7, 'Test', 'desc');
        // Add a stale lockfile
        createLockfile(config, { paneId: '%99999', qnum: 99, headCommit: 'dead' });

        const cleaned = cleanupStaleLocks(config);
        expect(cleaned).toContain(99);
        expect(cleaned).not.toContain(7);

        // Live agent's lockfile should still exist
        expect(readLockfile(config, 7)).toBeDefined();
        expect(isPaneAlive(data.paneId, TEST_SESSION)).toBe(true);
    });

    it('sendInitialPrompt does not crash on live pane', () => {
        // Create a long-lived pane directly (spawnAgent's pane command may exit quickly)
        const paneId = createSession(TEST_SESSION, { cwd: tmpDir, cmd: 'sleep 60' });
        createLockfile(config, { paneId, qnum: 7, headCommit: 'abc' });

        // Should not throw
        sendInitialPrompt(config, 7, 'Test question', 'Some description');
    });
});
