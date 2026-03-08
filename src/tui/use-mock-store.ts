import { useState, useCallback } from 'react';
import { loadMockData, saveMockData } from './mock-store.js';
import type { MockStore } from './mock-store.js';
import { IssueStatus } from '../types.js';
import type { Issue, ChangedStatusProps } from '../types.js';

export interface MockStoreWithUpdater {
    mockDataStore: MockStore;
    updateIssueStatusCallback: (changedStatusProps: ChangedStatusProps) => void;
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

                // 2. Cascade: unblock issues whose blockers are all now resolved
                if (changedStatusProps.newStatus === IssueStatus.Resolved) {
                    const blockedInums = prev.dependencies
                        .filter((d) => d.blocker_inum === changedStatusProps.inum)
                        .map((d) => d.blocked_inum);

                    updatedIssues = updatedIssues.map((issue) => {
                        if (!blockedInums.includes(issue.inum) || issue.status !== IssueStatus.Blocked)
                            return issue;

                        const allBlockerInums = prev.dependencies
                            .filter((d) => d.blocked_inum === issue.inum)
                            .map((d) => d.blocker_inum);

                        const allResolved = allBlockerInums.every((bi) => {
                            const blocker = updatedIssues.find((i) => i.inum === bi);
                            return blocker && blocker.status === IssueStatus.Resolved;
                        });

                        return allResolved ? { ...issue, status: IssueStatus.Awaiting } : issue;
                    });
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

                // 4. Sync containerIssues references
                const updatedContainerIssues: Record<number, Issue[]> = {};
                for (const [cid, cIssues] of Object.entries(prev.containerIssues)) {
                    updatedContainerIssues[Number(cid)] = cIssues.map((ci) => {
                        const updated = updatedIssues.find((i) => i.inum === ci.inum);
                        return updated ?? ci;
                    });
                }

                const next: MockStore = {
                    ...prev,
                    issues: updatedIssues,
                    detailData: updatedDetailData,
                    containerIssues: updatedContainerIssues,
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
    };
    return result;
}
