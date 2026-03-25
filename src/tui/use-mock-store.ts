import { useState, useCallback } from 'react';
import { loadMockData, saveMockData } from './mock-store.js';
import type { MockStore } from './mock-store.js';
import { IssueStatus, AuthorType, ResponseType } from '../types.js';
import type { ChangedStatusProps } from '../types.js';
import { createMessage, createResponseNode } from './thread-builders.js';

export interface MockStoreWithUpdater {
    mockDataStore: MockStore;
    updateIssueStatusCallback: (changedStatusProps: ChangedStatusProps) => void;
    trashIssueCallback: (inum: number) => void;
    restoreIssueCallback: (inum: number) => void;
    permanentDeleteCallback: (inum: number) => void;
    emptyTrashCallback: () => void;
    appendResponseCallback: (inum: number, messageBody: string) => void;
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

function syncDetailData(prev: MockStore, updatedIssues: import('../types.js').Issue[]): Record<number, import('./mock-data.js').DetailMockData> {
    const updatedDetailData = { ...prev.detailData };
    for (const issue of updatedIssues) {
        if (updatedDetailData[issue.inum]) {
            updatedDetailData[issue.inum] = {
                ...updatedDetailData[issue.inum],
                issue,
            };
        }
    }
    return updatedDetailData;
}

export function useMockStore(): MockStoreWithUpdater {
    const [mockDataStore, updateMockStoreData] = useState<MockStore>(() => loadMockData());

    const updateIssueStatusCallback = useCallback(
        (changedStatusProps: ChangedStatusProps) => {
            updateMockStoreData((prev) => {
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

                if (isBlockerCleared(changedStatusProps.newStatus)) {
                    updatedIssues = cascadeUnblock(updatedIssues, changedStatusProps.inum);
                }

                const next: MockStore = {
                    ...prev,
                    issues: updatedIssues,
                    detailData: syncDetailData(prev, updatedIssues),
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

                updatedIssues = cascadeUnblock(updatedIssues, inum);

                const updatedUnreadInums = new Set(prev.unreadInums);
                updatedUnreadInums.delete(inum);

                const next: MockStore = {
                    ...prev,
                    issues: updatedIssues,
                    unreadInums: updatedUnreadInums,
                    detailData: syncDetailData(prev, updatedIssues),
                };

                saveMockData(next);
                return next;
            });
        },
        [],
    );

    const restoreIssueCallback = useCallback(
        (inum: number) => {
            updateMockStoreData((prev) => {
                const updatedIssues = prev.issues.map((issue) =>
                    issue.inum === inum
                        ? { ...issue, status: IssueStatus.Inactive, trashed_at: null }
                        : issue,
                );

                const next: MockStore = {
                    ...prev,
                    issues: updatedIssues,
                    detailData: syncDetailData(prev, updatedIssues),
                };

                saveMockData(next);
                return next;
            });
        },
        [],
    );

    const permanentDeleteCallback = useCallback(
        (inum: number) => {
            updateMockStoreData((prev) => {
                // Remove the issue
                let updatedIssues = prev.issues.filter((issue) => issue.inum !== inum);

                // Clean up blocked_by references
                updatedIssues = updatedIssues.map((issue) =>
                    issue.blocked_by.includes(inum)
                        ? { ...issue, blocked_by: issue.blocked_by.filter((bi) => bi !== inum) }
                        : issue,
                );

                // Cascade unblock for issues that were blocked by the deleted inum
                updatedIssues = cascadeUnblock(updatedIssues, inum);

                const updatedUnreadInums = new Set(prev.unreadInums);
                updatedUnreadInums.delete(inum);

                const updatedDetailData = { ...prev.detailData };
                delete updatedDetailData[inum];
                // Sync remaining issues
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

    const emptyTrashCallback = useCallback(
        () => {
            updateMockStoreData((prev) => {
                const trashedInums = new Set(
                    prev.issues
                        .filter((i) => i.status === IssueStatus.Trashed)
                        .map((i) => i.inum),
                );

                // Remove all trashed issues
                let updatedIssues = prev.issues.filter(
                    (issue) => issue.status !== IssueStatus.Trashed,
                );

                // Clean up blocked_by references for all deleted inums
                updatedIssues = updatedIssues.map((issue) => {
                    const filteredBlockedBy = issue.blocked_by.filter(
                        (bi) => !trashedInums.has(bi),
                    );
                    return filteredBlockedBy.length !== issue.blocked_by.length
                        ? { ...issue, blocked_by: filteredBlockedBy }
                        : issue;
                });

                // Cascade unblock
                for (const deletedInum of trashedInums) {
                    updatedIssues = cascadeUnblock(updatedIssues, deletedInum);
                }

                const updatedUnreadInums = new Set(prev.unreadInums);
                for (const inum of trashedInums) {
                    updatedUnreadInums.delete(inum);
                }

                const updatedDetailData = { ...prev.detailData };
                for (const inum of trashedInums) {
                    delete updatedDetailData[inum];
                }
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

    const appendResponseCallback = useCallback(
        (inum: number, messageBody: string) => {
            updateMockStoreData((prev) => {
                const detail = prev.detailData[inum];
                if (!detail || !detail.rootResponse) return prev;

                const id = prev.nextResponseId;
                const now = new Date().toISOString();
                const msg = createMessage(AuthorType.User, ResponseType.None, messageBody, now, now);
                const newNode = createResponseNode(id, msg, false);

                // Walk to the tail of the response chain
                let tail = detail.rootResponse;
                while (tail.response) {
                    tail = tail.response;
                }

                // Link new node to tail
                tail.response = newNode;
                newNode.responding_to = tail;

                const next: MockStore = {
                    ...prev,
                    nextResponseId: id + 1,
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
        restoreIssueCallback: restoreIssueCallback,
        permanentDeleteCallback: permanentDeleteCallback,
        emptyTrashCallback: emptyTrashCallback,
        appendResponseCallback: appendResponseCallback,
    };
    return result;
}
