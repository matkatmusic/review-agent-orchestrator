import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import TextInput from 'ink-text-input';
import type { Issue, Response, Container } from '../types.js';
import { IssueStatusStringsMap } from '../types.js';
import type { View } from './views.js';
import { ViewType } from './views.js';
import { HEADER_LINES } from './header.js';
import { GroupPicker } from './group-picker.js';
import { IssueListPicker } from './issue-list-picker.js';
import { ResponseContainer } from './response-container.js';

// ---- FlatNode ----

interface FlatNode {
    response: Response;
    hasNewReplies: boolean;
}

/**
 * Walk a .response chain from root, computing metadata for each node.
 */
function flattenChain(root: Response | null, userLastViewedAt: string | null): FlatNode[] {
    const nodes: FlatNode[] = [];
    let current = root;
    while (current) {
        const hasNewReplies = userLastViewedAt !== null && checkNewReplies(current, userLastViewedAt);
        nodes.push({ response: current, hasNewReplies });
        current = current.response;
    }
    return nodes;
}

/** Check if any reply is unseen (timestamp after userLastViewedAt and not yet seen). */
function checkNewReplies(node: Response, userLastViewedAt: string): boolean {
    let r = node.reply;
    while (r) {
        if (r.content.seen === null && r.content.timestamp > userLastViewedAt) return true;
        r = r.response;
    }
    return false;
}

/** Mark all replies on a node as seen. */
function markRepliesSeen(node: Response): void {
    const now = new Date().toISOString();
    let r = node.reply;
    while (r) {
        r.content.seen = now;
        r = r.response;
    }
}

/** Find a Response node by id in a linked-list chain. */
function findResponseById(root: Response | null, id: number): Response | null {
    let current = root;
    while (current) {
        if (current.id === id) return current;
        // Also search reply chains
        let reply = current.reply;
        while (reply) {
            if (reply.id === id) return reply;
            reply = reply.response;
        }
        current = current.response;
    }
    return null;
}

// ---- Props ----

export interface DetailViewProps {
    inum: number;
    issue: Issue;
    rootResponse: Response | null;
    threadParentResponse?: Response;
    blockedBy: number[];
    blocks: number[];
    group: string;
    columns: number;
    rows: number;
    containers?: Container[];
    allIssues?: Issue[];
    userLastViewedAt?: string | null;
    onBack?: () => void;
    onSend?: (message: string) => void;
    onNavigate?: (view: View) => void;
    onQuit?: () => void;
    onGroupChange?: (containerId: number) => void;
    onGroupCreate?: (name: string) => void;
    onBlockedByChange?: (blockerInums: number[]) => void;
    onBlocksChange?: (blockedInums: number[]) => void;
    onNavigateIssue?: (inum: number) => void;
}

// ---- Layout constants ----

const INPUT_AREA_LINES = 3;   // separator, input prompt, footer

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

// ---- Component ----

export class DetailView extends React.Component<DetailViewProps> {
    inputValue: string;
    focusedField: number | null;
    overlay: OverlayType;
    blockedBySet: Set<number>;
    blocksSet: Set<number>;
    issueHeaderLineCount: number;
    selectedMessage: number;
    firstVisibleMessage: number;
    private flatList: FlatNode[];
    private containerHeights: number[];
    private lastRootResponse: Response | null;
    private initialScrollDone: boolean;
    private threadParentStack: Response[];

    constructor(props: DetailViewProps) {
        super(props);
        this.inputValue = '';
        this.focusedField = null;
        this.overlay = OverlayType.None;
        this.blockedBySet = new Set(props.blockedBy);
        this.blocksSet = new Set(props.blocks);
        this.issueHeaderLineCount = 0;
        this.flatList = flattenChain(props.rootResponse, props.userLastViewedAt ?? null);
        this.containerHeights = this.flatList.map(n =>
            ResponseContainer.computeLineCount(n.response.content.body, props.columns),
        );
        this.lastRootResponse = props.rootResponse;
        this.initialScrollDone = false;
        this.threadParentStack = [];
        this.selectedMessage = Math.max(0, this.flatList.length - 1);
        this.firstVisibleMessage = 0;
    }

