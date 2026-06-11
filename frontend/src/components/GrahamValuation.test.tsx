/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import { Modal, message } from 'antd';
import { GrahamValuation } from './GrahamValuation';
import { writeStockPool } from '../utils/grahamStockPool';

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

  it('sends rGrowthCoeff in evaluate inputs', async () => {
    render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const body = vi.mocked(axios.post).mock.calls[0][1] as {
      inputs: Array<{ rGrowthCoeff?: number }>;
    };
    expect(body.inputs[0]?.rGrowthCoeff).toBe(2);
  });

  it('shows rGrowthCoeff control and 每股净资产 column header', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        rows: [
          {
            stockCode: '600519.SH',
            stockName: '茅台',
            currentPrice: 100,
            bvps: 50,
            startYear: 2019,
            endYear: 2024,
            endEPS: 2,
            R: 5,
            grahamPrice: 54,
            grahamPriceR0: 18,
            grahamPriceR3: 39.6,
            grahamPriceR5: 54,
            dataAsOfDate: '2026-06-11',
            status: 'OK',
            message: '',
          },
        ],
      },
    });
    render(<GrahamValuation />);
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: '每股净资产' })).toBeInTheDocument()
    );
    expect(screen.getByLabelText('R 增长系数')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'R=0 模拟' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'R=7 模拟' })).not.toBeInTheDocument();
  });

  it('renders drag handles for sortable rows', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        rows: [
          {
            stockCode: '600519.SH',
            stockName: '茅台',
            currentPrice: 100,
            dataAsOfDate: '2026-06-11',
            status: 'OK',
            message: '',
            startYear: 2019,
            endYear: 2024,
          },
        ],
      },
    });
    const { container } = render(<GrahamValuation />);
    await waitFor(() => expect(screen.getByText('茅台')).toBeInTheDocument());
    const handles = container.querySelectorAll('[data-testid="drag-handle"]');
    expect(handles.length).toBeGreaterThanOrEqual(1);
  });

  it('persists stock pool order on unmount', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { rows: [] } });
    const { unmount } = render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    unmount();
    expect(writeStockPool).toHaveBeenCalledWith('cn', ['600519.SH']);
  });
});
