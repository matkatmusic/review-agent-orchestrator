import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveProjectRoot, loadConfig, _parseShellConfig } from '../config.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-config-test-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
        // Clean up any env vars we set
        delete process.env['MAX_AGENTS'];
        delete process.env['TMUX_SESSION'];
        delete process.env['SCAN_INTERVAL'];
        delete process.env['TERMINAL_APP'];
        delete process.env['CODE_ROOT'];
    });

    describe('parseShellConfig', () => {
        it('parses simple assignments', () => {
            const file = join(tmpDir, 'test.sh');
            writeFileSync(file, 'MAX_AGENTS=4\nTMUX_SESSION="my-session"\nSCAN_INTERVAL=5\n');
            const vars = _parseShellConfig(file);
            expect(vars['MAX_AGENTS']).toBe('4');
            expect(vars['TMUX_SESSION']).toBe('my-session');
            expect(vars['SCAN_INTERVAL']).toBe('5');
        });

        it('ignores comments and blank lines', () => {
            const file = join(tmpDir, 'test.sh');
            writeFileSync(file, '#!/usr/bin/env bash\n# comment\n\nMAX_AGENTS=2\n');
            const vars = _parseShellConfig(file);
            expect(vars['MAX_AGENTS']).toBe('2');
            expect(Object.keys(vars)).toHaveLength(1);
        });

        it('skips lines with shell variable references', () => {
            const file = join(tmpDir, 'test.sh');
            writeFileSync(file, 'QUESTIONS_DIR="Questions"\nAWAITING_DIR="$QUESTIONS_DIR/Awaiting"\n');
            const vars = _parseShellConfig(file);
            expect(vars['QUESTIONS_DIR']).toBe('Questions');
            expect(vars['AWAITING_DIR']).toBeUndefined();
        });

        it('returns empty object for nonexistent file', () => {
            expect(_parseShellConfig(join(tmpDir, 'nope.sh'))).toEqual({});
        });

        it('handles single-quoted values', () => {
            const file = join(tmpDir, 'test.sh');
            writeFileSync(file, "TERMINAL_APP='iTerm'\n");
            const vars = _parseShellConfig(file);
            expect(vars['TERMINAL_APP']).toBe('iTerm');
        });
    });

    describe('resolveProjectRoot', () => {
        it('finds project root from subdir', () => {
            // Create: tmpDir/Questions/ and tmpDir/sub/deep/
            mkdirSync(join(tmpDir, 'Questions'));
            mkdirSync(join(tmpDir, 'sub', 'deep'), { recursive: true });

            const root = resolveProjectRoot(join(tmpDir, 'sub', 'deep'));
            expect(root).toBe(tmpDir);
        });

        it('finds project root when starting at root itself', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            const root = resolveProjectRoot(tmpDir);
            expect(root).toBe(tmpDir);
        });

        it('throws when Questions/ not found', () => {
            expect(() => resolveProjectRoot(tmpDir)).toThrow('Could not find project root');
        });
    });

    describe('loadConfig', () => {
        it('defaults applied when no config file', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            const config = loadConfig(tmpDir);

            expect(config.maxAgents).toBe(6);
            expect(config.tmuxSession).toBe('q-review');
            expect(config.questionsDir).toBe('Questions');
            expect(config.scanInterval).toBe(10);
            expect(config.projectRoot).toBe(tmpDir);
        });

        it('env vars override config file values', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            process.env['MAX_AGENTS'] = '3';
            process.env['TMUX_SESSION'] = 'env-session';
            process.env['SCAN_INTERVAL'] = '30';

            const config = loadConfig(tmpDir);

            expect(config.maxAgents).toBe(3);
            expect(config.tmuxSession).toBe('env-session');
            expect(config.scanInterval).toBe(30);
        });

        it('validates maxAgents >= 1', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            process.env['MAX_AGENTS'] = '0';

            expect(() => loadConfig(tmpDir)).toThrow('maxAgents must be >= 1');
        });

        it('invalid maxAgents falls back to default', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            process.env['MAX_AGENTS'] = 'notanumber';

            const config = loadConfig(tmpDir);
            expect(config.maxAgents).toBe(6);
        });

        it('codeRoot resolved relative to projectRoot', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            process.env['CODE_ROOT'] = 'some/subdir';

            const config = loadConfig(tmpDir);
            expect(config.codeRoot).toBe(join(tmpDir, 'some/subdir'));
        });

        it('absolute codeRoot left as-is', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            process.env['CODE_ROOT'] = '/absolute/path';

            const config = loadConfig(tmpDir);
            expect(config.codeRoot).toBe('/absolute/path');
        });

        it('empty codeRoot stays empty when env overrides config file', () => {
            mkdirSync(join(tmpDir, 'Questions'));
            // Explicitly set empty to override any config.local.sh value
            process.env['CODE_ROOT'] = '';
            const config = loadConfig(tmpDir);
            expect(config.codeRoot).toBe('');
        });
    });
});
