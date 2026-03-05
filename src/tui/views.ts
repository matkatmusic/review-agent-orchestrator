export enum ViewType {
    Dashboard,
    Detail,
    NewIssue,
    AgentStatus,
    BlockingMap,
    GroupView,
    Thread,
}

export const ViewTypeStringsMap = new Map<ViewType, string>([
    [ViewType.Dashboard, "Dashboard"],
    [ViewType.Detail, "Detail"],
    [ViewType.NewIssue, "New Issue"],
    [ViewType.AgentStatus, "Agent Status"],
    [ViewType.BlockingMap, "Blocking Map"],
    [ViewType.GroupView, "Group View"],
    [ViewType.Thread, "Thread"],
]);

export type View =
    | { type: ViewType.Dashboard }
    | { type: ViewType.Detail; inum: number }
    | { type: ViewType.NewIssue }
    | { type: ViewType.AgentStatus }
    | { type: ViewType.BlockingMap }
    | { type: ViewType.GroupView }
    | { type: ViewType.Thread; inum: number; rootResponseId: number };
