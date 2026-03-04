
/**
 * The list of possible statuses that an issue can have
 */

export enum IssueStatus {
  Active,
  Awaiting,
  Blocked,
  Deferred,
  Resolved
}

export const IssueStatusStringsMap = new Map<IssueStatus, string>([
  [IssueStatus.Active, "Active"],
  [IssueStatus.Awaiting, "Awaiting"],
  [IssueStatus.Blocked, "Blocked"],
  [IssueStatus.Deferred, "Deferred"],
  [IssueStatus.Resolved, "Resolved"],
]);

export interface Issue {
    inum: number;
    title: string;
    description: string;
    status: IssueStatus;
    created_at: string;
    resolved_at: string | null;
    issue_revision: number;
    agent_last_read_at: string | null;
    user_last_viewed_at: string | null;
}

export interface Response {
    id: number;
    inum: number;
    author: 'user' | 'agent';
    body: string;
    created_at: string;
}

export interface Dependency {
    blocker_inum: number;
    blocked_inum: number;
}

export type ContainerType = 'group' | 'sprint';
export type ContainerStatus = 'Open' | 'Closed';

export interface Container {
    id: number;
    name: string;
    type: ContainerType;
    parent_id: number | null;
    description: string;
    status: ContainerStatus;
    created_at: string;
    closed_at: string | null;
}

export interface IssueContainer {
    inum: number;
    container_id: number;
    sort_order: number | null;
}

export interface AgentSession {
    inum: number;
    pane_id: string;
    head_commit: string;
    created_at: string;
}

export interface Config {
    maxAgents: number;
    tmuxSession: string;
    scanInterval: number;
    terminalApp: string;
    agentPrompt: string;
    codeRoot: string;
    teardownTimeout: number;
}
