"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertWorkspaceLifecycleAccess = exports.assertWorkspaceActive = exports.toWorkspaceLifecycleErrorResponse = exports.isWorkspaceLifecycleError = exports.WorkspaceLifecycleError = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const normalizeActorRole = (role) => {
    const normalized = String(role || '').trim().toUpperCase();
    if (!normalized)
        return 'UNKNOWN';
    if (normalized === 'EDITOR')
        return 'DEVELOPER';
    if (normalized === 'VIEWER')
        return 'AUDITOR';
    return normalized;
};
const isAdminActor = (role) => {
    const normalized = normalizeActorRole(role);
    return normalized === 'OWNER' || normalized === 'ADMIN' || normalized === 'SUPER_ADMIN';
};
class WorkspaceLifecycleError extends Error {
    constructor(params) {
        super(params.message);
        this.name = 'WorkspaceLifecycleError';
        this.status = params.status;
        this.code = params.code;
        this.workspaceId = params.workspaceId;
        this.workspaceStatus = params.workspaceStatus;
    }
}
exports.WorkspaceLifecycleError = WorkspaceLifecycleError;
const isWorkspaceLifecycleError = (error) => {
    return error instanceof WorkspaceLifecycleError;
};
exports.isWorkspaceLifecycleError = isWorkspaceLifecycleError;
const toWorkspaceLifecycleErrorResponse = (error) => ({
    code: error.code,
    message: error.message,
    workspaceId: error.workspaceId,
    workspaceStatus: error.workspaceStatus
});
exports.toWorkspaceLifecycleErrorResponse = toWorkspaceLifecycleErrorResponse;
const getWorkspaceLifecycleRecord = async (workspaceId) => {
    const workspace = await client_2.prisma.workspace.findUnique({
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
const assertWorkspaceActive = async (workspaceId) => {
    const workspace = await getWorkspaceLifecycleRecord(workspaceId);
    if (workspace.status !== client_1.WorkspaceStatus.ACTIVE) {
        const errorCode = workspace.status === client_1.WorkspaceStatus.SUSPENDED
            ? 'WORKSPACE_SUSPENDED'
            : workspace.status === client_1.WorkspaceStatus.ARCHIVED
                ? 'WORKSPACE_ARCHIVED'
                : 'WORKSPACE_DELETED';
        const message = workspace.status === client_1.WorkspaceStatus.SUSPENDED
            ? 'Workspace is suspended'
            : workspace.status === client_1.WorkspaceStatus.ARCHIVED
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
exports.assertWorkspaceActive = assertWorkspaceActive;
const assertWorkspaceLifecycleAccess = async (input) => {
    const workspace = await getWorkspaceLifecycleRecord(input.workspaceId);
    if (workspace.status === client_1.WorkspaceStatus.ACTIVE) {
        return workspace;
    }
    if (workspace.status === client_1.WorkspaceStatus.SUSPENDED) {
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
    if (workspace.status === client_1.WorkspaceStatus.ARCHIVED) {
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
exports.assertWorkspaceLifecycleAccess = assertWorkspaceLifecycleAccess;
