import { execFile } from 'node:child_process';

export interface ShellResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
}

export interface ShellExecOptions {
    readonly timeoutMs?: number;
    readonly cwd?: string;
}

export type ShellExecutor = (
    cmd: string,
    options?: ShellExecOptions,
) => Promise<ShellResult>;

export class ShellError extends Error {
    readonly name = 'ShellError' as const;

    constructor(
        message: string,
        readonly cmd: string,
        readonly exitCode: number | null,
        readonly stdout: string,
        readonly stderr: string,
        readonly timedOut: boolean,
    ) {
        super(message);
    }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export const defaultExec: ShellExecutor = (
    cmd: string,
    options?: ShellExecOptions,
): Promise<ShellResult> => {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        execFile(
            'bash',
            ['-c', cmd],
            {
                encoding: 'utf-8',
                timeout: timeoutMs,
                cwd: options?.cwd,
                maxBuffer: 1024 * 1024,
            },
            (error, stdout, stderr) => {
                const out = (stdout ?? '').trimEnd();
                const err = (stderr ?? '').trimEnd();

                if (error) {
                    const timedOut = (error as NodeJS.ErrnoException).killed === true;
                    reject(new ShellError(
                        timedOut
                            ? `Command timed out after ${timeoutMs}ms: ${cmd}`
                            : `Command failed: ${cmd}`,
                        cmd,
                        typeof error.code === 'number' ? error.code : null,
                        out,
                        err,
                        timedOut,
                    ));
                    return;
                }

                resolve({ stdout: out, stderr: err, exitCode: 0 });
            },
        );
    });
};

/** Shell-escape a string for safe use in commands. */
export function esc(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
