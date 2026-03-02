import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import Header from '../tui/header.js';
import type { HeaderContext } from '../tui/header.js';

function renderHeader(context: HeaderContext, columns = 60) {
    return render(<Header context={context} columns={columns} />);
}

describe('header', () => {
    describe('title rule (line 1)', () => {
        it('renders "Review Agent Orchestrator" in the rule', () => {
            const { lastFrame } = renderHeader({ type: 'none' });
            expect(lastFrame()).toContain('Review Agent Orchestrator');
        });

        it('rule spans the full column width', () => {
            const cols = 80;
            const { lastFrame } = renderHeader({ type: 'none' }, cols);
            const lines = lastFrame()!.split('\n');
            // Line 1 is the rule — its visible length should match columns
            // The rule is made of ─ chars + title text
            const ruleLine = lines[0]!;
            // Count only the dash character (─ is multi-byte but 1 column wide)
            expect(ruleLine).toContain('─');
            expect(ruleLine).toContain('Review Agent Orchestrator');
            // Total visible width = dashes + title
            const title = ' Review Agent Orchestrator ';
            const dashCount = ruleLine.split('─').length - 1;
            expect(dashCount + title.length).toBe(cols);
        });

        it('centers the title within the rule', () => {
            const cols = 80;
            const { lastFrame } = renderHeader({ type: 'none' }, cols);
            const lines = lastFrame()!.split('\n');
            const ruleLine = lines[0]!;
            const titleIdx = ruleLine.indexOf(' Review Agent Orchestrator ');
            // Left dashes = titleIdx (each ─ is 1 column)
            const leftDashes = titleIdx;
            const title = ' Review Agent Orchestrator ';
            const rightDashes = cols - leftDashes - title.length;
            // Difference between left and right should be at most 1
            expect(Math.abs(leftDashes - rightDashes)).toBeLessThanOrEqual(1);
        });
    });

    describe('question context', () => {
        const questionCtx: HeaderContext = {
            type: 'question',
            qnum: 7,
            status: 'Awaiting',
            blockers: [1, 3],
            description: 'Check the auth flow',
        };

        it('shows Q# on line 2', () => {
            const { lastFrame } = renderHeader(questionCtx);
            expect(lastFrame()).toContain('Q7');
        });

        it('shows status on line 2', () => {
            const { lastFrame } = renderHeader(questionCtx);
            expect(lastFrame()).toContain('status:');
            expect(lastFrame()).toContain('Awaiting');
        });

        it('shows blockers on line 2', () => {
            const { lastFrame } = renderHeader(questionCtx);
            expect(lastFrame()).toContain('blocked by:');
            expect(lastFrame()).toContain('Q1');
            expect(lastFrame()).toContain('Q3');
        });

        it('shows "(none)" when no blockers', () => {
            const ctx: HeaderContext = {
                type: 'question',
                qnum: 2,
                status: 'Active',
                blockers: [],
                description: 'No deps',
            };
            const { lastFrame } = renderHeader(ctx);
            expect(lastFrame()).toContain('(none)');
        });

        it('shows description on line 3', () => {
            const { lastFrame } = renderHeader(questionCtx);
            expect(lastFrame()).toContain('desc:');
            expect(lastFrame()).toContain('Check the auth flow');
        });

        it('truncates long descriptions to fit columns', () => {
            const longDesc = 'A'.repeat(200);
            const ctx: HeaderContext = {
                type: 'question',
                qnum: 1,
                status: 'Active',
                blockers: [],
                description: longDesc,
            };
            const cols = 60;
            const { lastFrame } = renderHeader(ctx, cols);
            expect(lastFrame()).toContain('...');
            // "desc: " is 6 chars, so max desc is 54 chars
            // Truncated: 51 chars + "..." = 54
            expect(lastFrame()).not.toContain('A'.repeat(55));
        });

        it('collapses newlines in description to spaces', () => {
            const ctx: HeaderContext = {
                type: 'question',
                qnum: 1,
                status: 'Active',
                blockers: [],
                description: 'line one\nline two\nline three',
            };
            const { lastFrame } = renderHeader(ctx);
            expect(lastFrame()).toContain('line one line two line three');
        });
    });

    describe('new-question context', () => {
        it('shows "New Question" on line 2', () => {
            const { lastFrame } = renderHeader({ type: 'new-question' });
            expect(lastFrame()).toContain('New Question');
        });

        it('shows subtitle on line 3', () => {
            const { lastFrame } = renderHeader({ type: 'new-question' });
            expect(lastFrame()).toContain('Fill in the fields below');
        });
    });

    describe('none context', () => {
        it('shows "(no question selected)" on line 2', () => {
            const { lastFrame } = renderHeader({ type: 'none' });
            expect(lastFrame()).toContain('(no question selected)');
        });
    });

    describe('different column widths', () => {
        it('handles narrow columns gracefully', () => {
            // Title is 27 chars (" Review Agent Orchestrator "), cols=30 means only 3 dashes
            const { lastFrame } = renderHeader({ type: 'none' }, 30);
            expect(lastFrame()).toContain('Review Agent Orchestrator');
        });

        it('handles columns smaller than title', () => {
            // Should not crash — dashCount clamped to 0
            const { lastFrame } = renderHeader({ type: 'none' }, 10);
            expect(lastFrame()).toContain('Review Agent Orchestrator');
        });
    });
});
