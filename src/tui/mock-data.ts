/**
 * mock-data.ts — Module-level mock data loaded from data/mock-data.json.
 *
 * All exports are mutable references into the MockStore. Mutations to these
 * objects (e.g., appending a Response, changing issue status) are reflected
 * immediately. Call saveMockStore() to persist changes to disk.
 *
 * TODO: Remove when Phase 3 (TUI <-> DB) replaces mock data with live queries.
 */

import type { Issue, Dependency, Container } from '../types.js';
import { loadMockData, saveMockData, resetMockData, type MockStore } from './mock-store.js';

// ---- Detail mock data shape (unchanged from original) ----

export interface DetailMockData {
    issue: Issue;
    rootResponse: import('../types.js').Response | null;
    blockedBy: number[];
    blocks: number[];
    group: string;
}

// ---- Load from JSON on import ----

const store: MockStore = loadMockData();

// ---- Exported references (consumers continue to use these as before) ----

export const MOCK_ISSUES: Issue[] = store.issues;
export const MOCK_UNREAD_INUMS: Set<number> = store.unreadInums;
export const MOCK_MAX_AGENTS: number = store.maxAgents;
export const MOCK_DETAIL_DATA: Record<number, DetailMockData> = store.detailData;
export const MOCK_CONTAINERS: Container[] = store.containers;
export const MOCK_DEPS: Dependency[] = store.dependencies;
export const MOCK_CONTAINER_ISSUES: Record<number, Issue[]> = store.containerIssues;

// ---- Save & store access ----

/** Persist current in-memory state to data/mock-data.json. */
export function saveMockStore(): void {
    saveMockData(store);
}

/** Get the shared MockStore (for getNextResponseId, etc). */
export function getMockStore(): MockStore {
    return store;
}

/**
 * Reset to defaults and reload in-place. Copies default JSON over active,
 * re-reads it, and replaces all exported array/object contents so existing
 * references see the fresh data.
 */
export function reloadMockStore(): void {
    resetMockData();
    const fresh = loadMockData();

    // Replace array contents in-place
    MOCK_ISSUES.length = 0;
    MOCK_ISSUES.push(...fresh.issues);

    MOCK_UNREAD_INUMS.clear();
    for (const inum of fresh.unreadInums) MOCK_UNREAD_INUMS.add(inum);

    // Replace object contents in-place
    for (const key of Object.keys(MOCK_DETAIL_DATA)) delete MOCK_DETAIL_DATA[Number(key)];
    Object.assign(MOCK_DETAIL_DATA, fresh.detailData);

    MOCK_CONTAINERS.length = 0;
    MOCK_CONTAINERS.push(...fresh.containers);

    MOCK_DEPS.length = 0;
    MOCK_DEPS.push(...fresh.dependencies);

    for (const key of Object.keys(MOCK_CONTAINER_ISSUES)) delete MOCK_CONTAINER_ISSUES[Number(key)];
    Object.assign(MOCK_CONTAINER_ISSUES, fresh.containerIssues);

    store.nextResponseId = fresh.nextResponseId;
    store.maxAgents = fresh.maxAgents;
}
