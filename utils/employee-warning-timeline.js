/**
 * Map AuditLog rows (EmployeeWarning entity) to UI workflow timeline events.
 */

const TRANSITION_LABELS = {
  SUBMIT_FOR_REVIEW: "Submitted for HR review",
  ISSUE: "Warning issued",
  RESEND_ISSUED_NOTIFICATION: "Issuance notification resent",
  ACKNOWLEDGE: "Acknowledgement recorded",
  REFUSE_ACKNOWLEDGEMENT: "Acknowledgement refused",
  APPEAL_OPEN: "Appeal opened",
  APPEAL_REVIEW: "Appeal under HR review",
  APPEAL_DECISION: "Appeal decision recorded",
  RESOLVE: "Case resolved",
  VOID: "Case voided",
  ESCALATE: "Case escalated",
  RETURN_TO_DRAFT: "Returned to draft",
};

const TRANSITION_TAGS = {
  SUBMIT_FOR_REVIEW: "SUBMITTED",
  ISSUE: "ISSUED",
  RESEND_ISSUED_NOTIFICATION: "ISSUED",
  ACKNOWLEDGE: "ACK",
  REFUSE_ACKNOWLEDGEMENT: "ACK",
  APPEAL_OPEN: "APPEAL",
  APPEAL_REVIEW: "REVIEW",
  APPEAL_DECISION: "DECISION",
  RESOLVE: "RESOLVED",
  VOID: "VOID",
  ESCALATE: "ESCALATED",
  RETURN_TO_DRAFT: "REVIEW",
};

function stringifyDetail(obj, maxLen = 400) {
  if (obj == null) return null;
  try {
    const s = JSON.stringify(obj);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return null;
  }
}

/**
 * @param {import("@prisma/client").AuditLog & { user?: { name?: string | null; email?: string | null } | null }} log
 * @returns {{ id: string, at: string, title: string, detail?: string | null, actorName?: string | null, actorRole?: "HR" | "EMPLOYEE" | "SYSTEM", tag?: string }}
 */
export function mapAuditLogToTimelineEvent(log) {
  const changes =
    log.changes && typeof log.changes === "object"
      ? /** @type {Record<string, unknown>} */ (log.changes)
      : {};
  const transition =
    typeof changes.transition === "string" ? changes.transition : null;

  let title = log.action;
  let tag;

  if (transition && TRANSITION_LABELS[transition]) {
    title = TRANSITION_LABELS[transition];
    tag = TRANSITION_TAGS[transition];
  } else if (log.action === "CREATE") {
    title = "Case created (draft)";
    tag = "CREATED";
  } else if (log.action === "UPDATE") {
    title = "Draft or case details updated";
    tag = "REVIEW";
  } else if (log.action === "DELETE") {
    title = "Case draft deleted";
    tag = "VOID";
  } else if (log.action === "OTHER" && transition) {
    title = transition.replace(/_/g, " ");
    tag = "REVIEW";
  }

  const detailParts = [];
  if (transition === "APPEAL_DECISION" && changes.decision != null) {
    detailParts.push(`Outcome: ${changes.decision}`);
  }
  if (changes.note != null) {
    detailParts.push(typeof changes.note === "string" ? changes.note : stringifyDetail(changes.note));
  }
  if (changes.reviewNote != null && transition === "SUBMIT_FOR_REVIEW") {
    detailParts.push(
      typeof changes.reviewNote === "string"
        ? changes.reviewNote
        : stringifyDetail(changes.reviewNote)
    );
  }
  if (detailParts.length === 0 && Object.keys(changes).length > 0 && !transition) {
    const d = stringifyDetail(changes, 500);
    if (d) detailParts.push(d);
  }

  const actorName = log.user?.name?.trim() || log.user?.email?.trim() || null;

  return {
    id: log.id,
    at: log.timestamp.toISOString(),
    title,
    detail: detailParts.length ? detailParts.filter(Boolean).join(" · ") : null,
    actorName,
    actorRole: "HR",
    tag,
  };
}
