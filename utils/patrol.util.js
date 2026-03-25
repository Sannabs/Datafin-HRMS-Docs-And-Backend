// ---------------------------------------------------------
// Utility: compute slot boundaries for a given time
// ---------------------------------------------------------

export const getCurrentSlotBoundaries = (now, windowStartTime, windowEndTime, intervalHours) => {
    const [startHour, startMin] = windowStartTime.split(":").map(Number);
    const [endHour, endMin] = windowEndTime.split(":").map(Number);
 
    const windowStart = new Date(now);
    windowStart.setHours(startHour, startMin, 0, 0);
 
    const windowEnd = new Date(now);
    windowEnd.setHours(endHour, endMin, 0, 0);
 
    if (now < windowStart || now > windowEnd) return null;
 
    const msFromStart = now.getTime() - windowStart.getTime();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const slotIndex = Math.floor(msFromStart / intervalMs);
 
    const slotStart = new Date(windowStart.getTime() + slotIndex * intervalMs);
    const slotEnd = new Date(slotStart.getTime() + intervalMs);
 
    return {
        start: slotStart,
        end: slotEnd > windowEnd ? windowEnd : slotEnd,
    };
};

// ---------------------------------------------------------
// Utility: compute all slot windows for a schedule on a given date
// ---------------------------------------------------------
export const getSlotStartsForDate = (date, windowStartTime, windowEndTime, intervalHours) => {
    const [startHour, startMin] = windowStartTime.split(":").map(Number);
    const [endHour, endMin] = windowEndTime.split(":").map(Number);

    const windowStart = new Date(date);
    windowStart.setHours(startHour, startMin, 0, 0);

    const windowEnd = new Date(date);
    windowEnd.setHours(endHour, endMin, 0, 0);

    const slots = [];
    const intervalMs = intervalHours * 60 * 60 * 1000;

    let cursor = windowStart.getTime();
    while (cursor < windowEnd.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor + intervalMs);
        slots.push({
            start: slotStart,
            end: slotEnd > windowEnd ? new Date(windowEnd) : slotEnd,
        });
        cursor += intervalMs;
    }

    return slots;
};
