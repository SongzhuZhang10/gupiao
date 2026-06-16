import axios from 'axios';

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await axios.get<{ ok?: boolean }>('/api/health', { timeout: 3000 });
    return res.data?.ok === true;
  } catch {
    return false;
  }
}
