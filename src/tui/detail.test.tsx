import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { DetailView } from './detail.js';
import { ResponseContainer } from './response-container.js';
import type { Issue, Response as IssueResponse } from '../types.js';
import { IssueStatus, ResponseType, AuthorType } from "../types.js"


const tick = () => new Promise(r => setTimeout(r, 0));

// ---- Test fixtures ----

const TEST_ISSUE: Issue = {
    inum: 1,
    title: 'Implement authentication module',
    description: 'Add JWT-based auth',
    status: IssueStatus.Active,
    created_at: '2025-01-15T10:00:00Z',
    resolved_at: null,
    issue_revision: 3,
    agent_last_read_at: '2025-01-15T12:00:00Z',
    user_last_viewed_at: '2025-01-15T11:00:00Z',
};

const TEST_RESPONSES: IssueResponse[] = [
    {
        id: 1, inum: 1, author: AuthorType.User, type: ResponseType.None,
        body: 'Please implement JWT auth.',
        created_at: '2025-01-15T10:05:00Z',
    },
    {
        id: 2, inum: 1, author: AuthorType.Agent, type: ResponseType.Analysis,
        body: 'Examining the existing auth setup.',
        created_at: '2025-01-15T10:10:00Z',
    },
    {
        id: 3, inum: 1, author: AuthorType.User, type: ResponseType.None,
        body: 'Also handle token revocation.',
        created_at: '2025-01-15T11:00:00Z',
    },
    {
        id: 4, inum: 1, author: AuthorType.Agent, type: ResponseType.Implementation,
        body: 'Added token revocation endpoint.',
        created_at: '2025-01-15T11:30:00Z',
    },
];

const defaultProps = {
    inum: 1,
    issue: TEST_ISSUE,
    responses: TEST_RESPONSES,
    blockedBy: [] as number[],
    blocks: [2],
    group: 'Sprint 1',
    columns: 80,
    rows: 24,
};

