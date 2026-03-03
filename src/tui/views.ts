export type ViewType = 'Dashboard' | 'Detail' | 'NewIssue' | 'AgentStatus' | 'BlockingMap' | 'GroupView';

export type View =
    | { type: 'Dashboard' }
    | { type: 'Detail'; inum: number }
    | { type: 'NewIssue' }
    | { type: 'AgentStatus' }
    | { type: 'BlockingMap' }
    | { type: 'GroupView' };
