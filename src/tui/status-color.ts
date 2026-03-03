import type { IssueStatus } from '../types.js';

export function statusToColor(status: IssueStatus): string | undefined {
    switch (status) {
        case 'Active': return 'green';
        case 'Awaiting': return 'blue';
        case 'Blocked': return 'red';
        case 'Deferred': return 'yellow';
        case 'Resolved': return 'gray';
        default: return undefined;
    }
}
