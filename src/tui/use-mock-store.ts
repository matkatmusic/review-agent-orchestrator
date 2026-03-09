import { useState, useCallback } from 'react';
import { loadMockData, saveMockData } from './mock-store.js';
import type { MockStore } from './mock-store.js';
import { IssueStatus } from '../types.js';
import type { ChangedStatusProps } from '../types.js';

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
                    updatedIssues = updatedIssues.map((issue) => {
                        if (issue.status !== IssueStatus.Blocked) return issue;
                        if (!issue.blocked_by.includes(changedStatusProps.inum)) return issue;

                        const allResolved = issue.blocked_by.every((bi) => {
                            const blocker = updatedIssues.find((i) => i.inum === bi);
                            return blocker && blocker.status === IssueStatus.Resolved;
                        });

                        return allResolved ? { ...issue, status: IssueStatus.InQueue } : issue;
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

    const result: MockStoreWithUpdater = {
        mockDataStore: mockDataStore,
        updateIssueStatusCallback: updateIssueStatusCallback,
    };
    return result;
}
