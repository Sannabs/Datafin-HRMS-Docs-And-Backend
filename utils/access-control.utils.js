export const getDepartmentFilter = (user) => {
    if (user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN" || user.role === "HR_STAFF") {
        return {};
    }

    if (user.role === "DEPARTMENT_ADMIN") {
        if (!user.departmentId) {
            throw new Error("Department head must be assigned to a department");
        }
        return { departmentId: user.departmentId };
    }

};
