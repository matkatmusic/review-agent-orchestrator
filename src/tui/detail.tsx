import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import type { Issue, Response, Container } from '../types.js';
import { HEADER_LINES } from './header.js';
import { GroupPicker } from './group-picker.js';
import { IssueListPicker } from './issue-list-picker.js';
import { ResponseContainer } from './response-container.js';
import { IssueHeader, ISSUE_HEADER_LINE_COUNT } from './issue-header.js';
import { InputBox, INPUT_AREA_LINES } from './input-box.js';
import { ResponseChain, flattenToArray } from './response-chain.js';

// ---- Helper functions ----

/** Mark all replies on a node as seen. */
export function markRepliesSeen(node: Response): void {
    const now = new Date().toISOString();
    let r = node.reply;
    while (r) {
        r.content.seen = now;
        r = r.response;
    }
}

/** Find a Response node by id in a linked-list chain. */
export function findResponseById(root: Response | null, id: number): Response | null {
    let current = root;
    while (current) {
        if (current.id === id) return current;
        let reply = current.reply;
        while (reply) {
            if (reply.id === id) return reply;
            reply = reply.response;
        }
        current = current.response;
    }
    return null;
}

// ---- Input bridge ----

function DetailInputBridge({ onKey }: { onKey: (input: string, key: Key) => void }) {
    useInput(onKey);
    return null;
}

// ---- Focus fields ----

const DETAIL_FIELD_COUNT = 3;
const FIELD_GROUP = 0;
const FIELD_BLOCKED_BY = 1;
const FIELD_BLOCKS = 2;

enum OverlayType {
    None,
    Group,
    BlockedBy,
    Blocks,
}

// ---- Thread separator ----

const THREAD_SEPARATOR_LINES = 2; // separator replaces ResponseContainer's blank + adds blank below

function threadSeparator(columns: number, resolved: boolean): string {
    const label = resolved ? '[ Replies \u2014 Resolved ]' : '[ Replies ]';
    const totalDashes = Math.max(0, columns - label.length);
    const left = Math.floor(totalDashes / 2);
    const right = totalDashes - left;
    return '─'.repeat(left) + label + '─'.repeat(right);
}

// ---- Thread stack entry ----

interface ThreadStackEntry {
    parent: Response;
    savedSelectedIndex: number;
}

// ---- Props ----

export interface DetailViewProps {
    inum: number;
    issue: Issue;
    rootResponse: Response | null;
    blockedBy: number[];
    blocks: number[];
    group: string;
    columns: number;
    rows: number;
    containers?: Container[];
    allIssues?: Issue[];
    userLastViewedAt?: string | null;
    onBack: (selectedMessage: number) => void;
    onHome: (selectedMessage: number) => void;
    onSend: (message: string) => void;
    onQuit: () => void;
    onGroupChange?: (containerId: number) => void;
    onGroupCreate?: (name: string) => void;
    onBlockedByChange?: (blockerInums: number[]) => void;
    onBlocksChange?: (blockedInums: number[]) => void;
    onNavigateIssue?: (inum: number) => void;
    onThreadStateChange: (info: { inThread: boolean }) => void;
    initialSelectedMessage?: number;
}

// ---- Component ----

export class DetailView extends React.Component<DetailViewProps> {
    inputValue: string;
    focusedField: number | null;
    overlay: OverlayType;
    blockedBySet: Set<number>;
    blocksSet: Set<number>;
    selectedMessage: number;
    threadStack: ThreadStackEntry[];

    constructor(props: DetailViewProps) {
        super(props);
        this.inputValue = '';
        this.focusedField = null;
        this.overlay = OverlayType.None;
        this.blockedBySet = new Set(props.blockedBy);
        this.blocksSet = new Set(props.blocks);
        this.threadStack = [];

        const messages = flattenToArray(props.rootResponse);
        const lastIndex = Math.max(0, messages.length - 1);
        if (props.initialSelectedMessage !== undefined && props.initialSelectedMessage <= lastIndex) {
            this.selectedMessage = props.initialSelectedMessage;
        } else {
            this.selectedMessage = lastIndex;
        }
    }

