import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runSetup } from '../setup.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('setup — runSetup', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-setup-test-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates Questions/{Awaiting,Resolved,Deferred}/', () => {
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, 'Questions', 'Awaiting'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'Resolved'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'Deferred'))).toBe(true);
    });

    it('creates .gitkeep files in Resolved/ and Deferred/', () => {
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, 'Questions', 'Resolved', '.gitkeep'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'Deferred', '.gitkeep'))).toBe(true);
    });

    it('copies template files to Questions/', () => {
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, 'Questions', 'agent_question_template.md'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'user_question_template.md'))).toBe(true);
        expect(existsSync(join(tmpDir, 'Questions', 'questions_guidelines.md'))).toBe(true);
    });

    it('does not overwrite existing template files', () => {
        const dest = join(tmpDir, 'Questions', 'agent_question_template.md');
        mkdirSync(join(tmpDir, 'Questions'), { recursive: true });
        writeFileSync(dest, 'custom content');

        runSetup(tmpDir);

        expect(readFileSync(dest, 'utf-8')).toBe('custom content');
    });

    it('creates .vscode/tasks.json', () => {
        runSetup(tmpDir);

        const tasksFile = join(tmpDir, '.vscode', 'tasks.json');
        expect(existsSync(tasksFile)).toBe(true);

        const content = JSON.parse(readFileSync(tasksFile, 'utf-8'));
        expect(content.version).toBe('2.0.0');
        expect(content.tasks).toHaveLength(1);
        expect(content.tasks[0].label).toBe('Question Review Daemon');
        expect(content.tasks[0].command).toContain('dist/daemon.js');
    });

    it('warns but does not overwrite existing tasks.json', () => {
        const vscodePath = join(tmpDir, '.vscode');
        mkdirSync(vscodePath, { recursive: true });
        writeFileSync(join(vscodePath, 'tasks.json'), JSON.stringify({ version: '2.0.0', tasks: [] }));

        runSetup(tmpDir);

        // Original tasks.json should not have been modified
        const content = JSON.parse(readFileSync(join(vscodePath, 'tasks.json'), 'utf-8'));
        expect(content.tasks).toHaveLength(0);

        // Snippet file should have been written
        expect(existsSync(join(vscodePath, 'question-review-task.json.snippet'))).toBe(true);
    });

    it('skips tasks.json snippet when daemon task already exists', () => {
        const vscodePath = join(tmpDir, '.vscode');
        mkdirSync(vscodePath, { recursive: true });
        writeFileSync(join(vscodePath, 'tasks.json'), JSON.stringify({
            version: '2.0.0',
            tasks: [{ label: 'Question Review Daemon' }],
        }));

        runSetup(tmpDir);

        // Snippet should NOT have been written
        expect(existsSync(join(vscodePath, 'question-review-task.json.snippet'))).toBe(false);
    });

    it('creates .question-review-logs/ and adds to .gitignore', () => {
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, '.question-review-logs'))).toBe(true);
        const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('.question-review-logs/');
    });

    it('does not duplicate .gitignore entry', () => {
        writeFileSync(join(tmpDir, '.gitignore'), '.question-review-logs/\n');

        runSetup(tmpDir);

        const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
        const count = (gitignore.match(/\.question-review-logs/g) || []).length;
        expect(count).toBe(1);
    });

    it('installs .claude/settings.json', () => {
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, '.claude', 'settings.json'))).toBe(true);
    });

    it('creates and migrates the database', () => {
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, 'questions.db'))).toBe(true);
    });

    it('is idempotent — running twice does not crash', () => {
        runSetup(tmpDir);
        runSetup(tmpDir);

        expect(existsSync(join(tmpDir, 'Questions', 'Awaiting'))).toBe(true);
    });
});
