import { createMachine, assign } from "xstate";

/**
 * Pay Period State Machine
 * 
 * States: DRAFT → PROCESSING → COMPLETED → CLOSED
 * 
 * Business Rules:
 * - Can only move forward in the status flow (no going back)
 * - Cannot close if there are incomplete/failed payroll runs
 * - CLOSED is terminal - no further transitions allowed
 */

/**
 * Pay Period State Machine Definition
 */
export const payPeriodMachine = createMachine({
    id: "payPeriod",
    initial: "DRAFT",
    context: {
        payPeriodId: null,
        tenantId: null,
        hasIncompleteRuns: false,
        hasFailedRuns: false,
        autoCloseEnabled: true,
        error: null,
    },
    states: {
        DRAFT: {
            on: {
                START_PROCESSING: {
                    target: "PROCESSING",
                    guard: "canStartProcessing",
                    actions: ["clearError"],
                },
                DELETE: {
                    guard: "canDelete",
                    actions: ["onDelete"],
                },
            },
            meta: {
                description: "Pay period is created but not yet processing",
                allowedActions: ["edit", "delete", "startProcessing"],
            },
        },
        PROCESSING: {
            on: {
                COMPLETE: {
                    target: "COMPLETED",
                    guard: "canComplete",
                    actions: ["clearError"],
                },
                FAIL: {
                    target: "PROCESSING", // Stay in PROCESSING but mark as having failures
                    actions: ["markFailed"],
                },
            },
            meta: {
                description: "Payroll runs are being processed",
                allowedActions: ["viewProgress"],
            },
        },
        COMPLETED: {
            on: {
                CLOSE: {
                    target: "CLOSED",
                    guard: "canClose",
                    actions: ["clearError", "onClose"],
                },
                PAUSE_AUTO_CLOSE: {
                    actions: ["pauseAutoClose"],
                },
                RESUME_AUTO_CLOSE: {
                    actions: ["resumeAutoClose"],
                },
            },
            meta: {
                description: "All payroll runs completed successfully",
                allowedActions: ["close", "pauseAutoClose", "resumeAutoClose", "viewReports"],
            },
        },
        CLOSED: {
            type: "final",
            meta: {
                description: "Pay period is finalized and locked",
                allowedActions: ["viewReports"],
            },
        },
    },
}, {
    guards: {
        /**
         * Can start processing if the pay period is in DRAFT
         */
        canStartProcessing: ({ context }) => {
            return true; // Additional business logic can be added here
        },

        /**
         * Can complete if there are no incomplete runs
         */
        canComplete: ({ context }) => {
            if (context.hasIncompleteRuns) {
                return false;
            }
            return true;
        },

        /**
         * Can close if there are no failed runs and no incomplete runs
         */
        canClose: ({ context }) => {
            if (context.hasIncompleteRuns) {
                return false;
            }
            if (context.hasFailedRuns) {
                return false;
            }
            return true;
        },

        /**
         * Can delete only if in DRAFT and no payroll runs exist
         */
        canDelete: ({ context }) => {
            return true; // Actual check done in controller
        },
    },
    actions: {
        clearError: assign({
            error: null,
        }),

        markFailed: assign({
            hasFailedRuns: true,
        }),

        pauseAutoClose: assign({
            autoCloseEnabled: false,
        }),

        resumeAutoClose: assign({
            autoCloseEnabled: true,
        }),

        onDelete: () => {
            // Placeholder for delete action - actual deletion handled by controller
        },

        onClose: () => {
            // Placeholder for close action - notifications handled by service
        },
    },
});

/**
 * Get available transitions for a given state
 * @param {string} currentState - Current pay period status
 * @returns {Array<string>} Array of available event names
 */
export const getAvailableTransitions = (currentState) => {
    const stateNode = payPeriodMachine.states[currentState];
    if (!stateNode || !stateNode.on) {
        return [];
    }
    return Object.keys(stateNode.on);
};

/**
 * Get state metadata
 * @param {string} state - Pay period status
 * @returns {Object|null} State metadata
 */
export const getStateMeta = (state) => {
    const stateNode = payPeriodMachine.states[state];
    return stateNode?.meta || null;
};

/**
 * Validate a status transition using the state machine
 * @param {string} currentStatus - Current pay period status
 * @param {string} targetStatus - Desired status
 * @param {Object} context - Additional context for guards
 * @returns {{ valid: boolean, message?: string, event?: string }}
 */
export const validateTransition = (currentStatus, targetStatus, context = {}) => {
    // Same status - no transition needed
    if (currentStatus === targetStatus) {
        return {
            valid: false,
            message: "Pay period is already in the requested status",
        };
    }

    // Map target status to event
    const statusToEvent = {
        DRAFT: null, // Can't go back to DRAFT
        PROCESSING: "START_PROCESSING",
        COMPLETED: "COMPLETE",
        CLOSED: "CLOSE",
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
    const stateNode = payPeriodMachine.states[currentStatus];
    const transition = stateNode.on[event];

    if (transition.guard) {
        const guardName = transition.guard;
        const guardFn = payPeriodMachine.implementations?.guards?.[guardName];

        if (guardFn && !guardFn({ context })) {
            // Return specific error messages based on guard
            if (guardName === "canComplete" && context.hasIncompleteRuns) {
                return {
                    valid: false,
                    message: "Cannot complete: there are incomplete payroll runs",
                };
            }
            if (guardName === "canClose") {
                if (context.hasIncompleteRuns) {
                    return {
                        valid: false,
                        message: "Cannot close: there are incomplete payroll runs",
                    };
                }
                if (context.hasFailedRuns) {
                    return {
                        valid: false,
                        message: "Cannot close: there are failed payroll runs",
                    };
                }
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
 * @param {string} status - Pay period status
 * @returns {boolean}
 */
export const isTerminalState = (status) => {
    const stateNode = payPeriodMachine.states[status];
    return stateNode?.type === "final";
};

/**
 * Get the next valid status in the flow
 * @param {string} currentStatus - Current pay period status
 * @returns {string|null} Next status or null if terminal
 */
export const getNextStatus = (currentStatus) => {
    const statusFlow = {
        DRAFT: "PROCESSING",
        PROCESSING: "COMPLETED",
        COMPLETED: "CLOSED",
        CLOSED: null,
    };
    return statusFlow[currentStatus] || null;
};

export default payPeriodMachine;

