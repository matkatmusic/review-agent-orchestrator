import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Header, HEADER_LINES } from './header.js';
import { type View, ViewType } from './views.js';

describe('Header', () => {
    const defaultColumns = 80;

    // ---- Constants ----

    it('HEADER_LINES is 3', () => {
        expect(HEADER_LINES).toBe(3);
    });

    // ---- Title line (line 1) — app title + view name ----

    it('shows app title on Dashboard', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('Review Agent Orchestrator');
    });

    it('shows view name "Home" in title', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('Home');
    });

    it('shows view name "Detail" with inum in title', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Detail, inum: 42 }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('I-42');
    });

    it('shows view name "New Issue" in title', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.NewIssue }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('New Issue');
    });

    it('shows view name "Agent Status" in title', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.AgentStatus }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('Agent Status');
    });

    it('shows view name "Blocking Map" in title', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.BlockingMap }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('Blocking Map');
    });

    it('shows view name "Group View" in title', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.GroupView }} columns={defaultColumns} />
        );
        expect(lastFrame()).toContain('Group View');
    });

    // ---- Title line uses box-drawing characters ----

    it('title line contains ─ box-drawing characters', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={defaultColumns} />
        );
        const lines = lastFrame()!.split('\n');
        expect(lines[0]).toContain('─');
    });

    // ---- Subtitle line (line 3) — view-specific description ----

    it('Home subtitle describes issues', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).toMatch(/issues/i);
    });

    it('Detail subtitle references the inum', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Detail, inum: 7 }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).toContain('I-7');
    });

    it('NewIssue subtitle describes creation', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.NewIssue }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).toMatch(/create/i);
    });

    it('AgentStatus subtitle describes agents', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.AgentStatus }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).toMatch(/agent/i);
    });

    it('BlockingMap subtitle describes dependencies', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.BlockingMap }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).toMatch(/depend|block/i);
    });

    it('GroupView subtitle describes grouping', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.GroupView }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).toMatch(/group|container/i);
    });

    // ---- Optional status indicators (line 2) ----

    it('shows active agent count when provided', () => {
        const { lastFrame } = render(
            <Header
                currentView={{ type: ViewType.Home }}
                columns={defaultColumns}
                activeAgents={3}
            />
        );
        expect(lastFrame()).toContain('Agents: 3');
    });

    it('shows unread count when provided', () => {
        const { lastFrame } = render(
            <Header
                currentView={{ type: ViewType.Home }}
                columns={defaultColumns}
                unreadCount={5}
            />
        );
        expect(lastFrame()).toContain('Unread: 5');
    });

    it('shows both indicators together', () => {
        const { lastFrame } = render(
            <Header
                currentView={{ type: ViewType.Home }}
                columns={defaultColumns}
                activeAgents={2}
                unreadCount={8}
            />
        );
        const frame = lastFrame()!;
        expect(frame).toContain('Agents: 2');
        expect(frame).toContain('Unread: 8');
    });

    it('omits indicators when not provided', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={defaultColumns} />
        );
        const frame = lastFrame()!;
        expect(frame).not.toContain('Agents:');
        expect(frame).not.toContain('Unread:');
    });

    // ---- Width adaptation ----

    it('renders without crash at narrow width (40 columns)', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={40} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('Review Agent Orchestrator');
    });

    it('renders without crash at wide width (160 columns)', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={160} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('Review Agent Orchestrator');
    });

    // ---- Renders exactly 3 lines ----

    it('renders exactly 3 lines with indicators', () => {
        const { lastFrame } = render(
            <Header
                currentView={{ type: ViewType.Home }}
                columns={defaultColumns}
                activeAgents={1}
                unreadCount={2}
            />
        );
        const lines = lastFrame()!.split('\n');
        expect(lines).toHaveLength(3);
    });

    it('renders exactly 3 lines without indicators', () => {
        const { lastFrame } = render(
            <Header currentView={{ type: ViewType.Home }} columns={defaultColumns} />
        );
        const lines = lastFrame()!.split('\n');
        expect(lines).toHaveLength(3);
    });

    // ---- Edge case: zero values are not falsy-hidden ----

    it('shows Agents: 0 when activeAgents is 0', () => {
        const { lastFrame } = render(
            <Header
                currentView={{ type: ViewType.Home }}
                columns={defaultColumns}
                activeAgents={0}
            />
        );
        expect(lastFrame()).toContain('Agents: 0');
    });

    it('shows Unread: 0 when unreadCount is 0', () => {
        const { lastFrame } = render(
            <Header
                currentView={{ type: ViewType.Home }}
                columns={defaultColumns}
                unreadCount={0}
            />
        );
        expect(lastFrame()).toContain('Unread: 0');
    });
});
