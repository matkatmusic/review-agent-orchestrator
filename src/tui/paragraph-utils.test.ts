import { describe, it, expect } from 'vitest';
import { splitIntoParagraphs } from './paragraph-utils.js';

describe('splitIntoParagraphs', () => {
    it('returns single paragraph when no blank lines', () => {
        expect(splitIntoParagraphs('Hello world')).toEqual(['Hello world']);
    });

    it('splits two paragraphs on blank line', () => {
        const result = splitIntoParagraphs('First paragraph.\n\nSecond paragraph.');
        expect(result).toEqual(['First paragraph.', 'Second paragraph.']);
    });

    it('does not split inside code fences', () => {
        const body = 'Before code.\n\n```\nline 1\n\nline 2\n```\n\nAfter code.';
        const result = splitIntoParagraphs(body);
        expect(result).toEqual([
            'Before code.',
            '```\nline 1\n\nline 2\n```',
            'After code.',
        ]);
    });

    it('handles code fence with language tag', () => {
        const body = 'Intro.\n\n```typescript\nconst x = 1;\n\nconst y = 2;\n```';
        const result = splitIntoParagraphs(body);
        expect(result).toEqual([
            'Intro.',
            '```typescript\nconst x = 1;\n\nconst y = 2;\n```',
        ]);
    });

    it('handles mixed prose and code blocks', () => {
        const body = 'Para 1.\n\n```\ncode\n```\n\nPara 2.\n\n```\nmore code\n```';
        const result = splitIntoParagraphs(body);
        expect(result).toEqual([
            'Para 1.',
            '```\ncode\n```',
            'Para 2.',
            '```\nmore code\n```',
        ]);
    });

    it('returns empty array for empty body', () => {
        expect(splitIntoParagraphs('')).toEqual([]);
    });

    it('returns empty array for whitespace-only body', () => {
        expect(splitIntoParagraphs('   \n  \n   ')).toEqual([]);
    });

    it('collapses multiple blank lines between paragraphs', () => {
        const result = splitIntoParagraphs('First.\n\n\n\nSecond.');
        expect(result).toEqual(['First.', 'Second.']);
    });

    it('handles three paragraphs', () => {
        const result = splitIntoParagraphs('One.\n\nTwo.\n\nThree.');
        expect(result).toEqual(['One.', 'Two.', 'Three.']);
    });

    it('preserves internal newlines within a paragraph', () => {
        const body = 'Line 1\nLine 2\nLine 3\n\nNext paragraph.';
        const result = splitIntoParagraphs(body);
        expect(result).toEqual(['Line 1\nLine 2\nLine 3', 'Next paragraph.']);
    });
});
