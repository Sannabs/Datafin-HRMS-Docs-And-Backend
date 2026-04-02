-- Composite index for paginated warning lists ordered by createdAt desc
CREATE INDEX IF NOT EXISTS "employee_warning_tenantId_userId_createdAt_idx" ON "employee_warning"("tenantId", "userId", "createdAt" DESC);
