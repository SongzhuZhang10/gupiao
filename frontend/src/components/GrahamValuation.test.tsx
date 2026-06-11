/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import { Modal, message } from 'antd';
import { GrahamValuation } from './GrahamValuation';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    defaults: {},
  },
}));

vi.mock('../context/MarketContext', () => ({
  useMarket: () => ({ market: 'cn' }),
}));

vi.mock('../utils/grahamStockPool', () => ({
  readStockPool: () => ['600519.SH'],
  writeStockPool: vi.fn(),
}));

window.matchMedia =
  window.matchMedia ||
  function () {
    return {
      matches: false,
      addListener: function () {},
      removeListener: function () {},
    };
  };

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

describe('GrahamValuation cache UX', () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockResolvedValue({ data: { rows: [] } });
    vi.mocked(axios.get).mockResolvedValue({ data: { features: { secRoe: true } } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sends default refreshPolicy on auto load', async () => {
    render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      '/api/graham/evaluate',
      expect.objectContaining({ refreshPolicy: 'default' })
    );
  });

  it('sends fresh-prices refreshPolicy when clicking 全部刷新', async () => {
    render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    await waitFor(() => {
      const refreshButton = screen.getByRole('button', { name: /一键重新计算所有股票/ });
      expect(refreshButton.className).not.toMatch(/ant-btn-loading/);
    });
    vi.mocked(axios.post).mockClear();

    fireEvent.click(screen.getByRole('button', { name: /一键重新计算所有股票/ }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(
      '/api/graham/evaluate',
      expect.objectContaining({ refreshPolicy: 'fresh-prices' })
    );
  });

  it('clears backend cache after confirmation', async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({
      data: { success: true, message: 'Stock data cache cleared successfully.' },
    });
    const messageSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    let confirmOptions: { onOk?: () => Promise<void> };
    vi.spyOn(Modal, 'confirm').mockImplementation(options => {
      confirmOptions = options;
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });

    render(<GrahamValuation />);
    fireEvent.click(screen.getAllByRole('button', { name: '清除本地缓存' })[0]);
    await confirmOptions!.onOk!();

    expect(axios.delete).toHaveBeenCalledWith('/api/cache/stocks');
    expect(messageSpy).toHaveBeenCalledWith('本地缓存已清除。');
  });
});
