import type { Message, Response } from '../types.js';
import { AuthorType, ResponseType } from '../types.js';
import { splitIntoParagraphs } from './paragraph-utils.js';

let nextId = 1;

/** Reset the ID counter (useful for tests). */
export function resetIdCounter(start = 1): void {
    nextId = start;
}

/** Create a Message. */
export function createMessage(
    author: AuthorType,
    type: ResponseType,
    body: string,
    timestamp: string,
    seen: string | null = null,
): Message {
    return { author, type, body, timestamp, seen };
}

/** Create a single Response node (unlinked) with an explicit id. */
export function createResponseNode(id: number, message: Message, isContinuation = false): Response {
    return {
        id: id,
        content: message,
        responding_to: null,
        response: null,
        replying_to: null,
        reply: null,
        is_continuation: isContinuation,
        thread_resolved_at: null,
        quoted_response_id: null,
    };
}

/** Create a single Response node (unlinked) using the internal id counter. */
function makeResponseNode(message: Message, isContinuation = false): Response {
    return createResponseNode(nextId++, message, isContinuation);
}

/** Link an array of Response nodes into a .response/.responding_to chain. */
function linkResponseChain(nodes: Response[]): void {
    for (let i = 0; i < nodes.length - 1; i++) {
        nodes[i].response = nodes[i + 1];
        nodes[i + 1].responding_to = nodes[i];
    }
}

/**
 * Build a .response chain (vertical linked list) from an array of Messages.
 * Returns the root node and a flat array of all nodes for easy indexing.
 */
export function buildResponseChain(messages: Message[]): { root: Response; nodes: Response[] } {
    if (messages.length === 0) {
        throw new Error('buildResponseChain requires at least one message');
    }

    const nodes = messages.map(m => makeResponseNode(m));
    linkResponseChain(nodes);

    return { root: nodes[0], nodes };
}

/**
 * Attach a reply chain to a parent node.
 * Sets parent.reply to the first reply, links replies via .response chain.
 * Each reply's replying_to points to the parent.
 * Returns the array of reply nodes.
 */
export function buildReplyChain(parent: Response, replies: Message[]): Response[] {
    if (replies.length === 0) return [];

    const nodes = replies.map(m => makeResponseNode(m));

    // First reply links to parent
    parent.reply = nodes[0];
    nodes[0].replying_to = parent;

    linkResponseChain(nodes);

    return nodes;
}

/**
 * Split an agent message body into paragraphs, returning Response[] with
 * responding_to/response links and is_continuation set.
 * The first node keeps is_continuation=false; subsequent nodes are continuations.
 * All nodes are linked via .responding_to/.response within the returned array.
 */
export function splitAgentMessage(
    body: string,
    meta: { type: ResponseType; timestamp: string; seen: string | null },
): Response[] {
    const paragraphs = splitIntoParagraphs(body);
    if (paragraphs.length === 0) {
        return [makeResponseNode(createMessage(AuthorType.Agent, meta.type, '', meta.timestamp, meta.seen), false)];
    }

    const nodes = paragraphs.map((para, i) =>
        makeResponseNode(createMessage(AuthorType.Agent, meta.type, para, meta.timestamp, meta.seen), i > 0),
    );
    linkResponseChain(nodes);

    return nodes;
}

/**
 * Build a response chain from a mix of messages and pre-built Response groups.
 * Accepts an array of items, each being either:
 *   - Message — creates a single Response node
 *   - Response[] — pre-linked group from splitAgentMessage (already has
 *     internal responding_to/response links and is_continuation set)
 *
 * Returns { root, nodes } like buildResponseChain.
 */
export function buildMixedChain(
    items: (Message | Response[])[],
): { root: Response; nodes: Response[] } {
    const allNodes: Response[] = [];

    for (const item of items) {
        if (Array.isArray(item)) {
            // Pre-built Response group (e.g. from splitAgentMessage)
            for (const node of item) {
                allNodes.push(node);
            }
        } else {
            // Single message — create a new node
            allNodes.push(makeResponseNode(item));
        }
    }

    if (allNodes.length === 0) {
        throw new Error('buildMixedChain requires at least one item');
    }

    // Link via .response chain, connecting across group boundaries
    linkResponseChain(allNodes);

    return { root: allNodes[0], nodes: allNodes };
}
