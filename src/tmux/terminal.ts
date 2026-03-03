import type { ShellExecutor } from './exec.js';
import { defaultExec } from './exec.js';

/** Escape a string for safe embedding in AppleScript double-quoted strings. */
function escapeAppleScript(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build the osascript command string for a given terminal app.
 * Pure function — exported for testability.
 */
export function buildOsascript(
    terminalApp: string,
    sessionName: string,
): string {
    const safe = escapeAppleScript(sessionName);

    switch (terminalApp) {
        case 'Terminal':
        case 'Terminal.app':
            return [
                'tell application "Terminal"',
                '    activate',
                `    do script "tmux attach-session -t ${safe}"`,
                'end tell',
            ].join('\n');

        case 'iTerm':
        case 'iTerm2':
            return [
                'tell application "iTerm"',
                '    activate',
                `    create window with default profile command "tmux attach-session -t ${safe}"`,
                'end tell',
            ].join('\n');

        default:
            throw new Error(`Unsupported terminalApp: ${terminalApp}`);
    }
}

/**
 * Open a terminal window attached to a tmux session.
 * Uses osascript on macOS. Fails silently if the terminal app is unavailable.
 *
 * terminalApp='none' is a no-op (for headless/SSH environments).
 */
export async function openTerminalWindow(
    sessionName: string,
    terminalApp: string,
    exec: ShellExecutor = defaultExec,
): Promise<void> {
    if (terminalApp === 'none') return;

    try {
        const script = buildOsascript(terminalApp, sessionName);
        await exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    } catch {
        // Terminal app not found or osascript failed — session still exists headlessly
    }
}
