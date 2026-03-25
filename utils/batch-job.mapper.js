const PRISMA_TO_UI_TYPE = {
    EMPLOYEE_CREATION: "Employee Creation",
    EMPLOYEE_INVITATION: "Employee Invitation",
    ALLOWANCE_ALLOCATION: "Allowance Allocation",
    DEDUCTION_ALLOCATION: "Deduction Allocation",
    BULK_UPDATE: "Bulk Update",
};

export function prismaBatchTypeToUi(type) {
    return PRISMA_TO_UI_TYPE[type] || type;
}

export function uiBatchTypeToPrisma(label) {
    const entry = Object.entries(PRISMA_TO_UI_TYPE).find(([, v]) => v === label);
    return entry ? entry[0] : null;
}

export function batchStatusToApi(status) {
    if (!status) return "pending";
    return String(status).toLowerCase();
}

/**
 * @param {object} job - BatchJob with createdByUser optional
 */
export function mapBatchJobToListItem(job) {
    const creator = job.createdByUser;
    const isSystem = false;
    const processedAt = job.processCompletedAt || job.processStartedAt || job.createdAt;
    return {
        id: job.id,
        batchCode: job.batchCode,
        processedBy: creator?.name || creator?.email || "System",
        processedByImage: creator?.image ?? null,
        processedByRole: creator?.role?.replace(/_/g, " ") ?? null,
        processedAt: processedAt?.toISOString?.() || new Date().toISOString(),
        processStartedAt: job.processStartedAt?.toISOString?.() || null,
        processCompletedAt: job.processCompletedAt?.toISOString?.() || null,
        fileSize:
            job.fileSizeBytes != null
                ? job.fileSizeBytes < 1024 * 1024
                    ? `${Math.round(job.fileSizeBytes / 1024)} KB`
                    : `${(job.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                : undefined,
        batchType: prismaBatchTypeToUi(job.type),
        totalRecords: job.totalRows,
        successCount: job.successCount,
        failedCount: job.failedCount,
        processedCount: job.processedCount,
        status: batchStatusToApi(job.status),
    };
}
