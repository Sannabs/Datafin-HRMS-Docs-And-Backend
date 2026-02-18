/**
 * Escape a value for safe use in CSV (handles null, commas, quotes, newlines).
 * @param {*} val - Value to escape
 * @returns {string}
 */
export const escapeCsv = (val) => {
    if (val == null) return "";
    const s = String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

/**
 * Format a date for CSV export (YYYY-MM-DD or empty string if invalid).
 * @param {Date | string | null | undefined} d - Date to format
 * @returns {string}
 */
export const formatDateForCsv = (d) => {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};