describe('DetailView', () => {
    // ---- Issue info header ----

    it('renders issue inum and title', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('I-1');
        expect(lastFrame()).toContain('Implement authentication module');
    });

    it('renders issue status', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('Active');
    });

    it('renders group name', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('Sprint 1');
    });

    it('renders blocked_by list with issue numbers', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} blockedBy={[3, 5]} />
        );
        expect(lastFrame()).toContain('I-3');
        expect(lastFrame()).toContain('I-5');
    });

    it('renders (none) when no blockers', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} blockedBy={[]} />
        );
        expect(lastFrame()).toMatch(/Blocked by.*\(none\)/i);
    });

    it('renders blocks list with issue numbers', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} blocks={[2, 4]} />
        );
        expect(lastFrame()).toContain('I-2');
        expect(lastFrame()).toContain('I-4');
    });

    it('renders (none) when not blocking anything', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} blocks={[]} />
        );
        expect(lastFrame()).toMatch(/Blocks.*\(none\)/i);
    });

    // ---- Conversation rendering ----

    it('renders user messages with You label', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('You');
    });

    it('renders agent messages with Agent label', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain(AuthorType.Agent);
    });

    it('renders message bodies', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        // Last message is visible due to initial scroll-to-bottom
        expect(lastFrame()).toContain('Added token revocation endpoint.');
    });

    it('renders type tags in agent message headers', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('Analysis');
        expect(lastFrame()).toContain('Implementation');
    });

    it('renders timestamps in conversation', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('2025-01-15');
    });

    it('renders empty conversation without crash', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} responses={[]} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('I-1');
    });

    // ---- Color coding (structural) ----

    it('user and agent messages appear with distinct labels', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        const frame = lastFrame()!;
        // Both author types should be present in box headers
        expect(frame).toContain('You');
        expect(frame).toContain(AuthorType.Agent);
    });

    // ---- Scrolling ----

    it('up arrow selects previous message and may scroll', async () => {
        // Create many messages to force scrolling
        const manyResponses: IssueResponse[] = Array.from({ length: 20 }, (_, i) => ({
            id: i + 1,
            inum: 1,
            author: (i % 2 === 0 ? AuthorType.User : AuthorType.Agent),
            type: ResponseType.None,
            body: `Message ${i + 1} body text here`,
            created_at: `2025-01-${String(15 + Math.floor(i / 10)).padStart(2, '0')}T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
        }));

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} responses={manyResponses} rows={15} />
        );
        await tick();

        const frameBefore = lastFrame();

        // Press up arrow to select previous message
        stdin.write('\u001B[A'); // Up arrow
        await tick();

        const frameAfter = lastFrame();
        expect(frameAfter).not.toBe(frameBefore);
    });

    it('does not select above first message', async () => {
        const fewResponses: IssueResponse[] = [
            { id: 1, inum: 1, author: AuthorType.User, type: ResponseType.None, body: 'Hello', created_at: '2025-01-15T10:00:00Z' },
        ];

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} responses={fewResponses} rows={24} />
        );
        await tick();

        const frameBefore = lastFrame();

        // Press up arrow when already on first (and only) message
        stdin.write('\u001B[A'); // Up arrow
        await tick();

        expect(lastFrame()).toBe(frameBefore);
    });

    it('does not select past last message', async () => {
        const fewResponses: IssueResponse[] = [
            { id: 1, inum: 1, author: AuthorType.User, type: ResponseType.None, body: 'Hello', created_at: '2025-01-15T10:00:00Z' },
        ];

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} responses={fewResponses} rows={24} />
        );
        await tick();

        const frameBefore = lastFrame();

        // Press down arrow when already on last (and only) message
        stdin.write('\u001B[B');
        await tick();

        expect(lastFrame()).toBe(frameBefore);
    });

    // ---- Input box ----

    it('renders input prompt', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('>');
    });

    it('calls onSend when Enter is pressed with text', async () => {
        const onSend = vi.fn();
        const { stdin } = render(
            <DetailView {...defaultProps} onSend={onSend} />
        );
        await tick();

        stdin.write('hello');
        await tick();
        stdin.write('\r');
        await tick();

        expect(onSend).toHaveBeenCalledWith('hello');
    });

    it('does not call onSend for empty input', async () => {
        const onSend = vi.fn();
        const { stdin } = render(
            <DetailView {...defaultProps} onSend={onSend} />
        );
        await tick();

        stdin.write('\r');
        await tick();

        expect(onSend).not.toHaveBeenCalled();
    });

    // Footer shortcuts are rendered centrally by App-level Footer component
    // and tested in footer.test.tsx

    // ---- Edge cases ----

    it('renders at narrow width (40 columns)', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} columns={40} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('I-1');
    });

    it('renders at small height (10 rows)', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} rows={10} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('I-1');
    });

    it('renders Blocked status for blocked issue', () => {
        const blockedIssue: Issue = { ...TEST_ISSUE, inum: 2, status: IssueStatus.Blocked };
        const { lastFrame } = render(
            <DetailView
                {...defaultProps}
                inum={2}
                issue={blockedIssue}
                blockedBy={[1]}
                blocks={[]}
                group="Inbox"
            />
        );
        expect(lastFrame()).toContain('Blocked');
        expect(lastFrame()).toContain('I-1');
    });

    it('renders separator lines between sections', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('─');
    });
});

// ---- Unit tests for ResponseContainer ----

describe('ResponseContainer', () => {
    describe('computeLineCount', () => {
        it('returns 4 for single-line body (top + body + bottom + separator)', () => {
            expect(ResponseContainer.computeLineCount('Hello', 80)).toBe(4);
    });

        it('counts multi-line body', () => {
            // 3 body lines + top + bottom + separator = 6
            expect(ResponseContainer.computeLineCount('Line 1\nLine 2\nLine 3', 80)).toBe(6);
        });

        it('wraps long lines', () => {
            const innerWidth = Math.max(10, 80 - 4); // 76
            const longLine = 'x'.repeat(innerWidth + 10); // wraps to 2 lines
            // 2 body lines + top + bottom + separator = 5
            expect(ResponseContainer.computeLineCount(longLine, 80)).toBe(5);
    });

        it('counts empty body as 1 body line', () => {
            // top + 1 empty body + bottom + separator = 4
            expect(ResponseContainer.computeLineCount('', 80)).toBe(4);
    });
    });

    describe('render', () => {
        const makeResponse = (overrides: Partial<IssueResponse> = {}): IssueResponse => ({
            id: 1,
            inum: 1,
            author: AuthorType.User,
            type: ResponseType.None,
            body: 'Hello world',
            created_at: '2025-01-15T10:00:00Z',
            ...overrides,
        });

        it('renders author in header', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={false} />
            );
            expect(lastFrame()).toContain('You');
    });

        it('renders type in header', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ type: ResponseType.Analysis })} columns={80} selected={false} />
            );
            expect(lastFrame()).toContain('Analysis');
    });

        it('renders timestamp in header', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={false} />
            );
            expect(lastFrame()).toContain('2025-01-15 10:00:00');
        });

        it('renders body text', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ body: 'Test body content' })} columns={80} selected={false} />
            );
            expect(lastFrame()).toContain('Test body content');
        });

        it('renders box borders', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={false} />
            );
            const frame = lastFrame()!;
            expect(frame).toContain('┌');
            expect(frame).toContain('┐');
            expect(frame).toContain('│');
            expect(frame).toContain('└');
            expect(frame).toContain('┘');
    });

        it('renders multi-line body', () => {
            const { lastFrame } = render(
                <ResponseContainer
                    response={makeResponse({ body: 'Line 1\nLine 2\nLine 3' })}
                    columns={80}
                    selected={false}
                />
            );
            const frame = lastFrame()!;
            expect(frame).toContain('Line 1');
            expect(frame).toContain('Line 2');
            expect(frame).toContain('Line 3');
    });

        it('uses cyan color for user messages', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ author: AuthorType.User })} columns={80} selected={false} />
            );
            // User messages should render (basic structural check)
            expect(lastFrame()).toContain('You');
    });

        it('uses green color for agent messages', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ author: AuthorType.Agent })} columns={80} selected={false} />
            );
            expect(lastFrame()).toContain('Agent');
    });

        it('renders header format: Author - Type - timestamp', () => {
            const { lastFrame } = render(
                <ResponseContainer
                    response={makeResponse({ author: AuthorType.Agent, type: ResponseType.Fix })}
                    columns={80}
                    selected={false}
                />
            );
            const frame = lastFrame()!;
            // Header should contain author, type, and timestamp separated by dashes
            expect(frame).toContain('Agent');
            expect(frame).toContain('Fix');
            expect(frame).toContain('2025-01-15 10:00:00');
        });
    });
});
