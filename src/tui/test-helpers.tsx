import React from 'react';
import { render } from 'ink-testing-library';

/**
 * Shared test helpers for Ink TUI tests.
 *
 * renderApp — wraps ink-testing-library render() with controlled dimensions.
 * tick      — flushes async effects (useEffect / useInput registration).
 */

interface RenderAppOptions {
    columns?: number;
    rows?: number;
}

/**
 * Renders a React element through ink-testing-library with controllable
 * terminal dimensions via the COLUMNS environment variable.
 *
 * Returns the same object as ink-testing-library's render() — lastFrame,
 * frames, stdin, cleanup, etc.
 */
export function renderApp(
    ui: React.ReactElement,
    options: RenderAppOptions = {},
) {
    const { columns = 80 } = options;
    // ink-testing-library accepts columns to control virtual terminal width
    return render(ui, { columns });
}

/**
 * Wait for React effects to flush (useEffect, useInput registration, etc.).
 * Optional ms parameter for longer waits; defaults to a single macro-task.
 */
export const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms));
