import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import TextInput from 'ink-text-input';
import type { Issue, Response as IssueResponse, Container } from '../types.js';
import { IssueStatusStringsMap } from '../types.js';
import type { View } from './views.js';
import { HEADER_LINES } from './header.js';
import { GroupPicker } from './group-picker.js';
import { IssueListPicker } from './issue-list-picker.js';
import { ResponseContainer } from './response-container.js';

// ---- Props ----

export interface DetailViewProps {
    inum: number;
    issue: Issue;
    responses: IssueResponse[];
    blockedBy: number[];
    blocks: number[];
    group: string;
    columns: number;
    rows: number;
    containers?: Container[];
    allIssues?: Issue[];
    onBack?: () => void;
    onSend?: (message: string) => void;
    onNavigate?: (view: View) => void;
    onQuit?: () => void;
    onGroupChange?: (containerId: number) => void;
    onGroupCreate?: (name: string) => void;
    onBlockedByChange?: (blockerInums: number[]) => void;
    onBlocksChange?: (blockedInums: number[]) => void;
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
    private containerHeights: number[];
    private lastResponses: IssueResponse[] | null;
    private initialScrollDone: boolean;

    constructor(props: DetailViewProps) {
        super(props);
        this.inputValue = '';
        this.focusedField = null;
        this.overlay = OverlayType.None;
        this.blockedBySet = new Set(props.blockedBy);
        this.blocksSet = new Set(props.blocks);
        this.issueHeaderLineCount = 0;
        this.containerHeights = props.responses.map(r =>
            ResponseContainer.computeLineCount(r.body, props.columns),
        );
        this.lastResponses = props.responses;
        this.initialScrollDone = false;
        this.selectedMessage = Math.max(0, props.responses.length - 1);
        this.firstVisibleMessage = 0;
    }

    get conversationHeight(): number {
        return Math.max(
            1,
            this.props.rows - HEADER_LINES - this.issueHeaderLineCount - INPUT_AREA_LINES,
        );
    }

    /**
     * Adjust firstVisibleMessage so that selectedMessage is within the viewport.
     */
    deriveFirstVisible(): number {
        const responses = this.props.responses;
        if (responses.length === 0) return 0;

        const sel = this.selectedMessage;
        let first = this.firstVisibleMessage;

        // If selected is above current first visible, jump to it
        if (sel < first) return sel;

        // Check if selected fits in viewport starting from first
        let used = 0;
        for (let i = first; i <= sel; i++) {
            used += this.containerHeights[i];
        }
        if (used <= this.conversationHeight) return first;

        // Selected doesn't fit — work backwards from sel
        used = this.containerHeights[sel];
        first = sel;
        while (first > 0 && used + this.containerHeights[first - 1] <= this.conversationHeight) {
            first--;
            used += this.containerHeights[first];
        }
        return first;
    }

    /**
     * Find the last container index that overlaps the viewport.
     * Includes partially-visible containers so the Box clips them.
     */
    computeLastVisible(): number {
        const responses = this.props.responses;
        if (responses.length === 0) return 0;

        let last = this.firstVisibleMessage;
        let used = this.containerHeights[last];
        while (last + 1 < responses.length && used < this.conversationHeight) {
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

    handleKey = (_input: string, key: Key) => {
        // When an overlay is open, it handles its own input
        if (this.overlay !== OverlayType.None) return;

        if (key.escape) {
            this.props.onBack?.();
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
            if (this.selectedMessage < this.props.responses.length - 1) {
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
        // When a header field is focused, Enter opens its overlay instead
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
        const { inum, issue, responses, blocks, group, columns, containers } = this.props;

        // Recompute container heights if responses changed
        if (responses !== this.lastResponses) {
            this.containerHeights = responses.map(r =>
                ResponseContainer.computeLineCount(r.body, columns),
            );
            this.lastResponses = responses;
            if (this.selectedMessage >= responses.length) {
                this.selectedMessage = Math.max(0, responses.length - 1);
            }
            this.firstVisibleMessage = this.deriveFirstVisible();
        }

        const blockedByArr = [...this.blockedBySet];
        const blockedByStr = blockedByArr.length > 0
            ? blockedByArr.map(n => `I-${n}`).join(', ')
            : '(none)';
        const blocksArr = [...this.blocksSet];
        const blocksStr = blocksArr.length > 0
            ? blocksArr.map(n => `I-${n}`).join(', ')
            : '(none)';

        // Total content height below the App header (conversation + input + issue header)
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
        const groupFocused = this.focusedField === FIELD_GROUP;
        const blockedByFocused = this.focusedField === FIELD_BLOCKED_BY;
        const blocksFocused = this.focusedField === FIELD_BLOCKS;

        const issueHeader: React.ReactNode[] = [
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

        // Initial scroll to bottom
        if (!this.initialScrollDone && responses.length > 0) {
            this.selectedMessage = responses.length - 1;
            this.firstVisibleMessage = this.deriveFirstVisible();
            this.initialScrollDone = true;
        }

        // Determine visible range of containers
        const lastVisible = responses.length > 0
            ? this.computeLastVisible()
            : -1;
        const visibleResponses = responses.length > 0
            ? responses.slice(this.firstVisibleMessage, lastVisible + 1)
            : [];

        return (
            <Box flexDirection="column">
                <DetailInputBridge onKey={this.handleKey} />
                {issueHeader}

                {/* Scrollable conversation */}
                <Box flexDirection="column" height={this.conversationHeight} overflow="hidden">
                    {visibleResponses.map((resp, i) => (
                        <ResponseContainer
                            key={resp.id}
                            response={resp}
                            columns={columns}
                            selected={this.firstVisibleMessage + i === this.selectedMessage}
                        />
                    ))}
                </Box>

                {/* Input area */}
                <Text dimColor>{'─'.repeat(columns)}</Text>
                <Box>
                    <Text color="cyan">Enter message: &gt; </Text>
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
