import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { DetailView, buildConversationLines } from './detail.js';
import type { Issue, Response as IssueResponse } from '../types.js';
import {IssueStatus} from "../types.js"

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
        id: 1, inum: 1, author: 'user',
        body: 'Please implement JWT auth.',
        created_at: '2025-01-15T10:05:00Z',
    },
    {
        id: 2, inum: 1, author: 'agent',
        body: '(analysis) Examining the existing auth setup.',
        created_at: '2025-01-15T10:10:00Z',
    },
    {
        id: 3, inum: 1, author: 'user',
        body: 'Also handle token revocation.',
        created_at: '2025-01-15T11:00:00Z',
    },
    {
        id: 4, inum: 1, author: 'agent',
        body: '(implementation) Added token revocation endpoint.',
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

    it('renders user messages with [user] label', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('[user]');
    });

    it('renders agent messages with [agent] label', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('[agent]');
    });

    it('renders message bodies', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('Please implement JWT auth.');
    });

    it('renders type tags in agent responses', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('(analysis)');
        expect(lastFrame()).toContain('(implementation)');
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
        // Both author types should be present
        expect(frame).toContain('[user]');
        expect(frame).toContain('[agent]');
    });

    // ---- Scrolling ----

    it('scrolls down with down arrow to reveal new content', async () => {
        // Create many messages to force scrolling
        const manyResponses: IssueResponse[] = Array.from({ length: 20 }, (_, i) => ({
            id: i + 1,
            inum: 1,
            author: (i % 2 === 0 ? 'user' : 'agent') as 'user' | 'agent',
            body: `Message ${i + 1} body text here`,
            created_at: `2025-01-${String(15 + Math.floor(i / 10)).padStart(2, '0')}T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
        }));

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} responses={manyResponses} rows={15} />
        );
        await tick();

        const frameBefore = lastFrame();
        expect(frameBefore).toContain('Message 1');

        // Scroll down several times
        for (let i = 0; i < 5; i++) {
            stdin.write('\u001B[B'); // Down arrow
            await tick();
        }

        const frameAfter = lastFrame();
        expect(frameAfter).not.toBe(frameBefore);
    });

    it('does not scroll above top', async () => {
        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} />
        );
        await tick();

        const frameBefore = lastFrame();

        // Press up arrow at top
        stdin.write('\u001B[A'); // Up arrow
        await tick();

        expect(lastFrame()).toBe(frameBefore);
    });

    it('does not scroll past bottom', async () => {
        // Small set of responses that fits on screen
        const fewResponses: IssueResponse[] = [
            { id: 1, inum: 1, author: 'user', body: 'Hello', created_at: '2025-01-15T10:00:00Z' },
        ];

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} responses={fewResponses} rows={24} />
        );
        await tick();

        const frameBefore = lastFrame();

        // Press down arrow when content fits
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

// ---- Unit tests for buildConversationLines ----

describe('buildConversationLines', () => {
    it('returns empty array for no responses', () => {
        expect(buildConversationLines([])).toEqual([]);
    });

    it('creates author-header line for each response', () => {
        const responses: IssueResponse[] = [
            { id: 1, inum: 1, author: 'user', body: 'Hello', created_at: '2025-01-15T10:00:00Z' },
        ];
        const lines = buildConversationLines(responses);
        const headers = lines.filter(l => l.type === 'author-header');
        expect(headers).toHaveLength(1);
        expect(headers[0].text).toContain('[user]');
        expect(headers[0].text).toContain('2025-01-15 10:00:00');
    });

    it('splits multi-line body into separate body lines', () => {
        const responses: IssueResponse[] = [
            { id: 1, inum: 1, author: 'agent', body: 'Line 1\nLine 2\nLine 3', created_at: '2025-01-15T10:00:00Z' },
        ];
        const lines = buildConversationLines(responses);
        const bodyLines = lines.filter(l => l.type === 'body');
        expect(bodyLines).toHaveLength(3);
        expect(bodyLines[0].text).toBe('Line 1');
        expect(bodyLines[1].text).toBe('Line 2');
        expect(bodyLines[2].text).toBe('Line 3');
    });

    it('adds separator after each response', () => {
        const responses: IssueResponse[] = [
            { id: 1, inum: 1, author: 'user', body: 'A', created_at: '2025-01-15T10:00:00Z' },
            { id: 2, inum: 1, author: 'agent', body: 'B', created_at: '2025-01-15T10:01:00Z' },
        ];
        const lines = buildConversationLines(responses);
        const separators = lines.filter(l => l.type === 'separator');
        expect(separators).toHaveLength(2);
    });

    it('preserves author on body lines', () => {
        const responses: IssueResponse[] = [
            { id: 1, inum: 1, author: 'agent', body: '(fix) Done', created_at: '2025-01-15T10:00:00Z' },
        ];
        const lines = buildConversationLines(responses);
        const bodyLines = lines.filter(l => l.type === 'body');
        expect(bodyLines[0].author).toBe('agent');
    });
});