    // ---- Derived values ----

    /** Flatten the currently displayed chain (respects thread stack). */
    currentMessages(): Response[] {
        const top = this.threadStack.length > 0
            ? this.threadStack[this.threadStack.length - 1]
            : null;
        const displayedRoot = top ? top.parent.reply : this.props.rootResponse;
        return flattenToArray(displayedRoot);
    }

    get headerLineCount(): number {
        if (this.threadStack.length > 0) {
            const parent = this.threadStack[this.threadStack.length - 1].parent;
            return ResponseContainer.computeLineCount(
                parent.content.body,
                this.props.columns,
            ) + THREAD_SEPARATOR_LINES;
        }
        return ISSUE_HEADER_LINE_COUNT;
    }

    get conversationHeight(): number {
        return Math.max(
            1,
            this.props.rows - HEADER_LINES - this.headerLineCount - INPUT_AREA_LINES,
        );
    }

    // ---- Thread navigation ----

    enterThread() {
        const messages = this.currentMessages();
        const selected = messages[this.selectedMessage];
        if (!selected || !selected.reply) return;

        // Mark replies seen on enter
        markRepliesSeen(selected);

        // Push current position onto stack
        this.threadStack.push({
            parent: selected,
            savedSelectedIndex: this.selectedMessage,
        });

        // Move cursor to last message in new chain
        const threadMessages = flattenToArray(selected.reply);
        this.selectedMessage = Math.max(0, threadMessages.length - 1);

        // Notify App of thread state change
        this.props.onThreadStateChange({ inThread: true });

        this.forceUpdate();
    }

    exitThread() {
        if (this.threadStack.length === 0) {
            // Not in a thread — exit the view
            this.props.onBack(this.selectedMessage);
            return;
        }

        // Pop the stack
        const popped = this.threadStack.pop()!;

        // Mark replies seen on exit (fixes bug where new replies aren't marked seen)
        markRepliesSeen(popped.parent);

        // Restore cursor position
        this.selectedMessage = popped.savedSelectedIndex;

        // Notify App of thread state change
        const stillInThread = this.threadStack.length > 0;
        this.props.onThreadStateChange({ inThread: stillInThread });

        this.forceUpdate();
    }

    // ---- Thread resolution ----

    resolveThread() {
        // When in a thread, resolve/unresolve the current thread's parent
        if (this.threadStack.length > 0) {
            const parent = this.threadStack[this.threadStack.length - 1].parent;
            parent.thread_resolved_at = parent.thread_resolved_at
                ? null
                : new Date().toISOString();
            this.forceUpdate();
            return;
        }

        // When on the main chain, resolve/unresolve the selected message's thread
        const messages = this.currentMessages();
        const selected = messages[this.selectedMessage];
        if (!selected || !selected.reply) return;

        selected.thread_resolved_at = selected.thread_resolved_at
            ? null
            : new Date().toISOString();
        this.forceUpdate();
    }

    // ---- Field cycling & overlays ----

    cycleField(direction: 1 | -1) {
        if (this.focusedField === null) {
            this.focusedField = direction === 1 ? 0 : DETAIL_FIELD_COUNT - 1;
        } else {
            const next = this.focusedField + direction;
            if (next < 0 || next >= DETAIL_FIELD_COUNT) {
                this.focusedField = null;
            } else {
                this.focusedField = next;
            }
        }
        this.forceUpdate();
    }

    openOverlayForField() {
        if (this.focusedField === FIELD_GROUP && this.props.containers) {
            this.overlay = OverlayType.Group;
            this.forceUpdate();
        } else if (this.focusedField === FIELD_BLOCKED_BY && this.props.allIssues) {
            this.overlay = OverlayType.BlockedBy;
            this.forceUpdate();
        } else if (this.focusedField === FIELD_BLOCKS && this.props.allIssues) {
            this.overlay = OverlayType.Blocks;
            this.forceUpdate();
        }
    }

