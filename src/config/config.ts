import type { Config } from '../types.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULTS: Config = {
    maxAgents: 6,
    tmuxSession: 'issue-review',
    scanInterval: 2,
    terminalApp: 'Terminal',
    agentPrompt: 'prompts/review-agent.md',
    codeRoot: '',
    teardownTimeout: 60,
};

/**
 * Load configuration from config.json, merging with config.local.json if present.
 * Throws if config.json does not exist at the given project root.
 */
export function loadConfig(projectRoot: string): Config {
    const configPath = join(projectRoot, 'config.json');
    if (!existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }

    const base = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<Config>;

    // Merge local overrides if present
    const localPath = join(projectRoot, 'config.local.json');
    let local: Partial<Config> = {};
    if (existsSync(localPath)) {
        local = JSON.parse(readFileSync(localPath, 'utf-8')) as Partial<Config>;
    }

    const config: Config = {
        maxAgents: local.maxAgents ?? base.maxAgents ?? DEFAULTS.maxAgents,
        tmuxSession: local.tmuxSession ?? base.tmuxSession ?? DEFAULTS.tmuxSession,
        scanInterval: local.scanInterval ?? base.scanInterval ?? DEFAULTS.scanInterval,
        terminalApp: local.terminalApp ?? base.terminalApp ?? DEFAULTS.terminalApp,
        agentPrompt: local.agentPrompt ?? base.agentPrompt ?? DEFAULTS.agentPrompt,
        codeRoot: local.codeRoot ?? base.codeRoot ?? DEFAULTS.codeRoot,
        teardownTimeout: local.teardownTimeout ?? base.teardownTimeout ?? DEFAULTS.teardownTimeout,
    };

    // Resolve codeRoot relative to projectRoot if relative
    if (config.codeRoot && !config.codeRoot.startsWith('/')) {
        config.codeRoot = resolve(projectRoot, config.codeRoot);
    }

    validate(config);
    return config;
}

function validate(config: Config): void {
    if (config.maxAgents < 1) {
        throw new Error(`maxAgents must be >= 1, got ${config.maxAgents}`);
    }
    if (config.scanInterval < 1) {
        throw new Error(`scanInterval must be >= 1, got ${config.scanInterval}`);
    }
    if (config.teardownTimeout < 1) {
        throw new Error(`teardownTimeout must be >= 1, got ${config.teardownTimeout}`);
    }
}
