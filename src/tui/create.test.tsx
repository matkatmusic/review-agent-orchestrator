import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { NewIssue } from './create.js';

const TAB = '\t';
const SHIFT_TAB = '\x1b[Z';
const ENTER = '\r';
const ESC = '\x1b';

// useInput registers via useEffect — need a microtask tick before stdin.write
const tick = () => new Promise(r => setTimeout(r, 0));

export interface NewIssueData {
    title: string;
    description: string;
    group: string;
    blockedBy: string;
}

describe('NewIssue — rendering', () => {
    it('renders without crash', () => {
        const { lastFrame } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        expect(lastFrame()).toBeDefined();
    });

    it('displays all four field labels', () => {
        const { lastFrame } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        const frame = lastFrame()!;
        expect(frame).toContain('Title');
        expect(frame).toContain('Description');
        expect(frame).toContain('Group');
        expect(frame).toContain('Blocked by');
    });

    it('shows cursor indicator on first field (Title)', () => {
        const { lastFrame } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        // The active field should have a visual indicator (▸ or >)
        const titleLine = lines.find(l => l.includes('Title'));
        expect(titleLine).toBeDefined();
        expect(titleLine).toMatch(/[▸>]/);
    });

    // Footer shortcuts are rendered centrally by App-level Footer component
    // and tested in footer.test.tsx
});

describe('NewIssue — field navigation', () => {
    it('Tab moves to next field', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Initially on Title
        expect(lastFrame()).toMatch(/[▸>].*Title/);

        stdin.write(TAB);
        await tick();

        // Now on Description
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const descLine = lines.find(l => l.includes('Description'));
        expect(descLine).toMatch(/[▸>]/);
    });

    it('Shift+Tab moves to previous field', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Move to Description
        stdin.write(TAB);
        await tick();

        // Move back to Title
        stdin.write(SHIFT_TAB);
        await tick();

        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const titleLine = lines.find(l => l.includes('Title'));
        expect(titleLine).toMatch(/[▸>]/);
    });

    it('Tab wraps from last field to first', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Tab through all 4 fields: Title → Description → Group → Blocked by → Title
        stdin.write(TAB);
        await tick();
        stdin.write(TAB);
        await tick();
        stdin.write(TAB);
        await tick();
        stdin.write(TAB);
        await tick();

        // Should wrap back to Title
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const titleLine = lines.find(l => l.includes('Title'));
        expect(titleLine).toMatch(/[▸>]/);
    });

    it('Shift+Tab wraps from first field to last', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Shift+Tab from Title should wrap to Blocked by
        stdin.write(SHIFT_TAB);
        await tick();

        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const blockedLine = lines.find(l => l.includes('Blocked by'));
        expect(blockedLine).toMatch(/[▸>]/);
    });
});

describe('NewIssue — text input', () => {
    it('typing updates the active field value', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Type into Title field
        stdin.write('Fix login bug');
        await tick();

        expect(lastFrame()).toContain('Fix login bug');
    });

    it('each field holds its own value', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Type into Title
        stdin.write('My Title');
        await tick();

        // Tab to Description
        stdin.write(TAB);
        await tick();

        // Type into Description
        stdin.write('Some description');
        await tick();

        const frame = lastFrame()!;
        expect(frame).toContain('My Title');
        expect(frame).toContain('Some description');
    });
});

