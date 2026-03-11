import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'ink';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { Header, HEADER_LINES } from './header.js';
import { ViewType } from './views.js';

const cols = 80;
const rts = (el: React.JSX.Element) => renderToString(el, { columns: cols });

describe('Header', () => {

    // ---- Constants ----

    it('HEADER_LINES is 3', () => {
        expect(HEADER_LINES).toBe(3);
    });

    // ---- Renders exactly 3 lines ----

    it('renders exactly 3 lines with indicators', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols}
                activeAgents={1} unreadCount={2} />
        );
        expect(output.split('\n')).toHaveLength(3);
    });

    it('renders exactly 3 lines without indicators', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} />
        );
        expect(output.split('\n')).toHaveLength(3);
    });

    // ---- Line 1: title line is bold with box-drawing rule ----

    it('line 1 is bold', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} />
        );
        const line1 = output.split('\n')[0];
        expect(line1).toBe(chalk.bold(stripAnsi(line1)));
    });

    it('line 1 contains box-drawing ─ characters', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} />
        );
        const line1 = output.split('\n')[0];
        expect(line1).toContain('─');
    });

    it('line 1 contains app title', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} />
        );
        const line1 = output.split('\n')[0];
        expect(line1).toContain('Review Agent Orchestrator');
    });

    // ---- Line 2: status indicators ----

    it('line 2 shows agent count when provided', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} activeAgents={3} />
        ).split('\n')[1];
        expect(line2).toContain('Agents: 3');
    });

    it('line 2 shows unread count when provided', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} unreadCount={5} />
        ).split('\n')[1];
        expect(line2).toContain('Unread: 5');
    });

    it('line 2 shows both indicators together', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols}
                activeAgents={2} unreadCount={8} />
        ).split('\n')[1];
        expect(line2).toContain('Agents: 2');
        expect(line2).toContain('Unread: 8');
    });

    it('line 2 omits indicators when not provided', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} />
        ).split('\n')[1];
        expect(line2).not.toContain('Agents:');
        expect(line2).not.toContain('Unread:');
    });

    it('line 2 shows Agents: 0 (zero is not falsy-hidden)', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} activeAgents={0} />
        ).split('\n')[1];
        expect(line2).toContain('Agents: 0');
    });

    it('line 2 shows Unread: 0 (zero is not falsy-hidden)', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} unreadCount={0} />
        ).split('\n')[1];
        expect(line2).toContain('Unread: 0');
    });

    it('line 2 shows Agents: active/max when maxAgents provided', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols}
                activeAgents={2} maxAgents={5} />
        ).split('\n')[1];
        expect(line2).toContain('Agents: 2/5');
    });

    it('line 2 is plain text (not bold or dim)', () => {
        const line2 = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols}
                activeAgents={1} unreadCount={2} />
        ).split('\n')[1];
        expect(line2).toBe('Agents: 1  |  Unread: 2');
    });

    // ---- Width adaptation ----

    it('renders at narrow width (40 columns) without crash', () => {
        const output = renderToString(
            <Header currentView={{ type: ViewType.Home }} columns={40} />,
            { columns: 40 },
        );
        expect(output).toContain('Review Agent Orchestrator');
        expect(output.split('\n')).toHaveLength(3);
    });

    it('renders at wide width (160 columns) without crash', () => {
        const output = renderToString(
            <Header currentView={{ type: ViewType.Home }} columns={160} />,
            { columns: 160 },
        );
        expect(output).toContain('Review Agent Orchestrator');
        expect(output.split('\n')).toHaveLength(3);
    });

    // ---- Memoization ----

    it('Header is memoized with React.memo', () => {
        expect(Header).toHaveProperty('$$typeof', Symbol.for('react.memo'));
    });

    // ---- subtitleOverride ----

    it('subtitleOverride replaces line 3 when provided', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} subtitleOverride="Custom hint" />
        );
        const line3 = output.split('\n')[2];
        expect(line3).toContain('Custom hint');
        expect(line3).not.toContain('All issues and orchestration state');
    });

    it('line 3 shows trash subtitle for Trash view', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Trash }} columns={cols} />
        );
        const line3 = output.split('\n')[2];
        expect(line3).toContain('Trashed issues pending deletion');
    });

    it('line 3 shows default subtitle when subtitleOverride is undefined', () => {
        const output = rts(
            <Header currentView={{ type: ViewType.Home }} columns={cols} />
        );
        const line3 = output.split('\n')[2];
        expect(line3).toContain('All issues and orchestration state');
    });
});
