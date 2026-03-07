import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.{ts,tsx}'],
        testTimeout: 10000,
        env: {
            FORCE_COLOR: 'true',
        },
    },
});
