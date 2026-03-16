export const getBlackoutSegmentsForYear = (policy, year) => {
    const m1 = policy.blackoutStartMonth;
    const d1 = policy.blackoutStartDay;
    const m2 = policy.blackoutEndMonth;
    const d2 = policy.blackoutEndDay;
    if (m1 == null || d1 == null || m2 == null || d2 == null) return [];
  
    const start = new Date(year, m1 - 1, d1);
    const end = new Date(year, m2 - 1, d2);
    if (start <= end) {
      return [{ start, end }];
    }
    const yearEnd = new Date(year, 11, 31);
    const yearStart = new Date(year, 0, 1);
    return [
      { start, end: yearEnd },
      { start: yearStart, end },
    ];
  }
  
  export const requestOverlapsBlackout = (policy, requestStart, requestEnd) => {
    if (
      policy.blackoutStartMonth == null ||
      policy.blackoutStartDay == null ||
      policy.blackoutEndMonth == null ||
      policy.blackoutEndDay == null
    ) {
      return false;
    }
    const startYear = requestStart.getFullYear();
    const endYear = requestEnd.getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const segments = getBlackoutSegmentsForYear(policy, y);
      for (const { start, end } of segments) {
        if (requestStart <= end && requestEnd >= start) return true;
      }
    }
    return false;
  }
  

  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtBlackoutDate = (month, day) =>
  month != null && day != null ? `${MONTH_ABBR[month - 1]} ${day}` : "?";

export const getBlackoutWindowLabel = (policy) =>
  `${fmtBlackoutDate(policy.blackoutStartMonth, policy.blackoutStartDay)} – ${fmtBlackoutDate(policy.blackoutEndMonth, policy.blackoutEndDay)}`;