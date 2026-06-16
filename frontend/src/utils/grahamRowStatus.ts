import { isRetryableGrahamError } from './grahamRetryPolicy';

export type GrahamDisplayStatus = 'OK' | 'ERROR' | 'WARNING';

export function grahamStatusLabel(status: GrahamDisplayStatus): string {
  if (status === 'OK') return '正常';
  if (status === 'WARNING') return '部分缺失';
  return '失败';
}

export function grahamStatusTagColor(status: GrahamDisplayStatus): 'success' | 'warning' | 'error' {
  if (status === 'OK') return 'success';
  if (status === 'WARNING') return 'warning';
  return 'error';
}

export function formatGrahamStatusMessage(row: {
  status: GrahamDisplayStatus;
  message: string;
}): string {
  if (row.message.trim()) return row.message.trim();
  return row.status === 'OK' ? '数据完整' : '未知原因';
}

export function isGrahamRowRetryable(row: {
  status: GrahamDisplayStatus;
  message: string;
}): boolean {
  if (row.status === 'OK' || row.status === 'WARNING') return false;
  if (!row.message.trim()) return true;
  return isRetryableGrahamError(row.message);
}
