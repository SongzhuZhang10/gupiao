import axios from 'axios';

export function axiosErrorMessage(error: unknown, fallback = '请求失败，请检查网络'): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : '发生了未知错误';
  }

  const backendError = error.response?.data?.error;
  if (typeof backendError === 'string' && backendError.trim()) {
    return backendError;
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
    return '无法连接后端服务，请先启动后端（npm run dev:backend 或 npm run dev）';
  }

  if (error.code === 'ECONNABORTED') {
    return '请求超时，数据源响应过慢，请稍后重试';
  }

  return fallback;
}
