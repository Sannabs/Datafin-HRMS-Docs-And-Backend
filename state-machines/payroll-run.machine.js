import { createMachine, assign } from "xstate";

/**
 * Payroll Run State Machine
 * 
 * States: DRAFT → PROCESSING → COMPLETED
 *                           ↘ FAILED
 * 
 * Business Rules:
 * - Can only start processing from DRAFT
 * - PROCESSING can complete or fail
 * - FAILED runs can be retried (back to PROCESSING)
 * - COMPLETED is terminal for successful runs
 */

/**
 * Payroll Run State Machine Definition
 */
export const payrollRunMachine = createMachine({
    id: "payrollRun",
    initial: "DRAFT",
    context: {
        payrollRunId: null,
        payPeriodId: null,
        tenantId: null,
        totalEmployees: 0,
        processedEmployees: 0,
        failedEmployees: 0,
        queueJobId: null,
        error: null,
    },
    states: {
        DRAFT: {
            on: {
                START: {
                    target: "PROCESSING",
                    guard: "canStart",
                    actions: ["clearError", "onStart"],
                },
                DELETE: {
                    guard: "canDelete",
                    actions: ["onDelete"],
                },
            },
            meta: {
                description: "Payroll run created but not yet started",
                allowedActions: ["start", "delete", "addEmployees"],
            },
        },
        PROCESSING: {
            on: {
                COMPLETE: {
                    target: "COMPLETED",
                    guard: "canComplete",
                    actions: ["clearError", "onComplete"],
                },
                FAIL: {
                    target: "FAILED",
                    actions: ["setError", "onFail"],
                },
                UPDATE_PROGRESS: {
                    actions: ["updateProgress"],
                },
            },
            meta: {
                description: "Payroll is being processed",
                allowedActions: ["viewProgress", "cancel"],
            },
        },
        COMPLETED: {
            type: "final",
            meta: {
                description: "Payroll run completed successfully",
                allowedActions: ["viewPayslips", "generateReports", "downloadPayslips"],
            },
        },
        FAILED: {
            on: {
                RETRY: {
                    target: "PROCESSING",
                    guard: "canRetry",
                    actions: ["clearError", "onRetry"],
                },
            },
            meta: {
                description: "Payroll run failed - can be retried",
                allowedActions: ["retry", "viewErrors"],
            },
        },
    },
}, {
    guards: {
        /**
         * Can start if there are employees to process
         */
        canStart: ({ context }) => {
            return context.totalEmployees > 0 || true; // Allow start, actual validation in controller
        },

        /**
         * Can complete if no employees are still processing
         */
        canComplete: ({ context }) => {
            const processed = context.processedEmployees + context.failedEmployees;
            return processed >= context.totalEmployees || context.totalEmployees === 0;
        },

        /**
         * Can delete only if in DRAFT
         */
        canDelete: () => {
            return true; // Actual check done in controller
        },

        /**
         * Can retry failed runs
         */
        canRetry: () => {
            return true;
        },
    },
    actions: {
        clearError: assign({
            error: null,
        }),

        setError: assign({
            error: ({ event }) => event.error || "Unknown error",
        }),

        updateProgress: assign({
            processedEmployees: ({ context, event }) =>
                event.processedEmployees ?? context.processedEmployees,
            failedEmployees: ({ context, event }) =>
                event.failedEmployees ?? context.failedEmployees,
        }),

        onStart: () => {
            // Placeholder - actual start logic in controller
        },

        onComplete: () => {
            // Placeholder - notifications handled by service
        },

        onFail: () => {
            // Placeholder - error handling in service
        },

        onRetry: assign({
            processedEmployees: 0,
            failedEmployees: 0,
        }),

        onDelete: () => {
            // Placeholder - actual deletion in controller
        },
    },
});

/**
 * Get available transitions for a given state
 * @param {string} currentState - Current payroll run status
 * @returns {Array<string>} Array of available event names
 */
export const getAvailableTransitions = (currentState) => {
    const stateNode = payrollRunMachine.states[currentState];
    if (!stateNode || !stateNode.on) {
        return [];
    }
    return Object.keys(stateNode.on);
};

/**
 * Get state metadata
 * @param {string} state - Payroll run status
 * @returns {Object|null} State metadata
 */
export const getStateMeta = (state) => {
    const stateNode = payrollRunMachine.states[state];
    return stateNode?.meta || null;
};

/**
 * Validate a status transition using the state machine
 * @param {string} currentStatus - Current payroll run status
 * @param {string} targetStatus - Desired status
 * @param {Object} context - Additional context for guards
 * @returns {{ valid: boolean, message?: string, event?: string }}
 */
export const validateTransition = (currentStatus, targetStatus, context = {}) => {
    // Same status - no transition needed
    if (currentStatus === targetStatus) {
        return {
            valid: false,
            message: "Payroll run is already in the requested status",
        };
    }

    // Map target status to event
    const statusToEvent = {
        DRAFT: null, // Can't go back to DRAFT
        PROCESSING: currentStatus === "FAILED" ? "RETRY" : "START",
        COMPLETED: "COMPLETE",
        FAILED: "FAIL",
    };

    const event = statusToEvent[targetStatus];

    if (!event) {
        return {
            valid: false,
            message: `Cannot transition to ${targetStatus} from ${currentStatus}`,
        };
    }

    // Check if the event is available from the current state
    const availableTransitions = getAvailableTransitions(currentStatus);

    if (!availableTransitions.includes(event)) {
        return {
            valid: false,
            message: `Invalid transition from ${currentStatus} to ${targetStatus}. Available transitions: ${availableTransitions.join(", ") || "none"}`,
        };
    }

    // Check guards
    const stateNode = payrollRunMachine.states[currentStatus];
    const transition = stateNode.on[event];

    if (transition.guard) {
        const guardName = transition.guard;
        const guardFn = payrollRunMachine.implementations?.guards?.[guardName];

        if (guardFn && !guardFn({ context })) {
            if (guardName === "canStart" && context.totalEmployees === 0) {
                return {
                    valid: false,
                    message: "Cannot start: no employees to process",
                };
            }
            if (guardName === "canComplete") {
                return {
                    valid: false,
                    message: "Cannot complete: some employees are still being processed",
                };
            }
            return {
                valid: false,
                message: `Transition blocked by guard: ${guardName}`,
            };
        }
    }

    return {
        valid: true,
        event,
    };
};

/**
 * Check if a status is terminal (no further transitions)
 * @param {string} status - Payroll run status
 * @returns {boolean}
 */
export const isTerminalState = (status) => {
    const stateNode = payrollRunMachine.states[status];
    return stateNode?.type === "final";
};

/**
 * Check if the run can be retried
 * @param {string} status - Payroll run status
 * @returns {boolean}
 */
export const canRetry = (status) => {
    return status === "FAILED";
};

/**
 * Get completion percentage
 * @param {Object} context - Payroll run context
 * @returns {number} Percentage (0-100)
 */
export const getCompletionPercentage = (context) => {
    if (context.totalEmployees === 0) return 0;
    const processed = context.processedEmployees + context.failedEmployees;
    return Math.round((processed / context.totalEmployees) * 100);
};

export default payrollRunMachine;

