export enum ViewType {
    Home,
    Detail,
    NewIssue,
    AgentStatus,
    BlockingMap,
    GroupView,
    IssuePicker,
}

export const ViewTypeStringsMap = new Map<ViewType, string>([
    [ViewType.Home, "Home"],
    [ViewType.Detail, "Detail"],
    [ViewType.NewIssue, "New Issue"],
    [ViewType.AgentStatus, "Agent Status"],
    [ViewType.BlockingMap, "Blocking Map"],
    [ViewType.GroupView, "Group View"],
    [ViewType.IssuePicker, "Issue Picker"],
]);

export type View =
    | { type: ViewType.Home }
    | { type: ViewType.Detail; inum: number }
    | { type: ViewType.NewIssue }
    | { type: ViewType.AgentStatus }
    | { type: ViewType.BlockingMap }
    | { type: ViewType.GroupView }
    | { type: ViewType.IssuePicker; mode: 'blockedBy' | 'blocks'; inum: number };

export interface TerminalProps {
    columns: number;
    rows: number;
}

export interface LayoutProps {
    headerLines: number;
    footerLines: number;
}