    closeOverlay = () => {
        this.overlay = OverlayType.None;
        this.forceUpdate();
    };

    // ---- Adjacent issue navigation ----

    navigateToAdjacentIssue(direction: 1 | -1) {
        const issues = this.props.allIssues;
        if (!issues || issues.length === 0) return;
        const idx = issues.findIndex(i => i.inum === this.props.inum);
        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < issues.length) {
            this.props.onNavigateIssue?.(issues[nextIdx].inum);
        }
    }

    // ---- Key handling ----

    handleKey = (_input: string, key: Key) => {
        if (this.overlay !== OverlayType.None) return;

        // Alt+h: jump to home (˙ is what macOS sends for Option+h)
        if ((key.meta && _input === 'h') || _input === '\u02D9') {
            this.props.onHome(this.selectedMessage);
            return;
        }

        // Esc: exit thread if in thread, otherwise exit view
        if (key.escape) {
            this.exitThread();
            return;
        }

        // Thread navigation: Ctrl+Shift+Right enters, Ctrl+Shift+Left exits
        if (key.ctrl && key.shift && key.rightArrow) {
            this.enterThread();
            return;
        }
        if (key.ctrl && key.shift && key.leftArrow) {
            this.exitThread();
            return;
        }

        // Ctrl+R: resolve/unresolve thread
        if (key.ctrl && _input === 'r') {
            this.resolveThread();
            return;
        }

        // Adjacent issue navigation
        if (key.shift && (key.leftArrow || key.rightArrow)) {
            this.navigateToAdjacentIssue(key.rightArrow ? 1 : -1);
            return;
        }

        // Tab field cycling
        if (key.tab) {
            this.cycleField(key.shift ? -1 : 1);
            return;
        }

        // Enter on focused field opens overlay
        if (key.return && this.focusedField !== null) {
            this.openOverlayForField();
            return;
        }

        // Up/down scrolling (uses current chain, not always rootResponse)
        const messages = this.currentMessages();
        if (key.upArrow) {
            if (this.selectedMessage > 0) {
                this.selectedMessage--;
                this.forceUpdate();
            }
        } else if (key.downArrow) {
            if (this.selectedMessage < messages.length - 1) {
                this.selectedMessage++;
                this.forceUpdate();
            }
        }
    };

    // ---- Input handling ----

    handleInputChange = (value: string) => {
        this.inputValue = value;
        this.forceUpdate();
    };

    handleInputSubmit = (value: string) => {
        if (this.focusedField !== null) {
            this.openOverlayForField();
            return;
        }
        if (value.trim()) {
            this.props.onSend(value.trim());
        }
        this.inputValue = '';
        this.forceUpdate();
    };

    // ---- Render ----

    render() {
        const { inum, issue, group, columns, containers } = this.props;

        const contentHeight = this.props.rows - HEADER_LINES;

        // ---- Overlay: Group picker ----
        if (this.overlay === OverlayType.Group && containers) {
            return (
                <Box flexDirection="column" height={contentHeight} justifyContent="center" alignItems="center">
                    <DetailInputBridge onKey={this.handleKey} />
                    <GroupPicker
                        containers={containers}
                        currentGroup={group}
                        onSelect={(containerId) => {
                            this.props.onGroupChange?.(containerId);
                            this.closeOverlay();
                        }}
                        onCreate={(name) => {
                            this.props.onGroupCreate?.(name);
                            this.closeOverlay();
                        }}
                        onClose={this.closeOverlay}
                    />
                </Box>
            );
        }

        // ---- Overlay: Blocked By editor ----
        if (this.overlay === OverlayType.BlockedBy && this.props.allIssues) {
            const otherIssues = this.props.allIssues.filter(i => i.inum !== inum);
            return (
                <Box flexDirection="column" height={contentHeight} justifyContent="center" alignItems="center">
                    <DetailInputBridge onKey={this.handleKey} />
                    <IssueListPicker
                        title="Blocked by"
                        issues={otherIssues}
                        selected={this.blockedBySet}
                        onToggle={(toggledInum) => {
                            if (this.blockedBySet.has(toggledInum)) {
                                this.blockedBySet.delete(toggledInum);
                            } else {
                                this.blockedBySet.add(toggledInum);
                            }
                            this.props.onBlockedByChange?.([...this.blockedBySet]);
                            this.forceUpdate();
                        }}
                        onClose={this.closeOverlay}
                    />
                </Box>
            );
        }

        // ---- Overlay: Blocks editor ----
        if (this.overlay === OverlayType.Blocks && this.props.allIssues) {
            const otherIssues = this.props.allIssues.filter(i => i.inum !== inum);
            return (
                <Box flexDirection="column" height={contentHeight} justifyContent="center" alignItems="center">
                    <DetailInputBridge onKey={this.handleKey} />
                    <IssueListPicker
                        title="Blocks"
                        issues={otherIssues}
                        selected={this.blocksSet}
                        onToggle={(toggledInum) => {
                            if (this.blocksSet.has(toggledInum)) {
                                this.blocksSet.delete(toggledInum);
                            } else {
                                this.blocksSet.add(toggledInum);
                            }
                            this.props.onBlocksChange?.([...this.blocksSet]);
                            this.forceUpdate();
                        }}
                        onClose={this.closeOverlay}
                    />
                </Box>
            );
        }

        // ---- Normal view ----

        // Derive displayed chain from thread stack
        const isInThread = this.threadStack.length > 0;
        const threadParent = isInThread
            ? this.threadStack[this.threadStack.length - 1].parent
            : null;
        const displayedRoot = threadParent
            ? threadParent.reply
            : this.props.rootResponse;

        // Build dep strings (only visible in issue mode header)
        const blockedByArr = [...this.blockedBySet];
        const blockedByStr = blockedByArr.length > 0
            ? blockedByArr.map(n => `I-${n}`).join(', ')
            : '(none)';
        const blocksArr = [...this.blocksSet];
        const blocksStr = blocksArr.length > 0
            ? blocksArr.map(n => `I-${n}`).join(', ')
            : '(none)';

        return (
            <Box flexDirection="column">
                <DetailInputBridge onKey={this.handleKey} />

                {/* Header area: thread parent or issue metadata */}
                {isInThread ? (
                    <>
                        <Text color="gray">{(() => { const label = '[ Thread ]'; const dashes = Math.max(0, columns - label.length); const left = Math.floor(dashes / 2); const right = dashes - left; return '─'.repeat(left) + label + '─'.repeat(right); })()}</Text>
                        <Box flexDirection="column" height={ResponseContainer.computeLineCount(threadParent!.content.body, columns) - 1} overflow="hidden">
                            <ResponseContainer
                                response={threadParent!}
                                columns={columns}
                                selected={false}
                                hasNewReplies={false}
                                threadResolved={!!threadParent!.thread_resolved_at}
                                isThreadParent={true}
                            />
                        </Box>
                        <Text color={threadParent!.thread_resolved_at ? undefined : 'red'}>{threadSeparator(columns, !!threadParent!.thread_resolved_at)}</Text>
                    </>
                ) : (
                    <IssueHeader
                        inum={inum}
                        issue={issue}
                        group={group}
                        blockedByStr={blockedByStr}
                        blocksStr={blocksStr}
                        columns={columns}
                        focusedField={this.focusedField}
                    />
                )}

                <ResponseChain
                    rootResponse={displayedRoot}
                    columns={columns}
                    height={this.conversationHeight}
                    userLastViewedAt={this.props.userLastViewedAt ?? null}
                    selectedIndex={this.selectedMessage}
                />

                <InputBox
                    value={this.inputValue}
                    focused={this.focusedField === null}
                    columns={columns}
                    onChange={this.handleInputChange}
                    onSubmit={this.handleInputSubmit}
                />
            </Box>
        );
    }
}
