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

const FIELD_LABELS = {
  title: "Title",
  category: "Category",
  severity: "Severity",
  status: "Status",
  incidentDate: "Incident date",
  policyReference: "Policy reference",
  reason: "Reason",
  issueNote: "Issue note",
  reviewDueDate: "Review due date",
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

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatShortValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string") {
    const v = value.trim();
    return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "[complex]";
}

function summarizeBeforeAfter(changes) {
  const before = isPlainObject(changes.before) ? changes.before : null;
  const after = isPlainObject(changes.after) ? changes.after : null;
  if (!before && !after) return null;

  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const changed = [...keys].filter((k) => {
    const b = before ? before[k] : undefined;
    const a = after ? after[k] : undefined;
    return JSON.stringify(b) !== JSON.stringify(a);
  });
  if (changed.length === 0) return null;

  const preferred = changed.filter((k) => FIELD_LABELS[k]);
  const focusKeys = (preferred.length ? preferred : changed).slice(0, 4);
  const chunks = focusKeys.map((k) => {
    const label = FIELD_LABELS[k] || k;
    const b = formatShortValue(before ? before[k] : undefined);
    const a = formatShortValue(after ? after[k] : undefined);
    return `${label}: ${b} -> ${a}`;
  });
  const suffix = changed.length > focusKeys.length ? ` · +${changed.length - focusKeys.length} more` : "";
  return `Updated fields: ${chunks.join(" · ")}${suffix}`;
}

function summarizeCreate(changes) {
  const after = isPlainObject(changes.after) ? changes.after : null;
  if (!after) return null;
  const bits = [];
  if (typeof after.title === "string" && after.title.trim()) bits.push(`Title: ${after.title.trim()}`);
  if (typeof after.category === "string" && after.category.trim()) bits.push(`Category: ${after.category.trim()}`);
  if (typeof after.severity === "string" && after.severity.trim()) bits.push(`Severity: ${after.severity.trim()}`);
  return bits.length > 0 ? bits.join(" · ") : null;
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
    title = "Case created";
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
  if (log.action === "CREATE") {
    const createSummary = summarizeCreate(changes);
    if (createSummary) detailParts.push(createSummary);
  }
  if (log.action === "UPDATE") {
    const updateSummary = summarizeBeforeAfter(changes);
    if (updateSummary) detailParts.push(updateSummary);
  }
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
  if (
    detailParts.length === 0 &&
    Object.keys(changes).length > 0 &&
    !transition &&
    log.action !== "CREATE" &&
    log.action !== "UPDATE"
  ) {
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
