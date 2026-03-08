import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { AppWrapper, processResetFlag } from './run.js';

vi.mock('./mock-store.js', () => ({
    resetMockData: vi.fn(),
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
        expect(plain).toContain('View');
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

    it('content area is empty (Phase 1 placeholder)', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        const lines = plain.split('\n');
        const subtitleIdx = lines.findIndex(l => l.includes('All issues and orchestration state'));
        const footerIdx = lines.findIndex(l => l.includes('['));
        expect(subtitleIdx).toBeGreaterThanOrEqual(0);
        expect(footerIdx).toBeGreaterThan(subtitleIdx);
        for (let i = subtitleIdx + 1; i < footerIdx; i++) {
            expect(lines[i].trim()).toBe('');
        }
    });
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
