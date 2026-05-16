import { getManagedDepartmentIds } from "./employee-warning-access.js";

export const getDepartmentFilter = async (user) => {
    if (user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN" || user.role === "HR_STAFF") {
        return {};
    }

    if (user.role === "DEPARTMENT_ADMIN") {
        const managedDeptIds = await getManagedDepartmentIds(user.tenantId, user.id);
        if (managedDeptIds.length === 0) {
            throw new Error("Department admin has no managed departments");
        }
        return { departmentId: { in: managedDeptIds } };
    }

    return {};
};
