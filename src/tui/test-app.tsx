import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { AppWrapper } from './run.js';
import { TEST_KEYS, type TestKeyName } from './test-keys.js';

export const tick = () => new Promise(r => setTimeout(r, 0));
export const settle = () => new Promise(r => setTimeout(r, 50));

export interface CreateTestAppOptions {
    columns?: number;  // documentary only — ink-testing-library hardcodes stdout.columns=100
    rows?: number;     // documentary only — AppWrapper falls back to 24
}

export interface TestApp {
    press(...keys: string[]): Promise<void>;
    frame(): string;
    rawFrame(): string;
    cleanup(): void;
    stdin: ReturnType<typeof render>['stdin'];
}

export function createTestApp(createTestAppOptions: CreateTestAppOptions = {}): TestApp {
    const instance = render(<AppWrapper />);

    async function press(...keys: string[]): Promise<void> {
        for (const key of keys) {
            const upper = key.toUpperCase() as TestKeyName;
            const bytes = TEST_KEYS[upper];
            if (bytes !== undefined) {
                instance.stdin.write(bytes);
            } else {
                instance.stdin.write(key);
            }
            await tick();
        }
    }

    function frame(): string {
        return stripAnsi(instance.lastFrame()!);
    }

    function rawFrame(): string {
        return instance.lastFrame()!;
    }

    function cleanup(): void {
        instance.unmount();
    }

    return {
        press,
        frame,
        rawFrame,
        cleanup,
        stdin: instance.stdin,
    };
}
