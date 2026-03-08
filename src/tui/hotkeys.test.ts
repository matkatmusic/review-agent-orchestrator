import { describe, it, expect } from 'vitest';
import type { Key } from 'ink';
import {
    KeyCombinations,
    matchesKeyCombination,
    getHotKeyLabel,
} from './hotkeys.js';

const emptyKey: Key = {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
};

function makeKey(overrides: Partial<Key>): Key {
    return { ...emptyKey, ...overrides };
}

describe('hotkeys — matchesKeyCombination', () => {
    it('ALT_Q matches meta + q', () => {
        expect(
            matchesKeyCombination(KeyCombinations.ALT_Q, 'q', makeKey({ meta: true })),
        ).toBe(true);
    });

    it('ALT_Q does not match plain q', () => {
        expect(
            matchesKeyCombination(KeyCombinations.ALT_Q, 'q', makeKey({})),
        ).toBe(false);
    });

    it('CTRL_ALT_Q matches ctrl + meta + q', () => {
        expect(
            matchesKeyCombination(KeyCombinations.CTRL_ALT_Q, 'q', makeKey({ ctrl: true, meta: true })),
        ).toBe(true);
    });

    it('CTRL_ALT_R matches ctrl + meta + r', () => {
        expect(
            matchesKeyCombination(KeyCombinations.CTRL_ALT_R, 'r', makeKey({ ctrl: true, meta: true })),
        ).toBe(true);
    });

    it('ALT_H matches unicode \u02D9', () => {
        expect(
            matchesKeyCombination(KeyCombinations.ALT_H, '\u02D9', makeKey({})),
        ).toBe(true);
    });
});

describe('hotkeys — getHotKeyLabel', () => {
    it('returns readable strings for all key combinations', () => {
        const allCombos = [
            KeyCombinations.CTRL_SHIFT_LEFT_ARROW,
            KeyCombinations.CTRL_SHIFT_RIGHT_ARROW,
            KeyCombinations.CTRL_R,
            KeyCombinations.ALT_H,
            KeyCombinations.ALT_Q,
            KeyCombinations.CTRL_ALT_Q,
            KeyCombinations.CTRL_ALT_R,
            KeyCombinations.SCROLL_UP_DOWN,
        ];
        for (const combo of allCombos) {
            const label = getHotKeyLabel(combo);
            expect(label.length).toBeGreaterThan(0);
            expect(typeof label).toBe('string');
        }
    });
});
