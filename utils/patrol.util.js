// ---------------------------------------------------------
// Utility: compute slot boundaries for a given time
// ---------------------------------------------------------

const getCurrentSlotBoundaries = (now, windowStartTime, windowEndTime, intervalHours) => {
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