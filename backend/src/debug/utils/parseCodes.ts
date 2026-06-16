export function parseCodesArg(codes?: string): string[] {
  if (!codes || !codes.trim()) return [];
  return codes
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
}