    get conversationHeight(): number {
        return Math.max(
            1,
            this.props.rows - HEADER_LINES - this.issueHeaderLineCount - INPUT_AREA_LINES,
        );
    }

    deriveFirstVisible(): number {
        if (this.flatList.length === 0) return 0;

        const sel = this.selectedMessage;
        let first = this.firstVisibleMessage;

        if (sel < first) return sel;

        let used = 0;
        for (let i = first; i <= sel; i++) {
            used += this.containerHeights[i];
        }
        if (used <= this.conversationHeight) return first;

        used = this.containerHeights[sel];
        first = sel;
        while (first > 0 && used + this.containerHeights[first - 1] <= this.conversationHeight) {
            first--;
            used += this.containerHeights[first];
        }
        return first;
    }

    computeLastVisible(): number {
        if (this.flatList.length === 0) return 0;

        let last = this.firstVisibleMessage;
        let used = this.containerHeights[last];
        while (last + 1 < this.flatList.length && used < this.conversationHeight) {
            last++;
            used += this.containerHeights[last];
        }
        return last;
    }

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

    navigateToAdjacentIssue(direction: 1 | -1) {
        const issues = this.props.allIssues;
        if (!issues || issues.length === 0) return;
        const idx = issues.findIndex(i => i.inum === this.props.inum);
        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < issues.length) {
            this.props.onNavigateIssue?.(issues[nextIdx].inum);
        }
    }

    handleKey = (_input: string, key: Key) => {
        // When an overlay is open, it handles its own input
        if (this.overlay !== OverlayType.None) return;

        if (key.escape) {
            this.props.onBack?.();
            return;
        }

        // Thread navigation: Ctrl+Alt+> or Ctrl+Right to enter thread
        const enterThread = (key.ctrl && key.meta && (_input === '>' || _input === '.'))
            || (key.ctrl && key.rightArrow);
        if (enterThread) {
            const selectedNode = this.flatList[this.selectedMessage];
            if (selectedNode) {
                this.threadParentStack.push(selectedNode.response);
                this.props.onNavigate?.({
                    type: ViewType.Thread,
                    inum: this.props.inum,
                    rootResponseId: selectedNode.response.id,
                });
            }
            return;
        }

        // Thread exit: Ctrl+Alt+< or Ctrl+Left
        const exitThread = (key.ctrl && key.meta && (_input === '<' || _input === ','))
            || (key.ctrl && key.leftArrow);
        if (exitThread && this.props.threadParentResponse) {
            this.props.onBack?.();
            return;
        }

        if (key.shift && (key.leftArrow || key.rightArrow)) {
            this.navigateToAdjacentIssue(key.rightArrow ? 1 : -1);
            return;
        }
        if (key.tab) {
            this.cycleField(key.shift ? -1 : 1);
            return;
        }
        if (key.return && this.focusedField !== null) {
            this.openOverlayForField();
            return;
        }
        if (key.upArrow) {
            if (this.selectedMessage > 0) {
                this.selectedMessage--;
                this.firstVisibleMessage = this.deriveFirstVisible();
                this.forceUpdate();
            }
        } else if (key.downArrow) {
            if (this.selectedMessage < this.flatList.length - 1) {
                this.selectedMessage++;
                this.firstVisibleMessage = this.deriveFirstVisible();
                this.forceUpdate();
            }
        }
    };

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
            this.props.onSend?.(value.trim());
        }
        this.inputValue = '';
        this.forceUpdate();
    };

    render() {
        const { inum, issue, rootResponse, blocks, group, columns, containers } = this.props;

        // Recompute flat list if root response changed
        if (rootResponse !== this.lastRootResponse) {
            this.flatList = flattenChain(rootResponse, this.props.userLastViewedAt ?? null);
            this.containerHeights = this.flatList.map(n =>
                ResponseContainer.computeLineCount(n.response.content.body, columns),
            );
            this.lastRootResponse = rootResponse;

            // Restore selection from stack when returning from a thread
            const stackTop = this.threadParentStack.length > 0
                ? this.threadParentStack[this.threadParentStack.length - 1]
                : null;
            const restoredIndex = stackTop
                ? this.flatList.findIndex(n => n.response === stackTop)
                : -1;
            if (restoredIndex >= 0) {
                this.threadParentStack.pop();
                this.selectedMessage = restoredIndex;
                this.firstVisibleMessage = 0;
                this.initialScrollDone = true;
                this.firstVisibleMessage = this.deriveFirstVisible();
            } else {
                this.selectedMessage = Math.max(0, this.flatList.length - 1);
                this.firstVisibleMessage = 0;
                this.initialScrollDone = false;
            }
        }

        const blockedByArr = [...this.blockedBySet];
        const blockedByStr = blockedByArr.length > 0
            ? blockedByArr.map(n => `I-${n}`).join(', ')
            : '(none)';
        const blocksArr = [...this.blocksSet];
        const blocksStr = blocksArr.length > 0
            ? blocksArr.map(n => `I-${n}`).join(', ')
            : '(none)';

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
        const isThread = this.props.threadParentResponse !== undefined;

        // Build header
        let issueHeader: React.ReactNode[];
        if (isThread) {
            const parentResponse = this.props.threadParentResponse!;
            const parentHeight = ResponseContainer.computeLineCount(parentResponse.content.body, columns);
            issueHeader = [
                <ResponseContainer
                    key="parent-msg"
                    response={parentResponse}
                    columns={columns}
                    selected={false}
                    hasNewReplies={false}
                />,
            ];
            this.issueHeaderLineCount = parentHeight;
        } else {
            const groupFocused = this.focusedField === FIELD_GROUP;
            const blockedByFocused = this.focusedField === FIELD_BLOCKED_BY;
            const blocksFocused = this.focusedField === FIELD_BLOCKS;

            issueHeader = [
                <Text key="title" bold wrap="truncate">
                    I-{inum}: {issue.title}
                </Text>,
                <Text key="status" wrap="truncate">
                    Status: <Text color="yellow">{IssueStatusStringsMap.get(issue.status) ?? issue.status}</Text>  |  Group: <Text inverse={groupFocused} bold={groupFocused}>{` ${group} `}</Text>
                </Text>,
                <Text key="deps" wrap="truncate">
                    Blocked by: <Text inverse={blockedByFocused} bold={blockedByFocused}>{` ${blockedByStr} `}</Text>  |  Blocks: <Text inverse={blocksFocused} bold={blocksFocused}>{` ${blocksStr} `}</Text>
                </Text>,
                <Text key="hint" dimColor>(Tab to change Group, Blocked By, Blocks)</Text>,
                <Text key="sep" dimColor>{'─'.repeat(columns)}</Text>,
            ];
            this.issueHeaderLineCount = issueHeader.length;
        }

        // Initial scroll to bottom
        if (!this.initialScrollDone && this.flatList.length > 0) {
            this.selectedMessage = this.flatList.length - 1;
            this.firstVisibleMessage = this.deriveFirstVisible();
            this.initialScrollDone = true;
        }

        // Determine visible range
        const lastVisible = this.flatList.length > 0
            ? this.computeLastVisible()
            : -1;
        const visibleNodes = this.flatList.length > 0
            ? this.flatList.slice(this.firstVisibleMessage, lastVisible + 1)
            : [];

        const inputLabel = 'Enter response: > ';

        return (
            <Box flexDirection="column">
                <DetailInputBridge onKey={this.handleKey} />
                {issueHeader}

                {/* Scrollable conversation */}
                <Box flexDirection="column" height={this.conversationHeight} overflow="hidden">
                    {visibleNodes.map((node, i) => (
                        <ResponseContainer
                            key={node.response.id}
                            response={node.response}
                            columns={columns}
                            selected={this.firstVisibleMessage + i === this.selectedMessage}
                            hasNewReplies={node.hasNewReplies}
                        />
                    ))}
                </Box>

                {/* Input area */}
                <Text dimColor>{'─'.repeat(columns)}</Text>
                <Box>
                    <Text color="cyan">{inputLabel}</Text>
                    <TextInput
                        value={this.inputValue}
                        focus={this.focusedField === null}
                        onChange={this.handleInputChange}
                        onSubmit={this.handleInputSubmit}
                    />
                </Box>

            </Box>
        );
    }
}

export { findResponseById, markRepliesSeen };
