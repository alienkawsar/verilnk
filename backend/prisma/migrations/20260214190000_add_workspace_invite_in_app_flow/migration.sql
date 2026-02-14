-- Additional read indexes for workspace/user invite dashboards
CREATE INDEX IF NOT EXISTS "Invite_workspaceId_status_idx" ON "Invite"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Invite_invitedEmail_status_idx" ON "Invite"("invitedEmail", "status");
CREATE INDEX IF NOT EXISTS "Invite_invitedUserId_status_idx" ON "Invite"("invitedUserId", "status");