describe('NewIssue — form submission', () => {
    it('Enter submits form data via onCreated callback', async () => {
        const onCreated = vi.fn();
        const { stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        // Fill Title
        stdin.write('Bug fix');
        await tick();

        // Tab to Description
        stdin.write(TAB);
        await tick();

        // Fill Description
        stdin.write('Fix the login');
        await tick();

        // Submit
        stdin.write(ENTER);
        await tick();

        expect(onCreated).toHaveBeenCalledOnce();
        expect(onCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Bug fix',
                description: 'Fix the login',
            })
        );
    });

    it('submitted data includes group when provided', async () => {
        const onCreated = vi.fn();
        const { stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        // Fill Title
        stdin.write('Task');
        await tick();
        stdin.write(TAB);
        await tick();

        // Fill Description
        stdin.write('Details');
        await tick();
        stdin.write(TAB);
        await tick();

        // Fill Group
        stdin.write('backend');
        await tick();

        // Submit
        stdin.write(ENTER);
        await tick();

        expect(onCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Task',
                description: 'Details',
                group: 'backend',
            })
        );
    });

    it('submitted data includes blockedBy when provided', async () => {
        const onCreated = vi.fn();
        const { stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        // Fill Title
        stdin.write('Task');
        await tick();
        stdin.write(TAB);
        await tick();

        // Fill Description
        stdin.write('Details');
        await tick();
        stdin.write(TAB);
        await tick();

        // Skip Group
        stdin.write(TAB);
        await tick();

        // Fill Blocked by
        stdin.write('1,3,5');
        await tick();

        // Submit
        stdin.write(ENTER);
        await tick();

        expect(onCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                blockedBy: '1,3,5',
            })
        );
    });

    it('trims whitespace from title and description', async () => {
        const onCreated = vi.fn();
        const { stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        stdin.write('  My Title  ');
        await tick();
        stdin.write(TAB);
        await tick();
        stdin.write('  My Description  ');
        await tick();
        stdin.write(ENTER);
        await tick();

        expect(onCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'My Title',
                description: 'My Description',
            })
        );
    });
});

describe('NewIssue — validation', () => {
    it('shows error when title is empty on submit', async () => {
        const onCreated = vi.fn();
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        // Try to submit without filling title
        stdin.write(ENTER);
        await tick();

        expect(onCreated).not.toHaveBeenCalled();
        expect(lastFrame()).toContain('Title is required');
    });

    it('shows error when description is empty on submit', async () => {
        const onCreated = vi.fn();
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        // Fill title only
        stdin.write('My Title');
        await tick();

        // Submit
        stdin.write(ENTER);
        await tick();

        expect(onCreated).not.toHaveBeenCalled();
        expect(lastFrame()).toContain('Description is required');
    });

    it('error clears when navigating to another field', async () => {
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={vi.fn()} />
        );
        await tick();

        // Submit empty — triggers error
        stdin.write(ENTER);
        await tick();
        expect(lastFrame()).toContain('Title is required');

        // Tab to next field — error should clear
        stdin.write(TAB);
        await tick();

        expect(lastFrame()).not.toContain('Title is required');
    });

    it('invalid blocker format shows error', async () => {
        const onCreated = vi.fn();
        const { lastFrame, stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        // Fill required fields
        stdin.write('Title');
        await tick();
        stdin.write(TAB);
        await tick();
        stdin.write('Description');
        await tick();
        stdin.write(TAB);
        await tick();

        // Skip Group
        stdin.write(TAB);
        await tick();

        // Type invalid blocker
        stdin.write('abc');
        await tick();

        stdin.write(ENTER);
        await tick();

        expect(onCreated).not.toHaveBeenCalled();
        expect(lastFrame()).toMatch(/invalid|blocker/i);
    });
});

describe('NewIssue — cancel', () => {
    it('Esc calls onCancel callback', async () => {
        const onCancel = vi.fn();
        const { stdin } = render(
            <NewIssue onCreated={vi.fn()} onCancel={onCancel} />
        );
        await tick();

        stdin.write(ESC);
        await tick();

        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('Esc does not submit form data', async () => {
        const onCreated = vi.fn();
        const { stdin } = render(
            <NewIssue onCreated={onCreated} onCancel={vi.fn()} />
        );
        await tick();

        stdin.write('some title');
        await tick();

        stdin.write(ESC);
        await tick();

        expect(onCreated).not.toHaveBeenCalled();
    });
});
