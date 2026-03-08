import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { AppWrapper, processResetFlag } from './run.js';

vi.mock('./mock-store.js', () => ({
    resetMockData: vi.fn(),
    loadMockData: vi.fn(() => ({
        issues: [
            { inum: 1, title: 'test_issue', description: '', status: 0, created_at: '2026-01-01T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
        ],
        unreadInums: new Set<number>(),
        maxAgents: 6,
        detailData: {},
        containers: [],
        dependencies: [],
        containerIssues: {},
        nextResponseId: 1,
    })),
}));

describe('run.tsx — AppWrapper', () => {

    it('app renders without crashing', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        expect(plain).toContain('Review Agent Orchestrator');
        expect(plain).toContain('Home');
    });

    it('renders header, content area, and footer in vertical order', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        expect(plain).toContain('Review Agent Orchestrator');
        expect(plain).toContain('Quit');
        const titlePos = plain.indexOf('Review Agent Orchestrator');
        const quitPos = plain.indexOf('Quit');
        expect(titlePos).toBeLessThan(quitPos);
    });

    it('falls back to 80x24 when stdout has no dimensions', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const lines = output.split('\n');
        expect(lines).toHaveLength(24);
    });

    it('content area shows issue list', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        expect(plain).toContain('I-1');
        expect(plain).toContain('test_issue');
    });

    // q → exit() verified manually in tmux; ESM prevents mocking useApp in tests.
});

describe('run.tsx — --resetMockData flag', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = process.argv;
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('--resetMockData flag is processed before render', async () => {
        const { resetMockData } = await import('./mock-store.js');
        const resetMock = vi.mocked(resetMockData);
        resetMock.mockClear();
        process.argv = ['node', 'run.js', '--resetMockData'];
        processResetFlag();
        expect(resetMock).toHaveBeenCalledOnce();
    });

    it('resetMockData is NOT called when flag is absent', async () => {
        const { resetMockData } = await import('./mock-store.js');
        const resetMock = vi.mocked(resetMockData);
        resetMock.mockClear();
        process.argv = ['node', 'run.js'];
        processResetFlag();
        expect(resetMock).not.toHaveBeenCalled();
    });
});
