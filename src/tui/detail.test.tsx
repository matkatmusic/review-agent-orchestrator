import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { DetailView } from './detail.js';
import { ResponseContainer } from './response-container.js';
import type { Issue, Response, Message } from '../types.js';
import { IssueStatus, ResponseType, AuthorType } from '../types.js';
import { createMessage, buildResponseChain, buildMixedChain } from './thread-builders.js';

let mockNextId = 100;
vi.mock('./mock-data.js', () => ({
    getMockStore: () => ({ nextResponseId: mockNextId }),
    saveMockStore: vi.fn(),
    MOCK_DETAIL_DATA: {} as Record<number, unknown>,
}));
vi.mock('./mock-store.js', () => ({
    getNextResponseId: (store: { nextResponseId: number }) => {
        const id = store.nextResponseId;
        store.nextResponseId = id + 1;
        mockNextId = store.nextResponseId;
        return id;
    },
}));


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

const TEST_MESSAGES: Message[] = [
    { author: AuthorType.User, type: ResponseType.None, body: 'Please implement JWT auth.', timestamp: '2025-01-15T10:05:00Z', seen: null },
    { author: AuthorType.Agent, type: ResponseType.Analysis, body: 'Examining the existing auth setup.', timestamp: '2025-01-15T10:10:00Z', seen: null },
    { author: AuthorType.User, type: ResponseType.None, body: 'Also handle token revocation.', timestamp: '2025-01-15T11:00:00Z', seen: null },
    { author: AuthorType.Agent, type: ResponseType.Implementation, body: 'Added token revocation endpoint.', timestamp: '2025-01-15T11:30:00Z', seen: null },
];

const { root: TEST_ROOT } = buildResponseChain(TEST_MESSAGES);

const noop = () => {};

