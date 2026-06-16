export function getBeijingTimeContext(nowMs = Date.now()): { currentDate: string; currentHour: number } {
  // Beijing is UTC+8
  const beijingMs = nowMs + 8 * 60 * 60 * 1000;
  const beijingDate = new Date(beijingMs);
  
  const year = beijingDate.getUTCFullYear();
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingDate.getUTCDate()).padStart(2, '0');
  
  return {
    currentDate: `${year}-${month}-${day}`,
    currentHour: beijingDate.getUTCHours()
  };
}

export function resolveValidClosingPrice<T>(
  records: T[],
  getDate: (record: T) => string,
  nowMs = Date.now()
): T | undefined {
  if (!records || records.length === 0) return undefined;
  
  const latest = records[records.length - 1];
  if (records.length === 1) return latest; // Cannot fallback if only 1
  
  const { currentDate, currentHour } = getBeijingTimeContext(nowMs);
  const latestDate = getDate(latest);
  
  // If the latest record is from today and we are before 15:00 Beijing Time, take the previous one
  if (latestDate === currentDate && currentHour < 15) {
    return records[records.length - 2];
  }
  
  return latest;
}
