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
    isAxiosError: vi.fn(),
    defaults: {},
  },
}));

const marketState = { market: 'cn' as 'cn' | 'us' };

vi.mock('../context/MarketContext', () => ({
  useMarket: () => ({ market: marketState.market }),
}));

const stockPoolState = { pool: ['600519.SH'] as string[] };

vi.mock('../utils/grahamStockPool', () => ({
  readStockPool: () => stockPoolState.pool,
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
    marketState.market = 'cn';
    stockPoolState.pool = ['600519.SH'];
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

  it('shows rGrowthCoeff control and BVPS column header', async () => {
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
      expect(screen.getByRole('columnheader', { name: 'BVPS' })).toBeInTheDocument()
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

  it('shows table rows for stock pool codes even when valuation data is empty', async () => {
    marketState.market = 'us';
    stockPoolState.pool = ['AAPL', 'NVDA'];
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('network down'));

    render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    await waitFor(() => {
      const addButton = screen.getByRole('button', { name: /添加股票/ });
      expect(addButton.className).not.toMatch(/ant-btn-loading/);
    });

    expect(screen.getByText('我的股票池 (2/50)')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('NVDA')).toBeInTheDocument();
    expect(screen.queryByText('暂无数据，请在上方添加股票')).not.toBeInTheDocument();
  });

  it('re-fetches US pool codes without valuation rows instead of rejecting as duplicate', async () => {
    marketState.market = 'us';
    stockPoolState.pool = ['AAPL'];
    const infoSpy = vi.spyOn(message, 'info').mockImplementation(() => undefined as never);
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { rows: [] } })
      .mockResolvedValueOnce({
        data: {
          rows: [
            {
              stockCode: 'AAPL',
              stockName: 'Apple',
              currentPrice: 180,
              startYear: 2019,
              endYear: 2024,
              endEPS: 2,
              R: 5,
              grahamPrice: 54,
              dataAsOfDate: '2026-06-11',
              status: 'OK',
              message: '',
            },
          ],
        },
      });

    render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    await waitFor(() => {
      const addButton = screen.getByRole('button', { name: /添加股票/ });
      expect(addButton.className).not.toMatch(/ant-btn-loading/);
    });
    const postCallsBeforeAdd = vi.mocked(axios.post).mock.calls.length;

    const input = screen.getByPlaceholderText(/例如 AAPL 或 BRK\.B/);
    fireEvent.change(input, { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: /添加股票/ }));

    await waitFor(() =>
      expect(vi.mocked(axios.post).mock.calls.length).toBeGreaterThan(postCallsBeforeAdd)
    );
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringMatching(/已在股票池中/));
    const lastBody = vi.mocked(axios.post).mock.calls.at(-1)?.[1] as {
      inputs: Array<{ stockCode: string; market: string }>;
    };
    expect(lastBody.inputs[0]).toMatchObject({ stockCode: 'AAPL', market: 'us' });
  });

  it('persists stock pool order on unmount', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { rows: [] } });
    const { unmount } = render(<GrahamValuation />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    unmount();
    expect(writeStockPool).toHaveBeenCalledWith('cn', ['600519.SH']);
  });

  it('renders 最近收盘价 column header instead of 现价', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        rows: [
          {
            stockCode: '600519.SH',
            stockName: '贵州茅台',
            currentPrice: 1500,
            startYear: 2020,
            endYear: 2024,
            startEPS: 40,
            endEPS: 60,
            R: 10,
            grahamPrice: 1200,
            priceDeviationPercent: -20,
            dataAsOfDate: '2026-06-11',
            status: 'OK',
            message: '',
          },
        ],
      },
    });

    render(<GrahamValuation />);
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: '最近收盘价' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('columnheader', { name: '现价' })).not.toBeInTheDocument();
  });

  it('shows status column with tooltip message for ERROR row', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        rows: [
          {
            stockCode: '600519.SH',
            stockName: '贵州茅台',
            currentPrice: 1500,
            startYear: 2019,
            endYear: 2024,
            dataAsOfDate: '2026-06-10',
            status: 'ERROR',
            message: '缺少 2019 年扣非 EPS 数据（可用年份: 2021, 2022）',
          },
        ],
      },
    });

    render(<GrahamValuation />);
    await waitFor(() => expect(screen.getByText('失败')).toBeInTheDocument());
  });
});
