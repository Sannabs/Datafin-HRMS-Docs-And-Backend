/**
 * Minimal RFC-style CSV line parser (handles quoted fields with commas).
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((c === "," && !inQuotes) || (c === "\r" && !inQuotes)) {
            out.push(cur.trim());
            cur = "";
        } else {
            cur += c;
        }
    }
    out.push(cur.trim());
    return out;
}

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const rawHeaders = parseCsvLine(lines[0]);
    const headers = rawHeaders.map((h) =>
        h
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
    );

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        if (cells.length === 1 && cells[0] === "") continue;
        const row = {};
        headers.forEach((h, j) => {
            row[h] = cells[j] != null ? String(cells[j]).trim() : "";
        });
        rows.push(row);
    }

    return { headers, rows };
}

/**
 * @param {Buffer} buffer
 */
export function parseCsvBuffer(buffer) {
    const text = buffer.toString("utf8");
    return parseCsvText(text);
}
