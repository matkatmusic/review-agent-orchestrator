import { IssueStatus, type Issue } from '../types.js';
import { statusToColor } from './status-color.js';

export function getStatus(issue: Issue, allIssues: Issue[]): IssueStatus {
    for (const blockerInum of issue.blocked_by) {
        const blocker = allIssues.find(i => i.inum === blockerInum);
        if (blocker && blocker.status !== IssueStatus.Resolved && blocker.status !== IssueStatus.Trashed) {
            return IssueStatus.Blocked;
        }
    }
    return issue.status;
}

export function getColorForStatus(issue: Issue, allIssues: Issue[]): string | undefined {
    const status = getStatus(issue, allIssues);
    return statusToColor(status);
}
