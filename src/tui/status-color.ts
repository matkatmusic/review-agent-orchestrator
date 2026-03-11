import { IssueStatus } from '../types.js';

export function statusToColor(status: IssueStatus): string | undefined {
    switch (status) {
        case IssueStatus.Active: return 'green';
        case IssueStatus.InQueue: return 'blue';
        case IssueStatus.Blocked: return 'red';
        case IssueStatus.Deferred: return 'yellow';
        case IssueStatus.Resolved: return 'gray';
        case IssueStatus.Trashed: return 'gray';
        case IssueStatus.Inactive: return 'gray';
        default: return undefined;
    }
}
