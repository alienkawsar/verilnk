import { WorkspaceStatus } from '@prisma/client';
import { prisma } from '../db/client';

export type WorkspaceLifecycleMode = 'READ' | 'ADMIN';

const normalizeActorRole = (role: string | null | undefined): string => {
    const normalized = String(role || '').trim().toUpperCase();
    if (!normalized) return 'UNKNOWN';
    if (normalized === 'EDITOR') return 'DEVELOPER';
    if (normalized === 'VIEWER') return 'AUDITOR';
    return normalized;
};

const isAdminActor = (role: string | null | undefined) => {
    const normalized = normalizeActorRole(role);
    return normalized === 'OWNER' || normalized === 'ADMIN' || normalized === 'SUPER_ADMIN';
};

export class WorkspaceLifecycleError extends Error {
    status: number;
    code: string;
    workspaceId: string;
    workspaceStatus: WorkspaceStatus | 'UNKNOWN';

    constructor(params: {
        workspaceId: string;
        workspaceStatus: WorkspaceStatus | 'UNKNOWN';
        code: 'WORKSPACE_NOT_FOUND' | 'WORKSPACE_SUSPENDED' | 'WORKSPACE_ARCHIVED' | 'WORKSPACE_DELETED';
        message: string;
        status: number;
    }) {
        super(params.message);
        this.name = 'WorkspaceLifecycleError';
        this.status = params.status;
        this.code = params.code;
        this.workspaceId = params.workspaceId;
        this.workspaceStatus = params.workspaceStatus;
    }
}

export const isWorkspaceLifecycleError = (error: unknown): error is WorkspaceLifecycleError => {
    return error instanceof WorkspaceLifecycleError;
};

export const toWorkspaceLifecycleErrorResponse = (error: WorkspaceLifecycleError) => ({
    code: error.code,
    message: error.message,
    workspaceId: error.workspaceId,
    workspaceStatus: error.workspaceStatus
});

const getWorkspaceLifecycleRecord = async (workspaceId: string) => {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, status: true }
    });

    if (!workspace) {
        throw new WorkspaceLifecycleError({
            workspaceId,
            workspaceStatus: 'UNKNOWN',
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Workspace not found',
            status: 404
        });
    }

    return workspace;
};

export const assertWorkspaceActive = async (workspaceId: string) => {
    const workspace = await getWorkspaceLifecycleRecord(workspaceId);

    if (workspace.status !== WorkspaceStatus.ACTIVE) {
        const errorCode = workspace.status === WorkspaceStatus.SUSPENDED
            ? 'WORKSPACE_SUSPENDED'
            : workspace.status === WorkspaceStatus.ARCHIVED
                ? 'WORKSPACE_ARCHIVED'
                : 'WORKSPACE_DELETED';

        const message = workspace.status === WorkspaceStatus.SUSPENDED
            ? 'Workspace is suspended'
            : workspace.status === WorkspaceStatus.ARCHIVED
                ? 'Workspace is archived'
                : 'Workspace is deleted';

        throw new WorkspaceLifecycleError({
            workspaceId,
            workspaceStatus: workspace.status,
            code: errorCode,
            message,
            status: 423
        });
    }

    return workspace;
};

export const assertWorkspaceLifecycleAccess = async (input: {
    workspaceId: string;
    actorRole: string | null | undefined;
    mode: WorkspaceLifecycleMode;
    allowArchivedAdminRecovery?: boolean;
}) => {
    const workspace = await getWorkspaceLifecycleRecord(input.workspaceId);

    if (workspace.status === WorkspaceStatus.ACTIVE) {
        return workspace;
    }

    if (workspace.status === WorkspaceStatus.SUSPENDED) {
        if (input.mode === 'ADMIN' && isAdminActor(input.actorRole)) {
            return workspace;
        }

        throw new WorkspaceLifecycleError({
            workspaceId: input.workspaceId,
            workspaceStatus: workspace.status,
            code: 'WORKSPACE_SUSPENDED',
            message: 'Workspace is suspended. Only admin actions are allowed.',
            status: 423
        });
    }

    if (workspace.status === WorkspaceStatus.ARCHIVED) {
        if (input.mode === 'READ') {
            return workspace;
        }

        if (input.allowArchivedAdminRecovery && isAdminActor(input.actorRole)) {
            return workspace;
        }

        throw new WorkspaceLifecycleError({
            workspaceId: input.workspaceId,
            workspaceStatus: workspace.status,
            code: 'WORKSPACE_ARCHIVED',
            message: 'Workspace is archived. Only read-only access is allowed.',
            status: 423
        });
    }

    throw new WorkspaceLifecycleError({
        workspaceId: input.workspaceId,
        workspaceStatus: workspace.status,
        code: 'WORKSPACE_DELETED',
        message: 'Workspace is deleted and cannot be accessed.',
        status: 410
    });
};
