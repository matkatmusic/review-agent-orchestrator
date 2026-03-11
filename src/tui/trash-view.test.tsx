import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { TrashView } from './trash-view.js';
import type { Issue } from '../types.js';
import { IssueStatus } from '../types.js';
import type { TerminalProps, LayoutProps } from './views.js';
import { VIEW_SHORTCUTS } from './footer.js';
import { ViewType } from './views.js';
import { CONFIRM_DELETE_SHORTCUTS, CONFIRM_EMPTY_SHORTCUTS } from './footer.js';

function makeTrashedIssue(overrides: Partial<Issue> & { inum: number; title: string; trashed_at: string }): Issue {
    return {
        description: '',
        status: IssueStatus.Trashed,
        created_at: '2026-01-01T00:00:00Z',
        resolved_at: null,
        issue_revision: 1,
        agent_last_read_at: null,
        user_last_viewed_at: null,
        blocked_by: [],
        ...overrides,
    };
}

// Fixed "now" = 2026-03-09T00:00:00Z for deterministic Days column
const FIXED_NOW = new Date('2026-03-09T00:00:00Z').getTime();

const TRASHED_ISSUES: Issue[] = [
    makeTrashedIssue({ inum: 9, title: 'trashed_blocked_by_five', trashed_at: '2026-03-05T00:00:00Z', blocked_by: [5] }),
    makeTrashedIssue({ inum: 10, title: 'trashed_blocks_four', trashed_at: '2026-03-04T00:00:00Z' }),
    makeTrashedIssue({ inum: 11, title: 'trashed_standalone', trashed_at: '2026-03-01T00:00:00Z' }),
];

const TP: TerminalProps = { columns: 80, rows: 24 };
const LP: LayoutProps = { headerLines: 3, footerLines: 1 };

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = () => new Promise(r => setTimeout(r, 50));

function cursorLine(frame: string): string | undefined {
    return stripAnsi(frame).split('\n').find(l => l.includes('\u25B8'));
}

// ---- Rendering ----

describe('TrashView -- render basics', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('renders without crashing', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        expect(lastFrame()).toBeDefined();
    });

    it('renders issue titles in the list', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('trashed_blocked_by_five');
        expect(plain).toContain('trashed_blocks_four');
        expect(plain).toContain('trashed_standalone');
    });

    it('renders inum identifiers (I-N format)', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('I-9');
        expect(plain).toContain('I-10');
        expect(plain).toContain('I-11');
    });

    it('renders Days column showing days since trashed', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i9Line = lines.find(l => l.includes('I-9'));
        expect(i9Line).toContain('4d');
        const i10Line = lines.find(l => l.includes('I-10'));
        expect(i10Line).toContain('5d');
        const i11Line = lines.find(l => l.includes('I-11'));
        expect(i11Line).toContain('8d');
    });

    it('renders empty state when no trashed issues', () => {
        const { lastFrame } = render(
            <TrashView issues={[]} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('Trash is empty.');
    });

    it('does not show Unread or Status columns', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).not.toContain('Unread');
        expect(plain).not.toContain('Status');
    });

    it('renders column header row with ID, Title, Days', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        const headerLine = plain.split('\n')[0];
        expect(headerLine).toContain('ID');
        expect(headerLine).toContain('Title');
        expect(headerLine).toContain('Days');
    });
});

// ---- Cursor navigation ----

describe('TrashView -- cursor navigation', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('selected row shows caret indicator', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        expect(cursorLine(lastFrame()!)).toBeDefined();
    });

    it('initial cursor is on first issue', () => {
        const { lastFrame } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        expect(cursorLine(lastFrame()!)).toContain('I-9');
    });

    it('down arrow moves cursor to next item', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('\x1b[B');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-10');
    });

    it('up arrow moves cursor to previous item', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-9');
    });

    it('cursor clamps at boundaries', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Try going above first
        stdin.write('\x1b[A'); await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-9');
        // Go past last
        for (let i = 0; i < 10; i++) { stdin.write('\x1b[B'); await tick(); }
        expect(cursorLine(lastFrame()!)).toContain('I-11');
    });
});

// ---- Footer shortcuts ----

describe('TrashView -- setFooterShortcuts', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('calls setFooterShortcuts with Trash view shortcuts on mount', async () => {
        const handler = vi.fn();
        render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await tick();
        expect(handler).toHaveBeenCalledWith(VIEW_SHORTCUTS[ViewType.Trash]);
    });

    it('calls setFooterShortcuts with confirm delete shortcuts when d pressed', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await settle();
        handler.mockClear();
        stdin.write('d');
        await settle();
        expect(handler).toHaveBeenCalledWith(CONFIRM_DELETE_SHORTCUTS);
    });

    it('calls setFooterShortcuts with confirm empty shortcuts when e pressed', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await settle();
        handler.mockClear();
        stdin.write('e');
        await settle();
        expect(handler).toHaveBeenCalledWith(CONFIRM_EMPTY_SHORTCUTS);
    });

    it('restores Trash view shortcuts after Esc cancels', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await settle();
        stdin.write('d'); await settle();
        handler.mockClear();
        stdin.write('\x1b'); await settle();
        expect(handler).toHaveBeenCalledWith(VIEW_SHORTCUTS[ViewType.Trash]);
    });
});

