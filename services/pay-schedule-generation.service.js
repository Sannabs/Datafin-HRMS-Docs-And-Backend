import { getCalendarMetadata } from "../utils/pay-period.utils.js";

/**
 * Get last day of month (Date) for a given date.
 */
function getLastDayOfMonth(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(0);
    return d;
}

/**
 * Compute pay period date ranges from a pay schedule.
 * @param {Object} schedule - { frequency, config }
 * @param {{ fromDate: string, toDate: string } | { count: number }} options - either date range or "next N periods"
 * @param {Date} [referenceEndDate] - for "count" mode, end date of last existing period (or today)
 * @returns {{ startDate: Date, endDate: Date, periodName: string }[]}
 */
export function computePeriodRanges(schedule, options, referenceEndDate = new Date()) {
    const { frequency, config } = schedule;
    const ranges = [];

    if (options.fromDate && options.toDate) {
        const from = new Date(options.fromDate);
        const to = new Date(options.toDate);
        if (from > to) return ranges;
        return computeRangesInWindow(frequency, config || {}, from, to);
    }

    if (typeof options.count === "number" && options.count > 0) {
        const startFrom = referenceEndDate instanceof Date ? new Date(referenceEndDate) : new Date(referenceEndDate);
        startFrom.setUTCDate(startFrom.getUTCDate() + 1);
        const maxEnd = new Date(startFrom);
        maxEnd.setUTCFullYear(maxEnd.getUTCFullYear() + 2);
        const windowRanges = computeRangesInWindow(frequency, config || {}, startFrom, maxEnd);
        return windowRanges.slice(0, Math.min(options.count, 24));
    }

    return ranges;
}

function computeRangesInWindow(frequency, config, windowStart, windowEnd) {
    const ranges = [];

    switch (frequency) {
        case "SEMI_MONTHLY": {
            const day1 = config.dates?.[0] ?? 1;
            const day2Raw = config.dates?.[1] ?? 15;
            const useLast = day2Raw === "last" || day2Raw === "LAST";
            let cur = new Date(windowStart);
            cur.setUTCDate(1);
            if (cur < windowStart) cur.setUTCMonth(cur.getUTCMonth() + 1);
            while (cur <= windowEnd) {
                const month = cur.getUTCMonth();
                const year = cur.getUTCFullYear();
                const lastDay = getLastDayOfMonth(cur).getUTCDate();
                const day2 = useLast ? lastDay : Math.min(Number(day2Raw) || 15, lastDay);
                const period1Start = new Date(Date.UTC(year, month, day1));
                const period1End = new Date(Date.UTC(year, month, Math.min(day2 - 1, lastDay)));
                const period2Start = new Date(Date.UTC(year, month, Math.min(day2, lastDay)));
                const period2End = getLastDayOfMonth(cur);
                if (period1End >= windowStart && period1Start <= windowEnd) {
                    const start = period1Start < windowStart ? new Date(windowStart) : period1Start;
                    const end = period1End > windowEnd ? new Date(windowEnd) : period1End;
                    if (start <= end)
                        ranges.push({
                            startDate: start,
                            endDate: end,
                            periodName: `${cur.toLocaleString("en-GB", { month: "short", year: "numeric" })} (${start.getUTCDate()}–${end.getUTCDate()})`,
                        });
                }
                if (day2 <= lastDay && period2End >= windowStart && period2Start <= windowEnd) {
                    const start = period2Start < windowStart ? new Date(windowStart) : period2Start;
                    const end = period2End > windowEnd ? new Date(windowEnd) : period2End;
                    if (start <= end)
                        ranges.push({
                            startDate: start,
                            endDate: end,
                            periodName: `${cur.toLocaleString("en-GB", { month: "short", year: "numeric" })} (${start.getUTCDate()}–${end.getUTCDate()})`,
                        });
                }
                cur.setUTCMonth(cur.getUTCMonth() + 1);
                cur.setUTCDate(1);
            }
            break;
        }
        case "BI_WEEKLY": {
            const anchor = config.anchorDate ? new Date(config.anchorDate) : new Date(windowStart);
            let start = new Date(anchor);
            while (start < windowStart) start.setUTCDate(start.getUTCDate() + 14);
            while (start <= windowEnd) {
                const end = new Date(start);
                end.setUTCDate(end.getUTCDate() + 13);
                const s = start < windowStart ? new Date(windowStart) : start;
                const e = end > windowEnd ? new Date(windowEnd) : end;
                if (s <= e)
                    ranges.push({
                        startDate: s,
                        endDate: e,
                        periodName: `${s.toLocaleDateString("en-GB", { month: "short", year: "numeric" })} (${s.getUTCDate()}–${e.getUTCDate()})`,
                    });
                start.setUTCDate(start.getUTCDate() + 14);
            }
            break;
        }
        case "MONTHLY": {
            let cur = new Date(windowStart);
            cur.setUTCDate(1);
            if (cur < windowStart) cur.setUTCMonth(cur.getUTCMonth() + 1);
            while (cur <= windowEnd) {
                const start = cur <= windowStart ? new Date(windowStart) : new Date(cur);
                const last = getLastDayOfMonth(cur);
                const end = last > windowEnd ? new Date(windowEnd) : last;
                if (start <= end)
                    ranges.push({
                        startDate: start,
                        endDate: end,
                        periodName: cur.toLocaleString("en-GB", { month: "short", year: "numeric" }),
                    });
                cur.setUTCMonth(cur.getUTCMonth() + 1);
                cur.setUTCDate(1);
            }
            break;
        }
        case "WEEKLY": {
            const anchor = config.anchorDate ? new Date(config.anchorDate) : new Date(windowStart);
            let start = new Date(anchor);
            while (start < windowStart) start.setUTCDate(start.getUTCDate() + 7);
            while (start <= windowEnd) {
                const end = new Date(start);
                end.setUTCDate(end.getUTCDate() + 6);
                const s = start < windowStart ? new Date(windowStart) : start;
                const e = end > windowEnd ? new Date(windowEnd) : end;
                if (s <= e)
                    ranges.push({
                        startDate: s,
                        endDate: e,
                        periodName: `${s.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
                    });
                start.setUTCDate(start.getUTCDate() + 7);
            }
            break;
        }
        default:
            break;
    }

    return ranges;
}
