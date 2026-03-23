const MONTHS = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
};

function buildDate(year, monthIndex, day) {
    const d = new Date(year, monthIndex, day);
    if (
        Number.isNaN(d.getTime()) ||
        d.getFullYear() !== Number(year) ||
        d.getMonth() !== Number(monthIndex) ||
        d.getDate() !== Number(day)
    ) {
        return null;
    }
    return d;
}

/**
 * Accepts these explicit formats:
 * - YYYY-MM-DD
 * - D/M/YYYY or DD/MM/YYYY (legacy behavior: if first segment <= 12, parse as MM/DD/YYYY)
 * - MMM D, YYYY / MMMM D, YYYY (e.g. Sep 2, 2024)
 * - D MMM YYYY / D MMMM YYYY (e.g. 2 Sep 2024)
 */
export function parseFlexibleDate(dateValue) {
    if (dateValue == null) return null;
    const s = String(dateValue).trim();
    if (!s) return null;

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
        return buildDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const a = Number(slash[1]);
        const b = Number(slash[2]);
        const y = Number(slash[3]);
        if (a > 12) return buildDate(y, b - 1, a); // DD/MM/YYYY
        return buildDate(y, a - 1, b); // MM/DD/YYYY (legacy compatibility)
    }

    const monthFirst = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (monthFirst) {
        const m = MONTHS[monthFirst[1].toLowerCase()];
        if (m == null) return null;
        return buildDate(Number(monthFirst[3]), m, Number(monthFirst[2]));
    }

    const dayFirst = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
    if (dayFirst) {
        const m = MONTHS[dayFirst[2].toLowerCase()];
        if (m == null) return null;
        return buildDate(Number(dayFirst[3]), m, Number(dayFirst[1]));
    }

    return null;
}

