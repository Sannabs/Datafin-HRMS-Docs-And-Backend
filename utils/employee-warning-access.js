import prisma from "../config/prisma.config.js";

function getTenantId(req) {
  return req.effectiveTenantId ?? req.user?.tenantId ?? null;
}

function isHRAdminOrStaff(role) {
  return role === "HR_ADMIN" || role === "HR_STAFF";
}

/**
 * Department ids where the user is assigned as manager (direct-report scope for warnings).
 */
export async function getManagedDepartmentIds(tenantId, managerUserId) {
  if (!tenantId || !managerUserId) return [];
  const depts = await prisma.department.findMany({
    where: {
      tenantId,
      managerId: managerUserId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return depts.map((d) => d.id);
}

/**
 * True if subject employee is in one of managerUserId's managed departments (or is themselves and in scope).
 */
export async function isEmployeeInDeptAdminScope(
  tenantId,
  managerUserId,
  targetUserId
) {
  const managedDeptIds = await getManagedDepartmentIds(tenantId, managerUserId);
  if (managedDeptIds.length === 0) return false;

  const target = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      tenantId,
      isDeleted: false,
    },
    select: { departmentId: true },
  });

  if (!target?.departmentId) return false;
  return managedDeptIds.includes(target.departmentId);
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
export async function assertCanViewEmployeeWarnings(req, targetUserId) {
  const requesterId = req.user?.id;
  const requesterRole = req.user?.role;
  const tenantId = getTenantId(req);

  if (!requesterId) {
    return { ok: false, status: 401, message: "User not authenticated" };
  }
  if (!tenantId && requesterRole !== "SUPER_ADMIN") {
    return { ok: false, status: 400, message: "Tenant context required" };
  }
  if (requesterRole === "SUPER_ADMIN" && !tenantId) {
    return { ok: false, status: 400, message: "Tenant context required" };
  }

  const targetExists = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      isDeleted: false,
      ...(tenantId && { tenantId }),
    },
    select: { id: true },
  });

  if (!targetExists) {
    return { ok: false, status: 404, message: "Employee not found" };
  }

  if (isHRAdminOrStaff(requesterRole)) {
    return { ok: true };
  }

  if (requesterRole === "SUPER_ADMIN") {
    return { ok: true };
  }

  if (requesterRole === "DEPARTMENT_ADMIN") {
    const inScope =
      targetUserId === requesterId ||
      (await isEmployeeInDeptAdminScope(tenantId, requesterId, targetUserId));
    if (!inScope) {
      return {
        ok: false,
        status: 403,
        message: "You can only view warnings for employees in departments you manage",
      };
    }
    return { ok: true };
  }

  if (requesterRole === "STAFF") {
    if (targetUserId !== requesterId) {
      return {
        ok: false,
        status: 403,
        message: "You can only view your own warnings",
      };
    }
    return { ok: true };
  }

  return { ok: false, status: 403, message: "Insufficient permissions" };
}

/**
 * Create draft / edit draft / submit (non-issue) — HR or dept admin for scoped employees.
 */
export async function assertCanCreateOrMutateNonIssuedWarning(req, targetUserId) {
  const requesterId = req.user?.id;
  const requesterRole = req.user?.role;
  const tenantId = getTenantId(req);

  if (!requesterId) {
    return { ok: false, status: 401, message: "User not authenticated" };
  }
  if (!tenantId) {
    return { ok: false, status: 400, message: "Tenant context required" };
  }

  if (isHRAdminOrStaff(requesterRole) || requesterRole === "SUPER_ADMIN") {
    const targetExists = await prisma.user.findFirst({
      where: { id: targetUserId, tenantId, isDeleted: false },
      select: { id: true },
    });
    if (!targetExists) {
      return { ok: false, status: 404, message: "Employee not found" };
    }
    return { ok: true };
  }

  if (requesterRole === "DEPARTMENT_ADMIN") {
    const inScope = await isEmployeeInDeptAdminScope(
      tenantId,
      requesterId,
      targetUserId
    );
    if (!inScope) {
      return {
        ok: false,
        status: 403,
        message:
          "You can only create or edit warnings for employees in departments you manage",
      };
    }
    return { ok: true };
  }

  return { ok: false, status: 403, message: "Insufficient permissions" };
}

/**
 * Dept admin may only submit warnings they created; HR may submit any draft in tenant.
 */
export async function assertCanSubmitWarning(req, targetUserId, warning) {
  const base = await assertCanCreateOrMutateNonIssuedWarning(req, targetUserId);
  if (!base.ok) return base;

  const requesterId = req.user?.id;
  const requesterRole = req.user?.role;

  if (requesterRole === "DEPARTMENT_ADMIN") {
    if (warning.createdById !== requesterId) {
      return {
        ok: false,
        status: 403,
        message: "You can only submit warning drafts you created",
      };
    }
  }

  return { ok: true };
}

export function assertCanIssueWarning(req) {
  const requesterRole = req.user?.role;
  if (isHRAdminOrStaff(requesterRole) || requesterRole === "SUPER_ADMIN") {
    return { ok: true };
  }
  return {
    ok: false,
    status: 403,
    message: "Only HR can issue warnings",
  };
}

/**
 * Draft edits: HR any draft in scope; dept admin only own drafts.
 */
export async function assertCanEditDraft(req, warning, targetUserId) {
  const mutate = await assertCanCreateOrMutateNonIssuedWarning(
    req,
    targetUserId
  );
  if (!mutate.ok) return mutate;

  if (warning.status !== "DRAFT") {
    return {
      ok: false,
      status: 400,
      message: "Only draft warnings can be edited",
    };
  }

  if (req.user?.role === "DEPARTMENT_ADMIN") {
    if (warning.createdById !== req.user?.id) {
      return {
        ok: false,
        status: 403,
        message: "You can only edit warning drafts you created",
      };
    }
  }

  return { ok: true };
}

/** Employee self or HR acting on behalf (acknowledge, refuse, appeal). */
export function assertCanActAsWarningEmployee(req, targetUserId) {
  const requesterId = req.user?.id;
  const requesterRole = req.user?.role;
  if (!requesterId) {
    return { ok: false, status: 401, message: "User not authenticated" };
  }
  if (
    requesterRole === "STAFF" &&
    targetUserId === requesterId
  ) {
    return { ok: true };
  }
   
  if (
    isHRAdminOrStaff(requesterRole) ||
    requesterRole === "SUPER_ADMIN"
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 403,
    message: "Only the employee or HR may perform this action",
  };
}

export function assertCanReviewAppeal(req) {
  return assertCanIssueWarning(req);
}

export function assertCanResolveVoidEscalate(req) {
  return assertCanIssueWarning(req);
}

export { getTenantId, isHRAdminOrStaff };
