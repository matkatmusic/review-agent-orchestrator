import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { Text } from 'ink';
import { useInput } from 'ink';
import { renderApp, tick } from './test-helpers.js';

describe('Test Harness (Step 0.2)', () => {
    it('renderApp returns a frame', () => {
        const { lastFrame } = renderApp(<Text>hello</Text>);
        expect(lastFrame()).toContain('hello');
    });

    it('stdin.write sends input', async () => {
        const received = vi.fn();

        function Capture() {
            useInput((input) => {
                received(input);
            });
            return <Text>waiting</Text>;
        }

        const { stdin } = renderApp(<Capture />);
        await tick();
        stdin.write('x');
        await tick();
        expect(received).toHaveBeenCalledWith('x');
    });
});
