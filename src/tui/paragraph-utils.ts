/**
 * Split a message body into paragraphs, respecting code fences.
 * Paragraphs are separated by blank lines, but blank lines inside
 * code fences (``` blocks) do not cause splits.
 */
export function splitIntoParagraphs(body: string): string[] {
    const lines = body.split('\n');
    const paragraphs: string[] = [];
    let current: string[] = [];
    let inCodeFence = false;

    for (const line of lines) {
        // Track code fence state
        if (/^\s*```/.test(line)) {
            inCodeFence = !inCodeFence;
        }

        if (!inCodeFence && line.trim() === '') {
            // Blank line outside code fence — flush current paragraph
            if (current.length > 0) {
                paragraphs.push(current.join('\n'));
                current = [];
            }
        } else {
            current.push(line);
        }
    }

    // Flush remaining
    if (current.length > 0) {
        paragraphs.push(current.join('\n'));
    }

    return paragraphs;
}