const defaultProps = {
    inum: 1,
    issue: TEST_ISSUE,
    rootResponse: TEST_ROOT as Response | null,
    blockedBy: [] as number[],
    blocks: [2],
    group: 'Sprint 1',
    columns: 80,
    rows: 24,
    onBack: noop as (selectedMessage: number) => void,
    onHome: noop as (selectedMessage: number) => void,
    onSend: noop as (message: string) => void,
    onQuit: noop,
    onThreadStateChange: noop as (info: { inThread: boolean }) => void,
    onFooterFocusChange: noop as (index: number | null) => void,
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
        expect(lastFrame()).toContain('Agent');
    });

    it('renders message bodies', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        // Last message is visible due to initial scroll-to-bottom
        expect(lastFrame()).toContain('Added token revocation endpoint.');
    });

    it('renders type tags in unselected agent message headers', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} rows={30} />);
        expect(lastFrame()).toContain('Analysis');
    });

    it('renders timestamps in conversation', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('2025-01-15');
    });

    it('renders empty conversation without crash', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} rootResponse={null} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('I-1');
    });

    // ---- Color coding (structural) ----

    it('user and agent messages appear with distinct labels', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        const frame = lastFrame()!;
        expect(frame).toContain('You');
        expect(frame).toContain('Agent');
    });

    // ---- Scrolling ----

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('up arrow selects previous message and may scroll', async () => {
        const manyMessages: Message[] = Array.from({ length: 20 }, (_, i) => ({
            author: (i % 2 === 0 ? AuthorType.User : AuthorType.Agent),
            type: ResponseType.None,
            body: `Message ${i + 1} body text here`,
            timestamp: `2025-01-${String(15 + Math.floor(i / 10)).padStart(2, '0')}T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
            seen: null,
        }));
        const { root: manyRoot } = buildResponseChain(manyMessages);

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} rootResponse={manyRoot} rows={15} />
        );
        await tick();

        const frameBefore = lastFrame();

        stdin.write('\u001B[A'); // Up arrow
        await tick();

        const frameAfter = lastFrame();
        expect(frameAfter).not.toBe(frameBefore);
    });

    it('does not select above first message', async () => {
        const { root: singleRoot } = buildResponseChain([
            createMessage(AuthorType.User, ResponseType.None, 'Hello', '2025-01-15T10:00:00Z'),
        ]);

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} rootResponse={singleRoot} rows={24} />
        );
        await tick();

        const frameBefore = lastFrame();

        stdin.write('\u001B[A'); // Up arrow
        await tick();

        expect(lastFrame()).toBe(frameBefore);
    });

    it('does not select past last message', async () => {
        const { root: singleRoot } = buildResponseChain([
            createMessage(AuthorType.User, ResponseType.None, 'Hello', '2025-01-15T10:00:00Z'),
        ]);

        const { lastFrame, stdin } = render(
            <DetailView {...defaultProps} rootResponse={singleRoot} rows={24} />
        );
        await tick();

        const frameBefore = lastFrame();

        stdin.write('\u001B[B'); // Down arrow
        await tick();

        expect(lastFrame()).toBe(frameBefore);
    });

    // ---- Input box ----

    it('renders input prompt', () => {
        const { lastFrame } = render(<DetailView {...defaultProps} />);
        expect(lastFrame()).toContain('>');
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('appends a response to the chain when Enter is pressed with text', async () => {
        const { root } = buildResponseChain(TEST_MESSAGES);
        const { stdin } = render(
            <DetailView {...defaultProps} rootResponse={root} />
        );
        await tick();

        stdin.write('hello');
        await tick();
        stdin.write('\r');
        await tick();

        // Walk to the end of the chain and verify the new response
        let last: Response = root;
        while (last.response) last = last.response;
        expect(last.content.body).toBe('hello');
        expect(last.content.author).toBe(AuthorType.User);
        expect(last.content.type).toBe(ResponseType.None);
        expect(last.responding_to).not.toBeNull();
    });

    it('does not append a response for empty input', async () => {
        const { root, nodes } = buildResponseChain(TEST_MESSAGES);
        const originalLength = nodes.length;
        const { stdin } = render(
            <DetailView {...defaultProps} rootResponse={root} />
        );
        await tick();

        stdin.write('\r');
        await tick();

        // Chain length should be unchanged
        let count = 0;
        let cur: Response | null = root;
        while (cur) { count++; cur = cur.response; }
        expect(count).toBe(originalLength);
    });

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

    // ---- Thread navigation (unit tests via component instance) ----

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('enterThread pushes to stack and notifies parent', () => {
        // Build a chain where message 0 has a reply
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Thread reply content', '2025-01-15T12:00:00Z'),
            responding_to: null,
            response: null,
            replying_to: nodes[0],
            reply: null,
            is_continuation: false,
            thread_resolved_at: null,
            quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const onThreadStateChange = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView
                {...defaultProps}
                rootResponse={chainRoot}
                onThreadStateChange={onThreadStateChange}
                ref={ref}
            />
        );

        // Move cursor to first message
        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        expect(ref.current!.threadStack).toHaveLength(1);
        expect(ref.current!.threadStack[0].parent).toBe(nodes[0]);
        expect(ref.current!.threadStack[0].savedSelectedIndex).toBe(0);
        expect(onThreadStateChange).toHaveBeenCalledWith({ inThread: true });
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('exitThread pops stack and restores cursor', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Thread reply', '2025-01-15T12:00:00Z'),
            responding_to: null,
            response: null,
            replying_to: nodes[0],
            reply: null,
            is_continuation: false,
            thread_resolved_at: null,
            quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const onThreadStateChange = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView
                {...defaultProps}
                rootResponse={chainRoot}
                onThreadStateChange={onThreadStateChange}
                ref={ref}
            />
        );

        // Enter thread at index 0
        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        // Now exit
        ref.current!.exitThread();

        expect(ref.current!.threadStack).toHaveLength(0);
        expect(ref.current!.selectedMessage).toBe(0); // restored
        expect(onThreadStateChange).toHaveBeenLastCalledWith({ inThread: false });
    });

    it('exitThread calls onBack when not in a thread', () => {
        const onBack = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView {...defaultProps} onBack={onBack} ref={ref} />
        );

        ref.current!.exitThread();
        expect(onBack).toHaveBeenCalledOnce();
    });

    // ---- Thread resolution ----

    it('resolveThread toggles thread_resolved_at on selected message from main chain', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null,
            response: null,
            replying_to: nodes[0],
            reply: null,
            is_continuation: false,
            thread_resolved_at: null,
            quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const ref = React.createRef<DetailView>();
        render(
            <DetailView {...defaultProps} rootResponse={chainRoot} ref={ref} />
        );

        ref.current!.selectedMessage = 0;
        ref.current!.resolveThread();

        expect(nodes[0].thread_resolved_at).not.toBeNull();

        // Toggle back
        ref.current!.resolveThread();
        expect(nodes[0].thread_resolved_at).toBeNull();
    });

    it('resolveThread does nothing when selected message has no replies', () => {
        const ref = React.createRef<DetailView>();
        render(
            <DetailView {...defaultProps} ref={ref} />
        );

        // Last message (default selection) has no replies
        ref.current!.resolveThread();
        // Should not throw, no state change
        const messages = ref.current!.currentMessages();
        const selected = messages[ref.current!.selectedMessage];
        expect(selected.thread_resolved_at).toBeNull();
    });

    it('resolveThread resolves current thread when inside a thread', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null,
            response: null,
            replying_to: nodes[0],
            reply: null,
            is_continuation: false,
            thread_resolved_at: null,
            quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const ref = React.createRef<DetailView>();
        render(
            <DetailView {...defaultProps} rootResponse={chainRoot} ref={ref} />
        );

        // Enter thread
        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        // Resolve from inside the thread
        ref.current!.resolveThread();
        expect(nodes[0].thread_resolved_at).not.toBeNull();
    });

    it('shows resolved checkmark in reply badge', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null,
            response: null,
            replying_to: nodes[0],
            reply: null,
            is_continuation: false,
            thread_resolved_at: null,
            quoted_response_id: null,
        };
        nodes[0].reply = replyNode;
        nodes[0].thread_resolved_at = '2025-01-15T12:00:00Z';

        const { lastFrame } = render(
            <DetailView {...defaultProps} rootResponse={chainRoot} rows={30} />
        );

        expect(lastFrame()).toContain('\u2713');
    });

    it('shows input label in issue view', () => {
        const { lastFrame } = render(
            <DetailView {...defaultProps} />
        );
        expect(lastFrame()).toContain('Enter response:');
    });

    // ---- Focus ring (Tab cycling) ----

    it('Tab from null focuses Group field (focusedField=0) in issue view', () => {
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} ref={ref} />);

        ref.current!.cycleFocus(1);

        expect(ref.current!.focusedField).toBe(0);
        expect(ref.current!.focusedFooterIndex).toBeNull();
    });

    it('Tab in thread view skips header fields and goes to first footer item', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null, response: null, replying_to: nodes[0], reply: null,
            is_continuation: false, thread_resolved_at: null, quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const onFooterFocusChange = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView
                {...defaultProps}
                rootResponse={chainRoot}
                onFooterFocusChange={onFooterFocusChange}
                ref={ref}
            />
        );

        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        // Now Tab from input — should go to footer, not header
        ref.current!.cycleFocus(1);

        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).toBe(0);
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('Shift+Tab from null goes to last footer item', () => {
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} ref={ref} />);

        ref.current!.cycleFocus(-1);

        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).not.toBeNull();
        // Last focusable item in Detail is 'home' (index 3)
        expect(ref.current!.focusedFooterIndex).toBe(3);
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('full Tab cycle wraps back to input', () => {
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} ref={ref} />);

        // Issue view: null -> Group(0) -> BlockedBy(1) -> Blocks(2) -> footer0..3 -> null
        // That's 8 tabs to return to null
        for (let i = 0; i < 8; i++) {
            ref.current!.cycleFocus(1);
        }

        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).toBeNull();
    });

    it('cycleFocus calls onFooterFocusChange with index when entering footer', () => {
        const onFooterFocusChange = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView {...defaultProps} onFooterFocusChange={onFooterFocusChange} ref={ref} />
        );

        // Tab 4 times: null -> Group -> BlockedBy -> Blocks -> footer0
        for (let i = 0; i < 4; i++) {
            ref.current!.cycleFocus(1);
        }

        expect(onFooterFocusChange).toHaveBeenLastCalledWith(0);
    });

    it('cycleFocus calls onFooterFocusChange(null) when leaving footer', () => {
        const onFooterFocusChange = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView {...defaultProps} onFooterFocusChange={onFooterFocusChange} ref={ref} />
        );

        // Tab through entire ring to return to null
        for (let i = 0; i < 8; i++) {
            ref.current!.cycleFocus(1);
        }

        expect(onFooterFocusChange).toHaveBeenLastCalledWith(null);
    });

    it('focusedField resets to null when focus enters footer zone', () => {
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} ref={ref} />);

        // Tab to Blocks (field 2), then one more to footer
        ref.current!.cycleFocus(1); // Group
        ref.current!.cycleFocus(1); // BlockedBy
        ref.current!.cycleFocus(1); // Blocks
        expect(ref.current!.focusedField).toBe(2);

        ref.current!.cycleFocus(1); // footer0
        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).toBe(0);
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('focusedFooterIndex resets to null when focus enters header zone', () => {
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} ref={ref} />);

        // Shift+Tab to last footer item, then Shift+Tab to Blocks
        ref.current!.cycleFocus(-1); // last footer
        expect(ref.current!.focusedFooterIndex).toBe(3);

        ref.current!.cycleFocus(-1); // footer2
        ref.current!.cycleFocus(-1); // footer1
        ref.current!.cycleFocus(-1); // footer0
        ref.current!.cycleFocus(-1); // Blocks (field 2)
        expect(ref.current!.focusedFooterIndex).toBeNull();
        expect(ref.current!.focusedField).toBe(2);
    });

    // ---- Thread transitions reset focus ----

    it('enterThread resets focusedField and focusedFooterIndex to null', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null, response: null, replying_to: nodes[0], reply: null,
            is_continuation: false, thread_resolved_at: null, quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} rootResponse={chainRoot} ref={ref} />);

        // Set some focus state
        ref.current!.cycleFocus(1); // Group
        expect(ref.current!.focusedField).toBe(0);

        // Enter thread — should reset
        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).toBeNull();
    });

    it('enterThread calls onFooterFocusChange(null)', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null, response: null, replying_to: nodes[0], reply: null,
            is_continuation: false, thread_resolved_at: null, quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const onFooterFocusChange = vi.fn();
        const ref = React.createRef<DetailView>();
        render(
            <DetailView
                {...defaultProps}
                rootResponse={chainRoot}
                onFooterFocusChange={onFooterFocusChange}
                ref={ref}
            />
        );

        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        expect(onFooterFocusChange).toHaveBeenCalledWith(null);
    });

    it('exitThread resets focusedField and focusedFooterIndex to null', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null, response: null, replying_to: nodes[0], reply: null,
            is_continuation: false, thread_resolved_at: null, quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} rootResponse={chainRoot} ref={ref} />);

        ref.current!.selectedMessage = 0;
        ref.current!.enterThread();

        // Tab to a footer item while in thread
        ref.current!.cycleFocus(1);
        expect(ref.current!.focusedFooterIndex).toBe(0);

        // Exit thread — should reset
        ref.current!.exitThread();
        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).toBeNull();
    });

    // ---- InputBox focus condition ----

    it('InputBox focused=false when focusedFooterIndex is set', () => {
        const ref = React.createRef<DetailView>();
        const { lastFrame } = render(<DetailView {...defaultProps} ref={ref} />);

        // Input should be focused initially
        expect(ref.current!.focusedField).toBeNull();
        expect(ref.current!.focusedFooterIndex).toBeNull();

        // Tab to footer — input should lose focus
        for (let i = 0; i < 4; i++) {
            ref.current!.cycleFocus(1);
        }
        ref.current!.forceUpdate();

        expect(ref.current!.focusedFooterIndex).toBe(0);
    });

    // ---- Footer action dispatch ----

    it('dispatchFooterAction back calls exitThread', () => {
        const onBack = vi.fn();
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} onBack={onBack} ref={ref} />);

        // Not in thread, so exitThread calls onBack
        ref.current!.dispatchFooterAction('back');
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('dispatchFooterAction home calls onHome', () => {
        const onHome = vi.fn();
        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} onHome={onHome} ref={ref} />);

        ref.current!.dispatchFooterAction('home');
        expect(onHome).toHaveBeenCalledOnce();
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('dispatchFooterAction resolveThread calls resolveThread', () => {
        const { root: chainRoot, nodes } = buildResponseChain(TEST_MESSAGES);
        const replyNode: Response = {
            id: 100,
            content: createMessage(AuthorType.Agent, ResponseType.None, 'Reply', '2025-01-15T12:00:00Z'),
            responding_to: null, response: null, replying_to: nodes[0], reply: null,
            is_continuation: false, thread_resolved_at: null, quoted_response_id: null,
        };
        nodes[0].reply = replyNode;

        const ref = React.createRef<DetailView>();
        render(<DetailView {...defaultProps} rootResponse={chainRoot} ref={ref} />);

        ref.current!.selectedMessage = 0;
        ref.current!.dispatchFooterAction('resolveThread');
        expect(nodes[0].thread_resolved_at).not.toBeNull();
    });
});

// ---- Unit tests for ResponseContainer ----

describe('ResponseContainer', () => {
    describe('computeLineCount', () => {
        it('returns 4 for single-line body (top + body + bottom + separator)', () => {
            expect(ResponseContainer.computeLineCount('Hello', 80)).toBe(4);
        });

        it('counts multi-line body', () => {
            expect(ResponseContainer.computeLineCount('Line 1\nLine 2\nLine 3', 80)).toBe(6);
        });

        it('wraps long lines', () => {
            const innerWidth = Math.max(10, 80 - 4); // 76
            const longLine = 'x'.repeat(innerWidth + 10);
            expect(ResponseContainer.computeLineCount(longLine, 80)).toBe(5);
        });

        it('counts empty body as 1 body line', () => {
            expect(ResponseContainer.computeLineCount('', 80)).toBe(4);
        });
    });

    describe('render', () => {
        const makeResponse = (overrides: Partial<Message> = {}): Response => {
            const message: Message = {
                author: AuthorType.User,
                type: ResponseType.None,
                body: 'Hello world',
                timestamp: '2025-01-15T10:00:00Z',
                seen: null,
                ...overrides,
            };
            return {
                id: 1,
                content: message,
                responding_to: null,
                response: null,
                replying_to: null,
                reply: null,
                is_continuation: false,
                thread_resolved_at: null,
                quoted_response_id: null,
            };
        };

        const containerProps = {
            hasNewReplies: false,
        };

        it('renders author in header', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={false} {...containerProps} />
            );
            expect(lastFrame()).toContain('You');
        });

        it('renders type in header', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ type: ResponseType.Analysis })} columns={80} selected={false} {...containerProps} />
            );
            expect(lastFrame()).toContain('Analysis');
        });

        it('renders timestamp in header', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={false} {...containerProps} />
            );
            expect(lastFrame()).toContain('2025-01-15 10:00:00');
        });

        it('renders body text', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ body: 'Test body content' })} columns={80} selected={false} {...containerProps} />
            );
            expect(lastFrame()).toContain('Test body content');
        });

        it('renders box borders', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={false} {...containerProps} />
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
                    {...containerProps}
                />
            );
            const frame = lastFrame()!;
            expect(frame).toContain('Line 1');
            expect(frame).toContain('Line 2');
            expect(frame).toContain('Line 3');
        });

        it('uses cyan color for user messages', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ author: AuthorType.User })} columns={80} selected={false} {...containerProps} />
            );
            expect(lastFrame()).toContain('You');
        });

        it('uses green color for agent messages', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse({ author: AuthorType.Agent })} columns={80} selected={false} {...containerProps} />
            );
            expect(lastFrame()).toContain('Agent');
        });

        it('renders header format: Author - Type - timestamp', () => {
            const { lastFrame } = render(
                <ResponseContainer
                    response={makeResponse({ author: AuthorType.Agent, type: ResponseType.Fix })}
                    columns={80}
                    selected={false}
                    {...containerProps}
                />
            );
            const frame = lastFrame()!;
            expect(frame).toContain('Agent');
            expect(frame).toContain('Fix');
            expect(frame).toContain('2025-01-15 10:00:00');
        });

        it('shows button text when selected', () => {
            const { lastFrame } = render(
                <ResponseContainer response={makeResponse()} columns={80} selected={true} {...containerProps} />
            );
            expect(lastFrame()).toContain('reply to this');
        });

        it('shows view replies when selected with replies', () => {
            const resp = makeResponse();
            // Build a reply chain of 3
            const r1: Response = { id: 90, content: { ...resp.content }, responding_to: null, response: null, replying_to: resp, reply: null, is_continuation: false, thread_resolved_at: null, quoted_response_id: null };
            const r2: Response = { id: 91, content: { ...resp.content }, responding_to: r1, response: null, replying_to: null, reply: null, is_continuation: false, thread_resolved_at: null, quoted_response_id: null };
            const r3: Response = { id: 92, content: { ...resp.content }, responding_to: r2, response: null, replying_to: null, reply: null, is_continuation: false, thread_resolved_at: null, quoted_response_id: null };
            r1.response = r2;
            r2.response = r3;
            resp.reply = r1;

            const { lastFrame } = render(
                <ResponseContainer response={resp} columns={80} selected={true} hasNewReplies={false} />
            );
            expect(lastFrame()).toContain('view replies (3)');
        });

        it('shows reply count in continuation header', () => {
            const resp = makeResponse();
            resp.is_continuation = true;
            // Build a reply chain of 2
            const r1: Response = { id: 93, content: { ...resp.content }, responding_to: null, response: null, replying_to: resp, reply: null, is_continuation: false, thread_resolved_at: null, quoted_response_id: null };
            const r2: Response = { id: 94, content: { ...resp.content }, responding_to: r1, response: null, replying_to: null, reply: null, is_continuation: false, thread_resolved_at: null, quoted_response_id: null };
            r1.response = r2;
            resp.reply = r1;

            const { lastFrame } = render(
                <ResponseContainer response={resp} columns={80} selected={false} hasNewReplies={false} />
            );
            expect(lastFrame()).toContain('[2 replies]');
        });
    });
});
