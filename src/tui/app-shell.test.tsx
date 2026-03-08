import { describe, it, expect } from 'vitest';
import React, { useEffect } from 'react';
import { render } from 'ink-testing-library';
import { Box, renderToString, Text } from 'ink';
import stripAnsi from 'strip-ansi';
import { AppShell } from './app-shell.js';
import { ViewType } from './views.js';
import { HEADER_LINES } from './header.js';
import { computeFooterLines, getFooterShortcuts } from './footer.js';
import type { FooterOptions } from './footer.js';

const cols = 80;
const rows = 24;
const homeView = { type: ViewType.Home as const };

describe('AppShell', () => {

    // ---- Test 1: renders header, content, footer vertically ----

    it.skip('renders header, content, footer vertically', () => {
        const { lastFrame } = render(
            <AppShell columns={cols} rows={rows} currentView={homeView}>
                {(_setFooterOptions, _setFooterShortcuts) => <Text>CONTENT</Text>}
            </AppShell>
        );
        const output = lastFrame()!;
        const plain = stripAnsi(output);

        // Header title present
        expect(plain).toContain('Review Agent Orchestrator');
        // Content present
        expect(plain).toContain('CONTENT');
        // Footer shortcuts present (Home view has [Enter] View, etc.)
        expect(plain).toContain('View');
        expect(plain).toContain('Quit');

        // Vertical ordering: header above content above footer
        expect(plain.indexOf('Review Agent Orchestrator')).toBeLessThan(plain.indexOf('CONTENT'));
        expect(plain.indexOf('CONTENT')).toBeLessThan(plain.indexOf('Quit'));
    });

    // ---- Test 2: constrains height to rows prop ----

    it('constrains height to rows prop', () => {
        const testRows = 24;
        const output = renderToString(
            <AppShell columns={cols} rows={testRows} currentView={homeView}>
                {(_setFooterOptions, _setFooterShortcuts) => <Text>BODY</Text>}
            </AppShell>,
            { columns: cols },
        );
        // The outer Box has height={rows}, so the rendered output should
        // have exactly `rows` lines (Ink pads flexDirection="column" boxes
        // to their height).
        const lines = output.split('\n');
        expect(lines).toHaveLength(testRows);
    });

    // ---- Test 3: content area gets remaining height after header and footer ----

    it('content area gets remaining height after header and footer', () => {
        const testCols = 200;
        const testRows = 12;
        const footerLines = computeFooterLines(
            getFooterShortcuts(ViewType.Home),
            testCols,
        );
        const expectedContentHeight = testRows - HEADER_LINES - footerLines;

        // Render exactly expectedContentHeight lines — all should be visible
        const output = renderToString(
            <AppShell columns={testCols} rows={testRows} currentView={homeView}>
                {(_setFooterOptions, _setFooterShortcuts) => (
                    <Box flexDirection="column">
                        {Array.from({ length: expectedContentHeight }, (_, i) => (
                            <Text key={i}>{`LINE ${i + 1}`}</Text>
                        ))}
                    </Box>
                )}
            </AppShell>,
            { columns: testCols },
        );

        const plain = stripAnsi(output);
        // Total output is exactly testRows lines
        expect(output.split('\n')).toHaveLength(testRows);
        // Content height is positive and correct
        expect(expectedContentHeight).toBeGreaterThan(0);
        expect(expectedContentHeight).toBe(testRows - HEADER_LINES - footerLines);
        // All content lines visible (no content was clipped)
        for (let i = 1; i <= expectedContentHeight; i++) {
            expect(plain).toContain(`LINE ${i}`);
        }
    });

    // ---- Test 4: resize updates dimensions ----

    it('resize updates dimensions when re-rendered with different columns/rows', () => {
        const { lastFrame, rerender } = render(
            <AppShell columns={80} rows={24} currentView={homeView}>
                {(_setFooterOptions, _setFooterShortcuts) => <Text>BODY</Text>}
            </AppShell>
        );

        const frame1 = lastFrame()!;

        // Re-render with new dimensions
        rerender(
            <AppShell columns={120} rows={30} currentView={homeView}>
                {(_setFooterOptions, _setFooterShortcuts) => <Text>BODY</Text>}
            </AppShell>
        );

        const frame2 = lastFrame()!;

        // The frames should differ because the layout dimensions changed
        // (different height => different line count, different columns => different header rule width)
        expect(frame2).not.toBe(frame1);

        // The new frame should have 30 lines
        const lines2 = frame2.split('\n');
        expect(lines2).toHaveLength(30);
    });

    // ---- Test 5: setFooterOptions state reaches Footer props ----

    it('setFooterOptions state reaches Footer props', async () => {
        // Create a child component that calls setFooterOptions on mount
        const ChildThatSetsOptions: React.FC<{ setFooterOptions: (opts: FooterOptions) => void }> = ({ setFooterOptions }) => {
            useEffect(() => {
                setFooterOptions({ inThread: true });
            }, []);
            return <Text>THREAD CONTENT</Text>;
        };

        // Use wide columns to avoid line wrapping splitting shortcut labels
        const wideCols = 200;
        const { lastFrame } = render(
            <AppShell
                columns={wideCols}
                rows={24}
                currentView={{ type: ViewType.Detail, inum: 1 }}
            >
                {(setFooterOptions, _setFooterShortcuts) => <ChildThatSetsOptions setFooterOptions={setFooterOptions} />}
            </AppShell>
        );

        // Wait for useEffect to fire and the state update to propagate
        await new Promise(resolve => setTimeout(resolve, 50));

        const output = lastFrame()!;
        const plain = stripAnsi(output);

        // When inThread is true on a Detail view, Footer renders THREAD_SHORTCUTS
        // which includes "Sub-thread" (unique to thread mode, default Detail has "Thread").
        // Also verify default Detail-only shortcuts like "Defer" and "Show pane" are absent.
        // Thread-mode shortcuts present
        expect(plain).toContain('Sub-thread');
        // "Exit thread" label may wrap across lines — check key is present
        expect(plain).toContain('Ctl Shft <-');
        // Default Detail-only shortcuts absent in thread mode
        expect(plain).not.toContain('Defer');
        expect(plain).not.toContain('Show pane');
    });
});
