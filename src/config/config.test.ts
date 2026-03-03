import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('throws if config.json is missing', () => {
        expect(() => loadConfig(tmpDir)).toThrow('Config file not found');
    });

    it('loads valid config.json', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            maxAgents: 4,
            tmuxSession: 'test-session',
            scanInterval: 5,
            terminalApp: 'iTerm',
            agentPrompt: 'prompts/test.md',
            codeRoot: '',
            teardownTimeout: 30,
        }));

        const config = loadConfig(tmpDir);
        expect(config.maxAgents).toBe(4);
        expect(config.tmuxSession).toBe('test-session');
        expect(config.scanInterval).toBe(5);
        expect(config.terminalApp).toBe('iTerm');
        expect(config.agentPrompt).toBe('prompts/test.md');
        expect(config.teardownTimeout).toBe(30);
    });

    it('uses defaults for missing fields', () => {
        writeFileSync(join(tmpDir, 'config.json'), '{}');

        const config = loadConfig(tmpDir);
        expect(config.maxAgents).toBe(6);
        expect(config.tmuxSession).toBe('issue-review');
        expect(config.scanInterval).toBe(2);
        expect(config.teardownTimeout).toBe(60);
    });

    it('merges config.local.json overrides', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            maxAgents: 4,
            tmuxSession: 'base-session',
            scanInterval: 5,
            teardownTimeout: 60,
        }));
        writeFileSync(join(tmpDir, 'config.local.json'), JSON.stringify({
            maxAgents: 2,
            tmuxSession: 'local-session',
        }));

        const config = loadConfig(tmpDir);
        expect(config.maxAgents).toBe(2);
        expect(config.tmuxSession).toBe('local-session');
        // Non-overridden fields use base config
        expect(config.scanInterval).toBe(5);
        expect(config.teardownTimeout).toBe(60);
    });

    it('throws for invalid maxAgents', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            maxAgents: 0,
        }));

        expect(() => loadConfig(tmpDir)).toThrow('maxAgents must be >= 1');
    });

    it('throws for invalid scanInterval', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            scanInterval: 0,
        }));

        expect(() => loadConfig(tmpDir)).toThrow('scanInterval must be >= 1');
    });

    it('throws for invalid teardownTimeout', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            teardownTimeout: 0,
        }));

        expect(() => loadConfig(tmpDir)).toThrow('teardownTimeout must be >= 1');
    });

    it('resolves relative codeRoot to absolute', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            codeRoot: 'src',
        }));

        const config = loadConfig(tmpDir);
        expect(config.codeRoot).toBe(join(tmpDir, 'src'));
    });

    it('preserves absolute codeRoot', () => {
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
            codeRoot: '/absolute/path',
        }));

        const config = loadConfig(tmpDir);
        expect(config.codeRoot).toBe('/absolute/path');
    });
});
