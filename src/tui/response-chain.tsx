import React from 'react';
import { Box, Text } from 'ink';
import type { Response } from '../types.js';
import { ResponseContainer } from './response-container.js';

/** Check if any reply has a timestamp after userLastViewedAt and hasn't been seen. */
function checkNewReplies(node: Response, userLastViewedAt: string): boolean {
    let r = node.reply;
    while (r) {
        if (r.content.seen === null && r.content.timestamp > userLastViewedAt) return true;
        r = r.response;
    }
    return false;
}

/** Walk a .response chain into a flat array. */
export function flattenToArray(root: Response | null): Response[] {
    const arr: Response[] = [];
    let current = root;
    while (current) {
        arr.push(current);
        current = current.response;
    }
    return arr;
}

export const NEW_REPLIES_SEPARATOR_LINES = 1;

/** Build the "New Replies" separator string. */
function newRepliesSeparator(columns: number): string {
    const label = '[ New Replies ]';
    const totalDashes = Math.max(0, columns - label.length);
    const left = Math.floor(totalDashes / 2);
    const right = totalDashes - left;
    return '─'.repeat(left) + label + '─'.repeat(right);
}

/** Find the index of the first unseen message in the array, or -1 if none. */
function findFirstNewReplyIndex(messages: Response[], userLastViewedAt: string | null): number {
    if (!userLastViewedAt) return -1;
    for (let i = 0; i < messages.length; i++) {
        const c = messages[i].content;
        if (c.seen === null && c.timestamp > userLastViewedAt) return i;
    }
    return -1;
}

/** Compute the rendered height of a single response container. */
function computeHeight(response: Response, columns: number): number {
    return ResponseContainer.computeLineCount(response.content.body, columns);
}

export interface ResponseChainProps {
    rootResponse: Response | null;
    columns: number;
    height: number;
    userLastViewedAt: string | null;
    selectedIndex: number;
}

/**
 * Given a message list and selected index, find the first message to display.
 * If prevFirstVisible is provided, the viewport anchors to it and only shifts
 * when the selection moves outside the visible range — this prevents the
 * viewport from jumping when you scroll by one message.
 */
export function deriveFirstVisible(
    messages: Response[],
    selectedIndex: number,
    columns: number,
    height: number,
    prevFirstVisible?: number,
): number {
    if (messages.length === 0) return 0;

    const sel = selectedIndex;

    // If we have a previous anchor, try to keep it stable
    if (prevFirstVisible !== undefined && prevFirstVisible >= 0 && prevFirstVisible < messages.length) {
        const lastVisible = computeLastVisible(messages, prevFirstVisible, columns, height);

        // Selection still in viewport — keep anchor (but only if selected message fully fits)
        if (sel >= prevFirstVisible && sel <= lastVisible) {
            // Check the selected message isn't partially clipped at the bottom
            let usedToSel = 0;
            for (let i = prevFirstVisible; i <= sel; i++) {
                usedToSel += computeHeight(messages[i], columns);
            }
            if (usedToSel <= height) {
                return prevFirstVisible;
            }
            // Selected message is partially clipped — fall through to recompute
        }

        // Selection scrolled above viewport — shift up to show it at top
        if (sel < prevFirstVisible) {
            return sel;
        }

        // Selection scrolled below viewport — shift down minimally
        // Work backwards from sel to find new firstVisible
        let used = computeHeight(messages[sel], columns);
        let first = sel;
        while (first > 0 && used + computeHeight(messages[first - 1], columns) <= height) {
            first--;
            used += computeHeight(messages[first], columns);
        }
        return first;
    }

    // No previous anchor — cold start (initial render, thread entry, etc.)
    let first = 0;

    // Start from 0 and see if selection fits
    let used = 0;
    for (let i = first; i <= sel; i++) {
        used += computeHeight(messages[i], columns);
    }
    if (used <= height) return first;

    // Selection doesn't fit from 0 — work backwards from selection
    used = computeHeight(messages[sel], columns);
    first = sel;
    while (first > 0 && used + computeHeight(messages[first - 1], columns) <= height) {
        first--;
        used += computeHeight(messages[first], columns);
    }
    return first;
}

/** Given a first visible index, find the last message that fits in the viewport. */
export function computeLastVisible(
    messages: Response[],
    firstVisible: number,
    columns: number,
    height: number,
): number {
    if (messages.length === 0) return 0;

    let last = firstVisible;
    let used = computeHeight(messages[last], columns);
    while (last + 1 < messages.length && used < height) {
        last++;
        used += computeHeight(messages[last], columns);
    }
    return last;
}

export class ResponseChain extends React.Component<ResponseChainProps> {
    private lastFirstVisible: number | undefined;
    private lastRootResponse: Response | null | undefined;

    render() {
        const { rootResponse, columns, height, userLastViewedAt, selectedIndex } = this.props;

        // Reset viewport anchor when the displayed chain changes (thread enter/exit, issue nav)
        if (rootResponse !== this.lastRootResponse) {
            this.lastFirstVisible = undefined;
            this.lastRootResponse = rootResponse;
        }

        const messages = flattenToArray(rootResponse);

        if (messages.length === 0) {
            this.lastFirstVisible = undefined;
            return <Box flexDirection="column" height={height} overflow="hidden" />;
        }

        const firstVisible = deriveFirstVisible(messages, selectedIndex, columns, height, this.lastFirstVisible);
        this.lastFirstVisible = firstVisible;
        const lastVisible = computeLastVisible(messages, firstVisible, columns, height);
        const visibleMessages = messages.slice(firstVisible, lastVisible + 1);

        const firstNewReply = findFirstNewReplyIndex(messages, userLastViewedAt);

        return (
            <Box flexDirection="column" height={height} overflow="hidden">
                {visibleMessages.map((response, i) => {
                    const globalIndex = firstVisible + i;
                    const hasNewReplies = userLastViewedAt !== null
                        && checkNewReplies(response, userLastViewedAt);
                    const showNewSeparator = globalIndex === firstNewReply;
                    return (
                        <React.Fragment key={response.id}>
                            {showNewSeparator && (
                                <Text color="yellow">{newRepliesSeparator(columns)}</Text>
                            )}
                            <ResponseContainer
                                response={response}
                                columns={columns}
                                selected={globalIndex === selectedIndex}
                                hasNewReplies={hasNewReplies}
                            />
                        </React.Fragment>
                    );
                })}
            </Box>
        );
    }
}
