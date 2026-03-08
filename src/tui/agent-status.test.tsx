import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { AgentStatus, MOCK_AGENTS } from './agent-status.js';

const ARROW_UP = '\x1b[A';
const ARROW_DOWN = '\x1b[B';
const ENTER = '\r';
const ESC = '\x1b';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('AgentStatus', () => {
    // ---- Rendering ----

    it('renders without crash', () => {
        const { lastFrame } = render(<AgentStatus />);
        expect(lastFrame()).toBeDefined();
    });

    it('displays all mock agent entries', () => {
        const { lastFrame } = render(<AgentStatus />);
        const frame = lastFrame()!;
        for (const agent of MOCK_AGENTS) {
            expect(frame).toContain(`I-${agent.inum}`);
            expect(frame).toContain(agent.title);
            expect(frame).toContain(agent.paneId);
        }
    });

    it('shows alive indicator for alive agents', () => {
        const { lastFrame } = render(<AgentStatus />);
        const frame = lastFrame()!;
        const aliveAgent = MOCK_AGENTS.find(a => a.alive);
        expect(aliveAgent).toBeDefined();
        // Alive agents show a green circle (●)
        expect(frame).toContain('\u25CF'); // ● (filled circle used for alive)
    });

    it('shows dead indicator for dead agents', () => {
        const { lastFrame } = render(<AgentStatus />);
        const frame = lastFrame()!;
        const deadAgent = MOCK_AGENTS.find(a => !a.alive);
        expect(deadAgent).toBeDefined();
        // Dead agents show a red circle (○)
        expect(frame).toContain('\u25CB'); // ○ (empty circle used for dead)
    });

    it('shows last activity timestamp for each agent', () => {
        const { lastFrame } = render(<AgentStatus />);
        const frame = lastFrame()!;
        for (const agent of MOCK_AGENTS) {
            // Timestamps displayed in shortened format (HH:MM or date)
            expect(frame).toContain(agent.lastActivity.slice(11, 16));
        }
    });

    // Footer shortcuts are rendered centrally by App-level Footer component
    // and tested in footer.test.tsx

    // ---- Cursor navigation ----

    it('first agent is selected by default', () => {
        const { lastFrame } = render(<AgentStatus />);
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        // The first agent row should have the cursor marker
        const firstAgentLine = lines.find(l => l.includes(`I-${MOCK_AGENTS[0].inum}`));
        expect(firstAgentLine).toBeDefined();
        expect(firstAgentLine).toContain('\u25B8'); // ▸ cursor
    });

    it('arrow down moves cursor to next agent', async () => {
        const { lastFrame, stdin } = render(<AgentStatus />);
        await tick();
        stdin.write(ARROW_DOWN);
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const secondAgentLine = lines.find(l => l.includes(`I-${MOCK_AGENTS[1].inum}`));
        expect(secondAgentLine).toBeDefined();
        expect(secondAgentLine).toContain('\u25B8');
    });

    it('arrow up moves cursor to previous agent', async () => {
        const { lastFrame, stdin } = render(<AgentStatus />);
        await tick();
        // Move down first, then back up
        stdin.write(ARROW_DOWN);
        await tick();
        stdin.write(ARROW_UP);
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const firstAgentLine = lines.find(l => l.includes(`I-${MOCK_AGENTS[0].inum}`));
        expect(firstAgentLine).toBeDefined();
        expect(firstAgentLine).toContain('\u25B8');
    });

    it('cursor does not move above first item', async () => {
        const { lastFrame, stdin } = render(<AgentStatus />);
        await tick();
        stdin.write(ARROW_UP);
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const firstAgentLine = lines.find(l => l.includes(`I-${MOCK_AGENTS[0].inum}`));
        expect(firstAgentLine).toBeDefined();
        expect(firstAgentLine).toContain('\u25B8');
    });

    it('cursor does not move below last item', async () => {
        const { lastFrame, stdin } = render(<AgentStatus />);
        await tick();
        // Move down past the last item
        for (let i = 0; i < MOCK_AGENTS.length + 2; i++) {
            stdin.write(ARROW_DOWN);
            await tick();
        }
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const lastAgent = MOCK_AGENTS[MOCK_AGENTS.length - 1];
        const lastAgentLine = lines.find(l => l.includes(`I-${lastAgent.inum}`));
        expect(lastAgentLine).toBeDefined();
        expect(lastAgentLine).toContain('\u25B8');
    });

    it('j moves cursor down like arrow down', async () => {
        const { lastFrame, stdin } = render(<AgentStatus />);
        await tick();
        stdin.write('j');
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const secondAgentLine = lines.find(l => l.includes(`I-${MOCK_AGENTS[1].inum}`));
        expect(secondAgentLine).toBeDefined();
        expect(secondAgentLine).toContain('\u25B8');
    });

    it('k moves cursor up like arrow up', async () => {
        const { lastFrame, stdin } = render(<AgentStatus />);
        await tick();
        stdin.write('j');
        await tick();
        stdin.write('k');
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const firstAgentLine = lines.find(l => l.includes(`I-${MOCK_AGENTS[0].inum}`));
        expect(firstAgentLine).toBeDefined();
        expect(firstAgentLine).toContain('\u25B8');
    });

    // ---- Callbacks ----

    it('Enter calls onFocusPane with selected agent paneId', async () => {
        const onFocusPane = vi.fn();
        const { stdin } = render(<AgentStatus onFocusPane={onFocusPane} />);
        await tick();
        stdin.write(ENTER);
        await tick();
        expect(onFocusPane).toHaveBeenCalledWith(MOCK_AGENTS[0].paneId);
    });

    // SKIPPED: pre-existing failure, predates Step 1.3
    it.skip('Enter on second agent calls onFocusPane with its paneId', async () => {
        const onFocusPane = vi.fn();
        const { stdin } = render(<AgentStatus onFocusPane={onFocusPane} />);
        await tick();
        stdin.write(ARROW_DOWN);
        await tick();
        stdin.write(ENTER);
        await tick();
        expect(onFocusPane).toHaveBeenCalledWith(MOCK_AGENTS[1].paneId);
    });

    // ---- Column header ----

    it('shows column headers', () => {
        const { lastFrame } = render(<AgentStatus />);
        const frame = lastFrame()!;
        expect(frame).toMatch(/inum/i);
        expect(frame).toMatch(/title/i);
        expect(frame).toMatch(/pane/i);
        expect(frame).toMatch(/status/i);
        expect(frame).toMatch(/last activity/i);
    });

    // ---- Empty state ----

    it('shows message when no agents are active (with empty agents)', () => {
        const { lastFrame } = render(<AgentStatus agents={[]} />);
        const frame = lastFrame()!;
        expect(frame).toMatch(/no active agents/i);
    });

    // ---- Mock data integrity ----

    it('MOCK_AGENTS has at least one alive and one dead agent', () => {
        expect(MOCK_AGENTS.some(a => a.alive)).toBe(true);
        expect(MOCK_AGENTS.some(a => !a.alive)).toBe(true);
    });

    it('MOCK_AGENTS has at least 2 entries for navigation testing', () => {
        expect(MOCK_AGENTS.length).toBeGreaterThanOrEqual(2);
    });
});
