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
    viewRepliesFocusedIndex?: number;
}

/**
 * Center the viewport on the selected message, filling space above and
 * below it.  Messages furthest from the selection are clipped first.
 */
function centerOnSelection(
    messages: Response[],
    sel: number,
    columns: number,
    height: number,
): number {
    const selHeight = computeHeight(messages[sel], columns);
    let above = 0;  // total height of messages added above sel
    let below = 0;  // total height of messages added below sel
    let lo = sel;   // first index included
    let hi = sel;   // last index included
    let remaining = height - selHeight;

    // Alternate: expand below, then above, closest to sel first
    while (remaining > 0) {
        const canDown = hi + 1 < messages.length;
        const canUp = lo > 0;
        if (!canDown && !canUp) break;

        if (canDown) {
            const h = computeHeight(messages[hi + 1], columns);
            if (h > remaining) break;
            hi++;
            below += h;
            remaining -= h;
        }
        if (remaining <= 0) break;
        if (canUp) {
            const h = computeHeight(messages[lo - 1], columns);
            if (h > remaining) break;
            lo--;
            above += h;
            remaining -= h;
        }
    }

    // If there's still space (one direction exhausted), fill the other
    while (remaining > 0 && hi + 1 < messages.length) {
        const h = computeHeight(messages[hi + 1], columns);
        if (h > remaining) break;
        hi++;
        remaining -= h;
    }
    while (remaining > 0 && lo > 0) {
        const h = computeHeight(messages[lo - 1], columns);
        if (h > remaining) break;
        lo--;
        remaining -= h;
    }

    return lo;
}

/**
 * Given a message list and selected index, find the first message to display.
 *
 * Two modes:
 * - Scroll mode (height unchanged, valid prevFirstVisible): stable anchor that
 *   only shifts when selection moves out of viewport. Prevents jumping when
 *   you press up/down once.
 * - Reflow mode (height changed, or cold start): center on the selected
 *   message. Used on resize, thread enter/exit, and initial render.
 */
export function deriveFirstVisible(
    messages: Response[],
    selectedIndex: number,
    columns: number,
    height: number,
    prevFirstVisible?: number,
    prevHeight?: number,
): number {
    if (messages.length === 0) return 0;

    const sel = selectedIndex;
    const heightChanged = prevHeight !== undefined && prevHeight !== height;

    // Reflow: height changed or cold start — center on selection
    if (heightChanged || prevFirstVisible === undefined || prevFirstVisible < 0 || prevFirstVisible >= messages.length) {
        // Try showing from the start first (if selection fits without scrolling)
        let used = 0;
        for (let i = 0; i <= sel; i++) {
            used += computeHeight(messages[i], columns);
        }
        if (used <= height) {
            // Everything from 0..sel fits — but fill remaining space below too.
            // Just return 0; computeLastVisible will handle the rest.
            return 0;
        }
        return centerOnSelection(messages, sel, columns, height);
    }

    // Scroll mode: height is the same, stable anchor
    const lastVisible = computeLastVisible(messages, prevFirstVisible, columns, height);

    // Selection still in viewport — keep anchor (but only if selected message fully fits)
    if (sel >= prevFirstVisible && sel <= lastVisible) {
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
    let used = computeHeight(messages[sel], columns);
    let first = sel;
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
    private lastHeight: number | undefined;
    private lastRootResponse: Response | null | undefined;

    render() {
        const { rootResponse, columns, height, userLastViewedAt, selectedIndex, viewRepliesFocusedIndex } = this.props;

        // Reset viewport anchor when the displayed chain changes (thread enter/exit, issue nav)
        if (rootResponse !== this.lastRootResponse) {
            this.lastFirstVisible = undefined;
            this.lastHeight = undefined;
            this.lastRootResponse = rootResponse;
        }

        const messages = flattenToArray(rootResponse);

        if (messages.length === 0) {
            this.lastFirstVisible = undefined;
            this.lastHeight = undefined;
            return <Box flexDirection="column" height={height} overflow="hidden" />;
        }

        const firstVisible = deriveFirstVisible(messages, selectedIndex, columns, height, this.lastFirstVisible, this.lastHeight);
        this.lastFirstVisible = firstVisible;
        this.lastHeight = height;
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
                                threadResolved={!!response.thread_resolved_at}
                                viewRepliesFocused={globalIndex === viewRepliesFocusedIndex}
                            />
                        </React.Fragment>
                    );
                })}
            </Box>
        );
    }
}
