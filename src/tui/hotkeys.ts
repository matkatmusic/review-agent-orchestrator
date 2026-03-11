import type { Key } from 'ink';

export enum Ink_keyofKeys_Choices {
    /**
     * Ink keys first
     */
    UP_ARROW,
    DOWN_ARROW,
    LEFT_ARROW,
    RIGHT_ARROW,
    PAGE_DOWN,
    PAGE_UP,
    RETURN,
    ESCAPE,
    CONTROL,
    SHIFT,
    TAB,
    BACKSPACE,
    DELETE,
    META_ALT,
}

const HotKeys_keyofKey_Map = new Map<Ink_keyofKeys_Choices, keyof Key>([
    [Ink_keyofKeys_Choices.UP_ARROW, 'upArrow'],
    [Ink_keyofKeys_Choices.DOWN_ARROW, 'downArrow'],
    [Ink_keyofKeys_Choices.LEFT_ARROW, 'leftArrow'],
    [Ink_keyofKeys_Choices.RIGHT_ARROW, 'rightArrow'],
    [Ink_keyofKeys_Choices.PAGE_DOWN, 'pageDown'],
    [Ink_keyofKeys_Choices.PAGE_UP, 'pageUp'],
    [Ink_keyofKeys_Choices.RETURN, 'return'],
    [Ink_keyofKeys_Choices.ESCAPE, 'escape'],
    [Ink_keyofKeys_Choices.CONTROL, 'ctrl'],
    [Ink_keyofKeys_Choices.SHIFT, 'shift'],
    [Ink_keyofKeys_Choices.TAB, 'tab'],
    [Ink_keyofKeys_Choices.BACKSPACE, 'backspace'],
    [Ink_keyofKeys_Choices.DELETE, 'delete'],
    [Ink_keyofKeys_Choices.META_ALT, 'meta'],
]);

export const InkKeyOfKeysStringMap = new Map<Ink_keyofKeys_Choices, string>([
    [Ink_keyofKeys_Choices.UP_ARROW, '\u2191'],
    [Ink_keyofKeys_Choices.DOWN_ARROW, '\u2193'],
    [Ink_keyofKeys_Choices.LEFT_ARROW, '<-'],
    [Ink_keyofKeys_Choices.RIGHT_ARROW, '->'],
    [Ink_keyofKeys_Choices.PAGE_DOWN, 'PgDn'],
    [Ink_keyofKeys_Choices.PAGE_UP, 'PgUp'],
    [Ink_keyofKeys_Choices.RETURN, 'Enter'],
    [Ink_keyofKeys_Choices.ESCAPE, 'Esc'],
    [Ink_keyofKeys_Choices.CONTROL, 'Ctl'],
    [Ink_keyofKeys_Choices.SHIFT, 'Shft'],
    [Ink_keyofKeys_Choices.TAB, 'Tab'],
    [Ink_keyofKeys_Choices.BACKSPACE, 'bksp'],
    [Ink_keyofKeys_Choices.DELETE, 'Del'],
    [Ink_keyofKeys_Choices.META_ALT, 'Alt'],
]);

export enum KeyCombinations {
    /**
     * Combo keys
     */
    CTRL_SHIFT_LEFT_ARROW,
    CTRL_SHIFT_RIGHT_ARROW,
    CTRL_R,
    SHIFT_D,
    ALT_H,
    ALT_Q,
    CTRL_ALT_Q,
    CTRL_ALT_R,
    SCROLL_UP_DOWN
}

export function getHotKeyLabel(keyCombo: KeyCombinations): string {
    switch (keyCombo) {
        case KeyCombinations.CTRL_SHIFT_LEFT_ARROW:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.CONTROL)! + ' ' + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.SHIFT)! + ' ' + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.LEFT_ARROW)!;
        case KeyCombinations.CTRL_SHIFT_RIGHT_ARROW:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.CONTROL)! + ' ' + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.SHIFT)! + ' ' + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.RIGHT_ARROW)!;
        case KeyCombinations.CTRL_R:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.CONTROL)! + ' ' + 'r';
        case KeyCombinations.SHIFT_D:
            return 'D';
        case KeyCombinations.ALT_H:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.META_ALT)! + ' ' + 'h';
        case KeyCombinations.ALT_Q:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.META_ALT)! + ' ' + 'q';
        case KeyCombinations.CTRL_ALT_Q:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.CONTROL)! + ' ' + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.META_ALT)! + ' ' + 'q';
        case KeyCombinations.CTRL_ALT_R:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.CONTROL)! + ' ' + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.META_ALT)! + ' ' + 'r';
        case KeyCombinations.SCROLL_UP_DOWN:
            return InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.UP_ARROW)! + InkKeyOfKeysStringMap.get(Ink_keyofKeys_Choices.DOWN_ARROW)!;
        default:
            throw new Error("HOT KEY NOT SET");
    }
}

export function matchesKey(key: Key, inkKey: Ink_keyofKeys_Choices): boolean {
    return key[HotKeys_keyofKey_Map.get(inkKey)!] === true;
}

export function matchesKeyCombination(keyCombo: KeyCombinations, input: string, key: Key): boolean {
    switch (keyCombo) {
        case KeyCombinations.CTRL_SHIFT_LEFT_ARROW:
            return matchesKey(key, Ink_keyofKeys_Choices.CONTROL)
                && matchesKey(key, Ink_keyofKeys_Choices.SHIFT)
                && matchesKey(key, Ink_keyofKeys_Choices.LEFT_ARROW);
        case KeyCombinations.CTRL_SHIFT_RIGHT_ARROW:
            return matchesKey(key, Ink_keyofKeys_Choices.CONTROL)
                && matchesKey(key, Ink_keyofKeys_Choices.SHIFT)
                && matchesKey(key, Ink_keyofKeys_Choices.RIGHT_ARROW);
        case KeyCombinations.CTRL_R:
            return matchesKey(key, Ink_keyofKeys_Choices.CONTROL)
                && !matchesKey(key, Ink_keyofKeys_Choices.SHIFT)
                && input === 'r';
        case KeyCombinations.SHIFT_D:
            return input === 'D';
        case KeyCombinations.ALT_H:
            return (matchesKey(key, Ink_keyofKeys_Choices.META_ALT) && input === 'h')
                || input === '\u02D9';
        case KeyCombinations.ALT_Q:
            return matchesKey(key, Ink_keyofKeys_Choices.META_ALT) && input === 'q';
        case KeyCombinations.CTRL_ALT_Q:
            return matchesKey(key, Ink_keyofKeys_Choices.CONTROL)
                && matchesKey(key, Ink_keyofKeys_Choices.META_ALT)
                && input === 'q';
        case KeyCombinations.CTRL_ALT_R:
            return matchesKey(key, Ink_keyofKeys_Choices.CONTROL)
                && matchesKey(key, Ink_keyofKeys_Choices.META_ALT)
                && input === 'r';
        case KeyCombinations.SCROLL_UP_DOWN:
            return matchesKey(key, Ink_keyofKeys_Choices.UP_ARROW)
                || matchesKey(key, Ink_keyofKeys_Choices.DOWN_ARROW);
        default:
            throw new Error("HOT KEY NOT SET");
    }
}
