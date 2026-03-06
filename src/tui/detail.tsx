import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import { IssueStatus, type Issue, type Response, type Container } from '../types.js';
import { Ink_keyofKeys_Choices, KeyCombinations, matchesKey, matchesKeyCombination } from './hotkeys.js';
import { HEADER_LINES } from './header.js';
import { GroupPicker } from './group-picker.js';
import { ResponseContainer } from './response-container.js';
import { IssueHeader, ISSUE_HEADER_LINE_COUNT } from './issue-header.js';
import { InputBox, INPUT_AREA_LINES } from './input-box.js';
import { ResponseChain, flattenToArray } from './response-chain.js';
import { ViewType } from './views.js';
import { getFocusableShortcuts, getFooterShortcuts, computeFooterLines } from './footer.js';

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

function DetailInputBridge({ onKey, blockKeys, onBlocked }: {
    onKey: (input: string, key: Key) => void;
    blockKeys?: (input: string, key: Key) => boolean;
    onBlocked?: () => void;
}) {
    useInput((input, key) => {
        if (blockKeys && blockKeys(input, key)) {
            onBlocked?.();
        }
        onKey(input, key);
    });
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
}

// ---- Thread separator ----

const THREAD_SEPARATOR_LINES = 2; // separator replaces ResponseContainer's blank + adds blank below

function centeredLabel(columns: number, label: string): { left: string; right: string } {
    const totalDashes = Math.max(0, columns - label.length);
    const leftCount = Math.floor(totalDashes / 2);
    return { left: '─'.repeat(leftCount), right: '─'.repeat(totalDashes - leftCount) };
}

function threadSeparator(columns: number): string {
    const label = '[ Replies ]';
    const { left, right } = centeredLabel(columns, label);
    return left + label + right;
}

function ThreadHeaderSeparator({ columns, resolved }: { columns: number; resolved: boolean }) {
    const label = resolved ? '[ Thread \u2014 Resolved ]' : '[ Thread ]';
    const { left, right } = centeredLabel(columns, label);
    if (resolved) {
        return <Text color="gray">{left}[ Thread {'\u2014'} <Text color="white">Resolved</Text> ]{right}</Text>;
    }
    return <Text color="gray">{left}{label}{right}</Text>;
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
    unreadInums?: Set<number>;
    userLastViewedAt?: string | null;
    onBack: (selectedMessage: number) => void;
    onHome: (selectedMessage: number) => void;
    onSend: (message: string) => void;
    onQuit: () => void;
    onGroupChange?: (containerId: number) => void;
    onGroupCreate?: (name: string) => void;
    onBlockedByChange?: (blockerInums: number[]) => void;
    onBlocksChange?: (blockedInums: number[]) => void;
    onOpenPicker?: (mode: 'blockedBy' | 'blocks') => void;
    onNavigateIssue?: (inum: number) => void;
    onThreadStateChange: (info: { inThread: boolean; selectedHasReplies?: boolean }) => void;
    onFooterFocusChange: (index: number | null) => void;
    initialSelectedMessage?: number;
}

// ---- Component ----

export class DetailView extends React.Component<DetailViewProps> {
    inputValue: string;
    focusedField: number | null;
    focusedFooterIndex: number | null;
    overlay: OverlayType;
    blockedBySet: Set<number>;
    blocksSet: Set<number>;
    selectedMessage: number;
    threadStack: ThreadStackEntry[];
    suppressNextInput: boolean;

    constructor(props: DetailViewProps) {
        super(props);
        this.inputValue = '';
        this.focusedField = null;
        this.focusedFooterIndex = null;
        this.overlay = OverlayType.None;
        this.blockedBySet = new Set(props.blockedBy);
        this.blocksSet = new Set(props.blocks);
        this.threadStack = [];
        this.suppressNextInput = false;

        const messages = flattenToArray(props.rootResponse);
        const lastIndex = Math.max(0, messages.length - 1);
        if (props.initialSelectedMessage !== undefined && props.initialSelectedMessage <= lastIndex) {
            this.selectedMessage = props.initialSelectedMessage;
        } else {
            this.selectedMessage = lastIndex;
        }
    }

    componentDidMount() {
        this.notifyThreadState();
    }

    // ---- Derived values ----

    selectedHasReplies(): boolean {
        const messages = this.currentMessages();
        const selected = messages[this.selectedMessage];
        return !!selected?.reply;
    }

