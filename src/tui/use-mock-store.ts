import { useState, useCallback } from 'react';
import { loadMockData, saveMockData } from './mock-store.js';
import type { MockStore } from './mock-store.js';
import { IssueStatus } from '../types.js';
import type { ChangedStatusProps } from '../types.js';

export interface MockStoreWithUpdater {
    mockDataStore: MockStore;
    updateIssueStatusCallback: (changedStatusProps: ChangedStatusProps) => void;
    trashIssueCallback: (inum: number) => void;
}

function isBlockerCleared(status: IssueStatus): boolean {
    return status === IssueStatus.Resolved || status === IssueStatus.Trashed;
}

function cascadeUnblock(issues: import('../types.js').Issue[], changedInum: number): import('../types.js').Issue[] {
    return issues.map((issue) => {
        if (issue.status !== IssueStatus.Blocked) return issue;
        if (!issue.blocked_by.includes(changedInum)) return issue;

        const allClear = issue.blocked_by.every((bi) => {
            const blocker = issues.find((i) => i.inum === bi);
            return blocker && isBlockerCleared(blocker.status);
        });

        return allClear ? { ...issue, status: IssueStatus.InQueue } : issue;
    });
}

export function useMockStore(): MockStoreWithUpdater {
    const [mockDataStore, updateMockStoreData] = useState<MockStore>(() => loadMockData());

    const updateIssueStatusCallback = useCallback(
        (changedStatusProps: ChangedStatusProps) => {
            updateMockStoreData((prev) => {
                // 1. Immutable update of the target issue
                let updatedIssues = prev.issues.map((issue) =>
                    issue.inum === changedStatusProps.inum
                        ? {
                              ...issue,
                              status: changedStatusProps.newStatus,
                              resolved_at:
                                  changedStatusProps.newStatus === IssueStatus.Resolved
                                      ? new Date().toISOString()
                                      : null,
                          }
                        : issue,
                );

                // 2. Cascade: unblock issues whose blockers are all now resolved/trashed
                if (isBlockerCleared(changedStatusProps.newStatus)) {
                    updatedIssues = cascadeUnblock(updatedIssues, changedStatusProps.inum);
                }

                // 3. Sync detailData issue references to new Issue objects
                const updatedDetailData = { ...prev.detailData };
                for (const issue of updatedIssues) {
                    if (updatedDetailData[issue.inum]) {
                        updatedDetailData[issue.inum] = {
                            ...updatedDetailData[issue.inum],
                            issue,
                        };
                    }
                }

                const next: MockStore = {
                    ...prev,
                    issues: updatedIssues,
                    detailData: updatedDetailData,
                };

                saveMockData(next);
                return next;
            });
        },
        [],
    );

    const trashIssueCallback = useCallback(
        (inum: number) => {
            updateMockStoreData((prev) => {
                let updatedIssues = prev.issues.map((issue) =>
                    issue.inum === inum
                        ? {
                              ...issue,
                              status: IssueStatus.Trashed,
                              trashed_at: new Date().toISOString(),
                          }
                        : issue,
                );

                // Cascade: unblock issues whose blockers are all now resolved/trashed
                updatedIssues = cascadeUnblock(updatedIssues, inum);

                const updatedUnreadInums = new Set(prev.unreadInums);
                updatedUnreadInums.delete(inum);

                const updatedDetailData = { ...prev.detailData };
                for (const issue of updatedIssues) {
                    if (updatedDetailData[issue.inum]) {
                        updatedDetailData[issue.inum] = {
                            ...updatedDetailData[issue.inum],
                            issue,
                        };
                    }
                }

                const next: MockStore = {
                    ...prev,
                    issues: updatedIssues,
                    unreadInums: updatedUnreadInums,
                    detailData: updatedDetailData,
                };

                saveMockData(next);
                return next;
            });
        },
        [],
    );

    const result: MockStoreWithUpdater = {
        mockDataStore: mockDataStore,
        updateIssueStatusCallback: updateIssueStatusCallback,
        trashIssueCallback: trashIssueCallback,
    };
    return result;
}
