import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { axiosErrorMessage } from './axiosErrorMessage';

describe('axiosErrorMessage', () => {
  it('returns backend error text when present', () => {
    const error = new axios.AxiosError(
      'bad request',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {},
        config: { headers: new axios.AxiosHeaders() },
        data: { error: '所有免费数据源均不可用' },
      }
    );

    expect(axiosErrorMessage(error)).toBe('所有免费数据源均不可用');
  });

  it('explains when backend is unreachable', () => {
    const error = new axios.AxiosError('connect refused', 'ECONNREFUSED');

    expect(axiosErrorMessage(error)).toContain('无法连接后端服务');
  });
});
