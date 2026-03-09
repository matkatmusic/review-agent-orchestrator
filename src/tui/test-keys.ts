export const TEST_KEYS = {
    ENTER:            '\r',
    ESC:              '\x1b',
    TAB:              '\t',
    SHIFT_TAB:        '\x1b[Z',
    UP:               '\x1b[A',
    DOWN:             '\x1b[B',
    LEFT:             '\x1b[D',
    RIGHT:            '\x1b[C',
    CTRL_R:           '\x12',
    ALT_Q:            '\x1bq',
    ALT_H:            '\x1bh',
    CTRL_SHIFT_RIGHT: '\x1b[1;6C',
    CTRL_SHIFT_LEFT:  '\x1b[1;6D',
    SHIFT_RIGHT:      '\x1b[1;2C',
    SHIFT_LEFT:       '\x1b[1;2D',
    CTRL_ALT_Q:       '\x1b[113;7u',
    CTRL_ALT_R:       '\x1b[114;7u',
} as const;

export type TestKeyName = keyof typeof TEST_KEYS;