    notifyThreadState() {
        this.props.onThreadStateChange({
            inThread: this.threadStack.length > 0,
            selectedHasReplies: this.selectedHasReplies(),
        });
    }

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
        const isInThread = this.threadStack.length > 0;
        const shortcuts = getFooterShortcuts(ViewType.Detail, isInThread);
        const footerLines = computeFooterLines(shortcuts, this.props.columns);
        return Math.max(
            1,
            this.props.rows - HEADER_LINES - this.headerLineCount - INPUT_AREA_LINES - footerLines,
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

        // Reset footer focus on thread change
        this.focusedFooterIndex = null;
        this.focusedField = null;
        this.props.onFooterFocusChange(null);

        // Notify App of thread state change
        this.notifyThreadState();

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

        // Reset footer focus on thread change
        this.focusedFooterIndex = null;
        this.focusedField = null;
        this.props.onFooterFocusChange(null);

        // Notify App of thread state change
        this.notifyThreadState();

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

    resolveIssue() {
        const issue = this.props.issue;
        if (issue.status === IssueStatus.Resolved) {
            issue.status = IssueStatus.Active;
            issue.resolved_at = null;
        } else {
            issue.status = IssueStatus.Resolved;
            issue.resolved_at = new Date().toISOString();
        }
        this.forceUpdate();
    }

    // ---- Key blocking ----

    shouldBlockKey = (input: string, key: Key): boolean => {
        return (input === 'r' && key.ctrl);
    };

    // ---- Field cycling & overlays ----

    cycleFocus(direction: 1 | -1) {
        const isInThread = this.threadStack.length > 0;
        const headerSlots = isInThread ? 0 : DETAIL_FIELD_COUNT;
        const focusable = getFocusableShortcuts(ViewType.Detail, isInThread);
        const footerSlots = focusable.length;
        const totalSlots = 1 + headerSlots + footerSlots;

        // Determine current position in ring
        let current: number;
        if (this.focusedField === null && this.focusedFooterIndex === null) {
            current = 0; // input
        } else if (this.focusedField !== null) {
            current = 1 + this.focusedField; // header field
        } else {
            current = 1 + headerSlots + this.focusedFooterIndex!; // footer
        }

        // Advance with wrapping
        const next = ((current + direction) % totalSlots + totalSlots) % totalSlots;

        // Map back to field/footer
        if (next === 0) {
            this.focusedField = null;
            this.focusedFooterIndex = null;
        } else if (next <= headerSlots) {
            this.focusedField = next - 1;
            this.focusedFooterIndex = null;
        } else {
            this.focusedField = null;
            this.focusedFooterIndex = next - 1 - headerSlots;
        }

        this.props.onFooterFocusChange(this.focusedFooterIndex);
        this.forceUpdate();
    }

    dispatchFooterAction(action: string) {
        switch (action) {
            case 'enterThread':   this.enterThread(); break;
            case 'exitThread':    this.exitThread(); break;
            case 'resolveThread': this.resolveThread(); break;
            case 'back':          this.exitThread(); break;
            case 'home':          this.props.onHome(this.selectedMessage); break;
        }
    }

    openOverlayForField() {
        if (this.focusedField === FIELD_GROUP && this.props.containers) {
            this.overlay = OverlayType.Group;
            this.forceUpdate();
        } else if (this.focusedField === FIELD_BLOCKED_BY && this.props.allIssues) {
            this.props.onOpenPicker?.('blockedBy');
        } else if (this.focusedField === FIELD_BLOCKS && this.props.allIssues) {
            this.props.onOpenPicker?.('blocks');
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

        if (matchesKeyCombination(KeyCombinations.ALT_H, _input, key)) {
            this.props.onHome(this.selectedMessage);
            return;
        }

        if (matchesKey(key, Ink_keyofKeys_Choices.ESCAPE)) {
            this.exitThread();
            return;
        }

        if (matchesKeyCombination(KeyCombinations.CTRL_SHIFT_RIGHT_ARROW, _input, key)) {
            this.enterThread();
            return;
        }
        if (matchesKeyCombination(KeyCombinations.CTRL_SHIFT_LEFT_ARROW, _input, key)) {
            this.exitThread();
            return;
        }

        if (matchesKeyCombination(KeyCombinations.CTRL_SHIFT_R, _input, key)) {
            this.resolveThread();
            return;
        }

        if (matchesKeyCombination(KeyCombinations.CTRL_R, _input, key)) {
            this.resolveIssue();
            return;
        }

        // Adjacent issue navigation
        if (key.shift && (key.leftArrow || key.rightArrow)) {
            this.navigateToAdjacentIssue(key.rightArrow ? 1 : -1);
            return;
        }

        // Tab focus cycling
        if (key.tab) {
            this.cycleFocus(key.shift ? -1 : 1);
            return;
        }

        // Enter on focused header field opens overlay
        if (key.return && this.focusedField !== null) {
            this.openOverlayForField();
            return;
        }

        // Enter on focused footer item dispatches action
        if (key.return && this.focusedFooterIndex !== null) {
            const isInThread = this.threadStack.length > 0;
            const focusable = getFocusableShortcuts(ViewType.Detail, isInThread);
            const shortcut = focusable[this.focusedFooterIndex];
            if (shortcut?.action) this.dispatchFooterAction(shortcut.action);
            return;
        }

        // Up/down scrolling (uses current chain, not always rootResponse)
        const messages = this.currentMessages();
        if (key.upArrow) {
            if (this.selectedMessage > 0) {
                this.selectedMessage--;
                this.notifyThreadState();
                this.forceUpdate();
            }
        } else if (key.downArrow) {
            if (this.selectedMessage < messages.length - 1) {
                this.selectedMessage++;
                this.notifyThreadState();
                this.forceUpdate();
            }
        }
    };

    // ---- Input handling ----

    handleInputChange = (value: string) => {
        if (this.suppressNextInput) {
            this.suppressNextInput = false;
            return;
        }
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

        // BlockedBy and Blocks pickers are now separate views (ViewType.IssuePicker)

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
                <DetailInputBridge
                    onKey={this.handleKey}
                    blockKeys={this.shouldBlockKey}
                    onBlocked={() => { this.suppressNextInput = true; }}
                />

                {/* Header area: thread parent or issue metadata */}
                {isInThread ? (
                    <>
                        <ThreadHeaderSeparator columns={columns} resolved={!!threadParent!.thread_resolved_at} />
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
                        <Text color="gray">{threadSeparator(columns)}</Text>
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
                    focused={this.focusedField === null && this.focusedFooterIndex === null}
                    columns={columns}
                    onChange={this.handleInputChange}
                    onSubmit={this.handleInputSubmit}
                />
            </Box>
        );
    }
}
