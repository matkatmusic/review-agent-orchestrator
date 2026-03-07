import React from 'react';
import { render } from 'ink-testing-library';

interface RenderAppOptions {
    columns?: number;
}

/**
 * Wraps ink-testing-library render() with controlled terminal dimensions.
 * Sets process.stdout.columns before rendering so Ink sees the desired width.
 */
export function renderApp(
    ui: React.ReactElement,
    options: RenderAppOptions = {},
): ReturnType<typeof render> {
    const { columns = 80 } = options;
    const prev = process.stdout.columns;
    process.stdout.columns = columns;
    const result = render(ui);
    process.stdout.columns = prev;
    return result;
}

/**
 * Wait for React effects to flush (useEffect, useInput registration, etc.).
 * Optional ms parameter for longer waits; defaults to a single macro-task.
 */
export const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms));
