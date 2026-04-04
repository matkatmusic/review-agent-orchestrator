import type React from 'react';

export enum ViewType {
    Home,
    Detail,
    NewIssue,
    AgentStatus,
    BlockingMap,
    GroupView,
    IssuePicker,
    Trash,
    ConfirmModal,
}

export const ViewTypeStringsMap = new Map<ViewType, string>([
    [ViewType.Home, "Home"],
    [ViewType.Detail, "Detail"],
    [ViewType.NewIssue, "New Issue"],
    [ViewType.AgentStatus, "Agent Status"],
    [ViewType.BlockingMap, "Blocking Map"],
    [ViewType.GroupView, "Group View"],
    [ViewType.IssuePicker, "Issue Picker"],
    [ViewType.Trash, "Trash"],
    [ViewType.ConfirmModal, "Confirm"],
]);

export type View =
    | { type: ViewType.Home }
    | { type: ViewType.Detail; inum: number }
    | { type: ViewType.NewIssue }
    | { type: ViewType.AgentStatus }
    | { type: ViewType.BlockingMap }
    | { type: ViewType.GroupView }
    | { type: ViewType.IssuePicker; mode: 'blockedBy' | 'blocks'; inum: number }
    | { type: ViewType.Trash }
    | { type: ViewType.ConfirmModal; message: string; hotKeys: Array<{ key: string; label: string; action: () => void }>; onCancel: () => void; originViewType: ViewType; preview?: React.ReactNode };

export interface TerminalProps {
    columns: number;
    rows: number;
}

export interface LayoutProps {
    headerLines: number;
    footerLines: number;
}