// ---- Restore hotkey ----

describe('TrashView -- restore hotkey [r]', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('r calls onRestoreIssue with selected issue inum', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onRestoreIssue={handler} />
        );
        await tick();
        stdin.write('r');
        await tick();
        expect(handler).toHaveBeenCalledWith(9);
    });

    it('r after navigating calls with correct inum', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onRestoreIssue={handler} />
        );
        await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('r'); await tick();
        expect(handler).toHaveBeenCalledWith(10);
    });

    it('r on empty list does not crash', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={[]} terminalProps={TP} layoutProps={LP} onRestoreIssue={handler} />
        );
        await tick();
        stdin.write('r'); await tick();
        expect(handler).not.toHaveBeenCalled();
    });
});

// ---- Delete confirmation ----

describe('TrashView -- permanent delete hotkey [d]', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('d once enters confirm state (does not call onPermanentDelete)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onPermanentDelete={handler} />
        );
        await tick();
        stdin.write('d'); await settle();
        expect(handler).not.toHaveBeenCalled();
    });

    it('d d calls onPermanentDelete with selected inum', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onPermanentDelete={handler} />
        );
        await tick();
        stdin.write('d'); await settle();
        stdin.write('d'); await settle();
        expect(handler).toHaveBeenCalledWith(9);
    });

    it('d then Esc cancels', async () => {
        const handler = vi.fn();
        const footerSpy = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onPermanentDelete={handler} setFooterShortcuts={footerSpy} />
        );
        await settle();
        stdin.write('d'); await settle();
        stdin.write('\x1b'); await settle();
        expect(handler).not.toHaveBeenCalled();
    });

    it('d shows confirmation modal with issue number', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('d'); await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('Really delete I-9?');
        expect(plain).toContain('Confirm delete');
        expect(plain).toContain('Cancel');
    });

    it('modal replaces issue list (titles not visible during confirm)', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('d'); await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain).not.toContain('trashed_blocked_by_five');
        expect(plain).not.toContain('trashed_blocks_four');
        expect(plain).not.toContain('trashed_standalone');
    });

    it('modal disappears after Esc (issue list returns)', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('d'); await tick();
        stdin.write('\x1b'); await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain).not.toContain('Really delete');
        expect(plain).toContain('trashed_blocked_by_five');
    });
});

// ---- Empty trash confirmation ----

describe('TrashView -- empty trash hotkey [e]', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('e once enters confirm state (does not call onEmptyTrash)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onEmptyTrash={handler} />
        );
        await tick();
        stdin.write('e'); await settle();
        expect(handler).not.toHaveBeenCalled();
    });

    it('e e calls onEmptyTrash', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onEmptyTrash={handler} />
        );
        await tick();
        stdin.write('e'); await settle();
        stdin.write('e'); await settle();
        expect(handler).toHaveBeenCalledOnce();
    });

    it('e then Esc cancels', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onEmptyTrash={handler} />
        );
        await tick();
        stdin.write('e'); await settle();
        stdin.write('\x1b'); await settle();
        expect(handler).not.toHaveBeenCalled();
    });

    it('e shows empty trash confirmation modal', async () => {
        const { lastFrame, stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('e'); await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('Really empty trash?');
    });
});

// ---- Header subtitle override ----

describe('TrashView -- header subtitle override', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('does not set subtitle override during delete confirmation (modal handles it)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setHeaderSubtitleOverride={handler} />
        );
        await settle();
        handler.mockClear();
        stdin.write('d'); await settle();
        // Should always clear (undefined), never set a string
        expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('does not set subtitle override during empty trash confirmation (modal handles it)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setHeaderSubtitleOverride={handler} />
        );
        await settle();
        handler.mockClear();
        stdin.write('e'); await settle();
        expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('clears subtitle override after cancellation', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} setHeaderSubtitleOverride={handler} />
        );
        await settle();
        stdin.write('d'); await settle();
        handler.mockClear();
        stdin.write('\x1b'); await settle();
        expect(handler).toHaveBeenCalledWith(undefined);
    });
});

// ---- Confirmation state isolation ----

describe('TrashView -- confirmation state isolation', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('while in d confirm state, r is ignored', async () => {
        const restoreSpy = vi.fn();
        const deleteSpy = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onRestoreIssue={restoreSpy} onPermanentDelete={deleteSpy} />
        );
        await tick();
        stdin.write('d'); await settle();
        stdin.write('r'); await settle();
        expect(restoreSpy).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('while in e confirm state, d is ignored', async () => {
        const deleteSpy = vi.fn();
        const emptySpy = vi.fn();
        const { stdin } = render(
            <TrashView issues={TRASHED_ISSUES} terminalProps={TP} layoutProps={LP} onPermanentDelete={deleteSpy} onEmptyTrash={emptySpy} />
        );
        await tick();
        stdin.write('e'); await settle();
        stdin.write('d'); await settle();
        expect(deleteSpy).not.toHaveBeenCalled();
        expect(emptySpy).not.toHaveBeenCalled();
    });
});
