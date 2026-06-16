export function isTushareConfigured(): boolean {
  return Boolean(process.env.TUSHARE_TOKEN?.trim());
}
