export enum ViewType {
    Dashboard,
    Detail,
    NewIssue,
    AgentStatus,
    BlockingMap,
    GroupView,
}

export const ViewTypeStringsMap = new Map<ViewType, string>([
    [ViewType.Dashboard, "Dashboard"],
    [ViewType.Detail, "Detail"],
    [ViewType.NewIssue, "New Issue"],
    [ViewType.AgentStatus, "Agent Status"],
    [ViewType.BlockingMap, "Blocking Map"],
    [ViewType.GroupView, "Group View"],
]);

export type View =
    | { type: ViewType.Dashboard }
    | { type: ViewType.Detail; inum: number }
    | { type: ViewType.NewIssue }
    | { type: ViewType.AgentStatus }
    | { type: ViewType.BlockingMap }
    | { type: ViewType.GroupView };
