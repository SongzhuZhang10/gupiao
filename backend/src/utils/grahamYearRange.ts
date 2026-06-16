export interface GrahamYearSample {
  year: number;
  adjustedEps: number;
}

export interface ResolvedGrahamYears {
  startYear: number;
  endYear: number;
  adjusted: boolean;
  messages: string[];
}

function positiveYears(history: GrahamYearSample[]): number[] {
  return history
    .filter(row => Number.isFinite(row.adjustedEps) && row.adjustedEps > 0)
    .map(row => row.year)
    .sort((a, b) => a - b);
}

export function resolveEffectiveGrahamYears(
  history: GrahamYearSample[],
  requestedStartYear: number,
  requestedEndYear: number
): ResolvedGrahamYears {
  const years = positiveYears(history);
  if (years.length === 0) {
    throw new Error('无可用正 EPS 年份');
  }

  const earliest = years[0];
  const latest = years[years.length - 1];
  const messages: string[] = [];
  let startYear = requestedStartYear;
  let endYear = requestedEndYear;
  let adjusted = false;

  if (!years.includes(requestedStartYear) && requestedStartYear < earliest) {
    startYear = earliest;
    adjusted = true;
    messages.push(`起始年已从 ${requestedStartYear} 调整为最早可用 EPS 年份 ${earliest}`);
  }

  const candidatesEnd = years.filter(y => y <= requestedEndYear);
  if (candidatesEnd.length === 0) {
    throw new Error(
      `缺少 ${requestedEndYear} 年及之前扣非 EPS 数据（可用年份: ${years.join(', ')}）`
    );
  }
  const effectiveEnd = candidatesEnd[candidatesEnd.length - 1];
  if (effectiveEnd !== requestedEndYear) {
    endYear = effectiveEnd;
    adjusted = true;
    messages.push(`结束年已从 ${requestedEndYear} 调整为最近可用 EPS 年份 ${effectiveEnd}`);
  }

  if (startYear > endYear) {
    throw new Error(`有效年份区间无效：${startYear}..${endYear}`);
  }

  if (!years.includes(startYear)) {
    throw new Error(
      `缺少 ${startYear} 年扣非 EPS 数据（可用年份: ${years.join(', ')}）`
    );
  }

  return { startYear, endYear, adjusted, messages };
}
