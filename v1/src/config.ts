import type { Config } from './types.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULTS: Config = {
    maxAgents: 6,
    tmuxSession: 'q-review',
    projectRoot: '',
    scanInterval: 10,
    terminalApp: 'Terminal',
    agentPrompt: 'prompts/review-agent.md',
    codeRoot: '',
};

/**
 * Parse simple shell variable assignments from a config.sh file.
 * Handles: VAR=value, VAR="value", VAR='value'
 * Ignores comments, blank lines, and non-assignment lines.
 */
function parseShellConfig(filepath: string): Record<string, string> {
    const vars: Record<string, string> = {};
    if (!existsSync(filepath)) return vars;

    const lines = readFileSync(filepath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Match VAR=VALUE (no spaces around =)
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (!match) continue;

        let value = match[2]!;
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        // Skip lines with shell variable references (e.g., $QUESTIONS_DIR)
        if (value.includes('$')) continue;

        vars[match[1]!] = value;
    }
    return vars;
}

/**
 * Resolve project root by walking up from the submodule's own location
 * to find a directory containing a Questions/ folder.
 */
export function resolveProjectRoot(startDir?: string): string {
    let dir = startDir ?? getSubmoduleDir();

    // Walk up looking for a Questions/ directory
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, 'Questions'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) break; // reached filesystem root
        dir = parent;
    }

    throw new Error(
        `Could not find project root (directory containing Questions/). Searched up from: ${startDir ?? getSubmoduleDir()}`
    );
}

function getSubmoduleDir(): string {
    const __filename = fileURLToPath(import.meta.url);
    const srcDir = dirname(__filename);
    // src/ → submodule root (one level up)
    return dirname(srcDir);
}

/**
 * Load configuration. Priority: env vars > config.local.sh > config.sh > defaults.
 */
export function loadConfig(projectRoot?: string): Config {
    const root = projectRoot ?? resolveProjectRoot();
    const submoduleDir = getSubmoduleDir();

    // Load config files (config.sh first, then config.local.sh overrides)
    const baseConfig = parseShellConfig(join(submoduleDir, 'config.sh'));
    const localConfig = parseShellConfig(join(submoduleDir, 'config.local.sh'));
    const merged = { ...baseConfig, ...localConfig };

    // Map shell var names to Config fields
    const config: Config = {
        maxAgents: toInt(env('MAX_AGENTS') ?? merged['MAX_AGENTS'], DEFAULTS.maxAgents),
        tmuxSession: env('TMUX_SESSION') ?? merged['TMUX_SESSION'] ?? DEFAULTS.tmuxSession,
        projectRoot: root,
        scanInterval: toInt(env('SCAN_INTERVAL') ?? merged['SCAN_INTERVAL'], DEFAULTS.scanInterval),
        terminalApp: env('TERMINAL_APP') ?? merged['TERMINAL_APP'] ?? DEFAULTS.terminalApp,
        agentPrompt: env('AGENT_PROMPT') ?? merged['AGENT_PROMPT'] ?? DEFAULTS.agentPrompt,
        codeRoot: envAllowEmpty('CODE_ROOT') ?? merged['CODE_ROOT'] ?? DEFAULTS.codeRoot,
    };

    // Resolve codeRoot relative to projectRoot if relative
    if (config.codeRoot && !config.codeRoot.startsWith('/')) {
        config.codeRoot = resolve(root, config.codeRoot);
    }

    validate(config);
    return config;
}

function env(name: string): string | undefined {
    const val = process.env[name];
    return val !== undefined && val !== '' ? val : undefined;
}

/** Like env() but treats empty string as a valid value (for optional fields). */
function envAllowEmpty(name: string): string | undefined {
    const val = process.env[name];
    return val !== undefined ? val : undefined;
}

function toInt(val: string | undefined, fallback: number): number {
    if (val === undefined) return fallback;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
}

function validate(config: Config): void {
    if (config.maxAgents < 1) {
        throw new Error(`maxAgents must be >= 1, got ${config.maxAgents}`);
    }
    if (!config.projectRoot) {
        throw new Error('projectRoot is required');
    }
}

// Re-export for testing
export { parseShellConfig as _parseShellConfig };
