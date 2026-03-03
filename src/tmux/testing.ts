import type { ShellExecutor, ShellResult, ShellExecOptions } from './exec.js';
import { ShellError } from './exec.js';

export interface RecordedCall {
    readonly cmd: string;
    readonly options?: ShellExecOptions;
}

export type MockResponse = ShellResult | ShellError;

/**
 * Create a mock ShellExecutor that records calls and replays
 * canned responses in order. When responses are exhausted,
 * returns a default empty success result.
 */
export function createMockExec(
    responses: MockResponse[] = [],
): { exec: ShellExecutor; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    let index = 0;

    const exec: ShellExecutor = async (cmd, options) => {
        calls.push({ cmd, options });

        const defaultResult: ShellResult = { stdout: '', stderr: '', exitCode: 0 };

        if (index >= responses.length) {
            return defaultResult;
        }

        const entry = responses[index++]!;

        if (entry instanceof ShellError) {
            throw entry;
        }

        return entry;
    };

    return { exec, calls };
}

/**
 * Create a ShellError for use in mock responses.
 */
export function mockShellError(
    cmd: string = 'tmux mock-command',
    opts?: { exitCode?: number; stderr?: string; timedOut?: boolean },
): ShellError {
    return new ShellError(
        `Mock failure: ${cmd}`,
        cmd,
        opts?.exitCode ?? 1,
        '',
        opts?.stderr ?? 'error',
        opts?.timedOut ?? false,
    );
}
