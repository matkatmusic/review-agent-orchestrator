import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './app.js';

const ESC = '\x1b';

// useInput registers via useEffect — need a microtask tick before stdin.write
const tick = () => new Promise(r => setTimeout(r, 0));

describe('App — view routing', () => {
    // ---- Rendering ----

    it('renders without crash', () => {
        const { lastFrame } = render(<App />);
        expect(lastFrame()).toBeDefined();
    });

    it('default view is Dashboard', () => {
        const { lastFrame } = render(<App />);
        expect(lastFrame()).toContain('Dashboard');
    });

    // ---- Navigation via navigate prop ----

    it('navigate() pushes a new view onto the stack', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        // Press 'S' to navigate to AgentStatus (mapped shortcut)
        stdin.write('s');
        await tick();
        expect(lastFrame()).toContain('Agent Status');
    });

    it('Esc pops the stack and returns to previous view', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        // Navigate to AgentStatus
        stdin.write('s');
        await tick();
        expect(lastFrame()).toContain('Agent Status');
        // Press Esc to go back
        stdin.write(ESC);
        await tick();
        expect(lastFrame()).toContain('Dashboard');
    });

    it('Esc on Dashboard does nothing (cannot pop past root)', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        const frameBefore = lastFrame();
        stdin.write(ESC);
        await tick();
        expect(lastFrame()).toContain('Dashboard');
        expect(lastFrame()).toBe(frameBefore);
    });

    it('q triggers app exit', async () => {
        const onExit = vi.fn();
        const { stdin } = render(<App onExit={onExit} />);
        await tick();
        stdin.write('q');
        await tick();
        expect(onExit).toHaveBeenCalledOnce();
    });

    // ---- Deep navigation ----

    it('deep navigation: Dashboard → AgentStatus → back → Dashboard', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        expect(lastFrame()).toContain('Dashboard');

        stdin.write('s');
        await tick();
        expect(lastFrame()).toContain('Agent Status');

        stdin.write(ESC);
        await tick();
        expect(lastFrame()).toContain('Dashboard');
    });

    it('multi-level deep navigation with Esc unwind', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();

        // Dashboard → AgentStatus
        stdin.write('s');
        await tick();
        expect(lastFrame()).toContain('Agent Status');

        // AgentStatus → BlockingMap
        stdin.write('b');
        await tick();
        expect(lastFrame()).toContain('Blocking Map');

        // Back to AgentStatus
        stdin.write(ESC);
        await tick();
        expect(lastFrame()).toContain('Agent Status');

        // Back to Dashboard
        stdin.write(ESC);
        await tick();
        expect(lastFrame()).toContain('Dashboard');
    });

    // ---- All 6 view types navigable ----

    it('can navigate to Detail view', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        // Press 'v' with inum 1 to navigate to Detail (simulated via shortcut)
        stdin.write('v');
        await tick();
        expect(lastFrame()).toContain('Detail');
    });

    it('can navigate to NewIssue view', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        stdin.write('n');
        await tick();
        expect(lastFrame()).toContain('New Issue');
    });

    it('can navigate to AgentStatus view', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        stdin.write('s');
        await tick();
        expect(lastFrame()).toContain('Agent Status');
    });

    it('can navigate to BlockingMap view', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        stdin.write('b');
        await tick();
        expect(lastFrame()).toContain('Blocking Map');
    });

    it('can navigate to GroupView', async () => {
        const { lastFrame, stdin } = render(<App />);
        await tick();
        stdin.write('g');
        await tick();
        expect(lastFrame()).toContain('Group View');
    });

    // ---- q works from non-Dashboard views ----

    it('q exits from any view, not just Dashboard', async () => {
        const onExit = vi.fn();
        const { lastFrame, stdin } = render(<App onExit={onExit} />);
        await tick();
        stdin.write('s');
        await tick();
        expect(lastFrame()).toContain('Agent Status');
        stdin.write('q');
        await tick();
        expect(onExit).toHaveBeenCalledOnce();
    });
});
