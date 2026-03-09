/**
 * mock-store.ts — JSON-backed mock data store.
 *
 * Loads mock data from data/mock-data.json, hydrates Response linked lists,
 * and provides save() to persist mutations back to disk.
 *
 * Phase 1.5 bridge: lets the TUI be fully interactive before DB wiring.
 * TODO: Remove when Phase 3 (TUI <-> DB) is complete.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Issue, Response, Message } from '../types.js';
import { IssueStatus, ResponseType, AuthorType } from '../types.js';
import type { DetailMockData } from './mock-data.js';

// ---- JSON schema types ----

export interface MockResponseRow {
    id: number;
    inum: number;
    author: 'user' | 'agent';
    type: string;
    body: string;
    timestamp: string;
    seen: string | null;
    responding_to_id: number | null;
    replying_to_id: number | null;
    is_continuation: boolean;
    thread_resolved_at: string | null;
    quoted_response_id: number | null;
}

export interface MockDataJson {
    issues: Issue[];
    responses: MockResponseRow[];
    unreadInums: number[];
    maxAgents: number;
    nextResponseId: number;
}

// ---- Paths ----

const DATA_DIR = path.resolve(import.meta.dirname, '../../data');
const ACTIVE_PATH = path.join(DATA_DIR, 'mock-data.json');
const DEFAULT_PATH = path.join(DATA_DIR, 'mock-data.default.json');

// ---- Author/Type string <-> enum maps ----

const authorFromString: Record<string, AuthorType> = {
    user: AuthorType.User,
    agent: AuthorType.Agent,
};

const authorToString: Record<number, 'user' | 'agent'> = {
    [AuthorType.User]: 'user',
    [AuthorType.Agent]: 'agent',
};

const typeFromString: Record<string, ResponseType> = {
    question: ResponseType.Question,
    implementation: ResponseType.Implementation,
    clarification: ResponseType.Clarification,
    analysis: ResponseType.Analysis,
    fix: ResponseType.Fix,
    other: ResponseType.Other,
    none: ResponseType.None,
};

const typeToString: Record<number, string> = {
    [ResponseType.Question]: 'question',
    [ResponseType.Implementation]: 'implementation',
    [ResponseType.Clarification]: 'clarification',
    [ResponseType.Analysis]: 'analysis',
    [ResponseType.Fix]: 'fix',
    [ResponseType.Other]: 'other',
    [ResponseType.None]: 'none',
};

// ---- Hydrate: JSON rows -> linked Response trees ----

function hydrateResponses(rows: MockResponseRow[]): Map<number, Response> {
    const nodeMap = new Map<number, Response>();

    // Pass 1: create all nodes (unlinked)
    for (const row of rows) {
        const message: Message = {
            author: authorFromString[row.author] ?? AuthorType.User,
            type: typeFromString[row.type] ?? ResponseType.None,
            body: row.body,
            timestamp: row.timestamp,
            seen: row.seen,
        };
        const node: Response = {
            id: row.id,
            content: message,
            responding_to: null,
            response: null,
            replying_to: null,
            reply: null,
            is_continuation: row.is_continuation,
            thread_resolved_at: row.thread_resolved_at,
            quoted_response_id: row.quoted_response_id ?? null,
        };
        nodeMap.set(row.id, node);
    }

    // Pass 2: link pointers
    for (const row of rows) {
        const node = nodeMap.get(row.id)!;
        if (row.responding_to_id !== null) {
            const prev = nodeMap.get(row.responding_to_id);
            if (prev) {
                node.responding_to = prev;
                prev.response = node;
            }
        }
        if (row.replying_to_id !== null) {
            const parent = nodeMap.get(row.replying_to_id);
            if (parent) {
                node.replying_to = parent;
                // Only set parent.reply if this is the first reply
                // (the one with no responding_to within the reply chain)
                if (row.responding_to_id === null) {
                    parent.reply = node;
                }
            }
        }
    }

    return nodeMap;
}

function findRootForInum(rows: MockResponseRow[], inum: number, nodeMap: Map<number, Response>): Response | null {
    // Find the first response for this inum with no responding_to and no replying_to
    // (i.e., the root of the main chain)
    for (const row of rows) {
        if (row.inum === inum && row.responding_to_id === null && row.replying_to_id === null) {
            return nodeMap.get(row.id) ?? null;
        }
    }
    return null;
}

// ---- Flatten: linked Response trees -> JSON rows ----

function flattenResponse(node: Response, inum: number, visited: Set<number>): MockResponseRow[] {
    const rows: MockResponseRow[] = [];
    let current: Response | null = node;
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        rows.push({
            id: current.id,
            inum,
            author: authorToString[current.content.author] ?? 'user',
            type: typeToString[current.content.type] ?? 'none',
            body: current.content.body,
            timestamp: current.content.timestamp,
            seen: current.content.seen,
            responding_to_id: current.responding_to?.id ?? null,
            replying_to_id: current.replying_to?.id ?? null,
            is_continuation: current.is_continuation,
            thread_resolved_at: current.thread_resolved_at,
            quoted_response_id: current.quoted_response_id,
        });

        // Recurse into reply chains
        if (current.reply) {
            rows.push(...flattenResponse(current.reply, inum, visited));
        }

        current = current.response;
    }
    return rows;
}

// ---- Public API ----

export interface MockStore {
    issues: Issue[];
    unreadInums: Set<number>;
    maxAgents: number;
    detailData: Record<number, DetailMockData>;
    nextResponseId: number;
}

export function loadMockData(): MockStore {
    const jsonPath = fs.existsSync(ACTIVE_PATH) ? ACTIVE_PATH : DEFAULT_PATH;
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const data: MockDataJson = JSON.parse(raw);

    const nodeMap = hydrateResponses(data.responses);

    const detailData: Record<number, DetailMockData> = {};
    for (const issue of data.issues) {
        detailData[issue.inum] = {
            issue,
            rootResponse: findRootForInum(data.responses, issue.inum, nodeMap),
        };
    }

    return {
        issues: data.issues,
        unreadInums: new Set(data.unreadInums),
        maxAgents: data.maxAgents,
        detailData,
        nextResponseId: data.nextResponseId,
    };
}

export function saveMockData(store: MockStore): void {
    const visited = new Set<number>();
    const allRows: MockResponseRow[] = [];

    for (const [inumStr, detail] of Object.entries(store.detailData)) {
        const inum = Number(inumStr);
        if (detail.rootResponse) {
            allRows.push(...flattenResponse(detail.rootResponse, inum, visited));
        }
    }

    const data: MockDataJson = {
        issues: store.issues,
        responses: allRows,
        unreadInums: [...store.unreadInums],
        maxAgents: store.maxAgents,
        nextResponseId: store.nextResponseId,
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ACTIVE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function resetMockData(): void {
    if (!fs.existsSync(DEFAULT_PATH)) {
        throw new Error(`Default mock data not found: ${DEFAULT_PATH}`);
    }
    fs.copyFileSync(DEFAULT_PATH, ACTIVE_PATH);
}

export function getNextResponseId(store: MockStore): number {
    const id = store.nextResponseId;
    store.nextResponseId = id + 1;
    return id;
}
