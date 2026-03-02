import type { QuestionStatus } from '../types.js';

export function statusToColor(status: QuestionStatus): string | undefined {
    switch (status) {
        case 'Active': return 'green';
        case 'Awaiting': return 'blue';
        case 'Deferred': return 'yellow';
        case 'User_Deferred': return 'yellow';
        case 'Resolved': return 'gray';
        default: return undefined;
    }
}
