/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { fireEvent, waitFor } from '@testing-library/react';
import { message, Modal } from 'antd';
import axios from 'axios';
import { afterEach, describe, it, expect, vi } from 'vitest';
import App, { SourceMetadataView } from './App';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="chart" />,
}));
// Basic setup to avoid matching media/canvas errors in jsdom with echarts
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

const mockHistoryResponse = {
  data: {
    stockCode: '600519.SH',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    dataSource: 'mock',
    sourceMetadata: {
      logical_source: 'mock',
      fallback_used: true,
      source_priority_rank: 999,
      quality_flags: ['mock_data'],
    },
    warnings: ['真实数据源不可用，当前数据基于 Mock 数据降级展示。'],
    samplingRule: 'fixture',
    points: [
      {
        week: '2024-W01',
        sampleDate: '2024-01-05',
        price: 100,
        dividendYield: 3,
        dividendYieldMode: 'dv_ttm',
      },
    ],
  },
};

const mockZonesResponse = {
  data: {
    code: '600519.SH',
    chartStartDate: '2024-01-01',
    chartEndDate: '2024-01-31',
    thresholdWindowStart: '2019-01-31',
    thresholdWindowEnd: '2024-01-31',
    lookbackYears: 10,
    dividendBasis: 'pre_tax',
    quantiles: { q20: 1, q40: 2, q60: 3, q80: 4 },
    zones: [],
    samples: [],
    stats: [],
    warnings: [],
    dataSource: 'mock',
    sourceMetadata: {
      logical_source: 'mock',
      fallback_used: true,
      source_priority_rank: 999,
      quality_flags: ['mock_data'],
    },
  },
};

function submitDefaultQuery() {
  fireEvent.change(screen.getAllByPlaceholderText('例如 600519 或 600519.SH')[0], {
    target: { value: '600519' },
  });
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

describe('App Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.delete).mockReset();
  });

  it('renders the dashboard title', () => {
    const { container } = render(<App />);
    expect(screen.getByText('A股可视化仪表盘')).toBeDefined();
    expect(container.querySelector('.app-shell')).toBeDefined();
  });

  it('keeps the default forward-adjusted price display in advanced options with denominator guidance', () => {
    render(<App />);

    expect(screen.getAllByText('高级选项').length).toBeGreaterThan(0);
    expect(screen.getAllByText('股价显示：前复权').length).toBeGreaterThan(0);
    expect(screen.getAllByText('仅影响股价走势图，股息率始终按不复权收盘价计算。').length).toBeGreaterThan(0);
    expect(screen.queryByText('后复权')).toBeNull();
  });

  it('renders compact stock data source metadata', () => {
    render(
      <SourceMetadataView
        metadata={{
          logical_source: 'eastmoney',
          access_layer: 'eastmoney_push2his',
          fallback_used: true,
          source_priority_rank: 2,
          quality_flags: ['needs_review'],
        }}
      />
    );

    expect(screen.getByText('数据来源')).toBeDefined();
    expect(screen.getByText('东方财富')).toBeDefined();
    expect(screen.getByText('已降级')).toBeDefined();
    expect(screen.getByText('needs_review')).toBeDefined();
  });

  it('renders the exit zone as 清仓区 in GUI tables', () => {
    render(
      <App />
    );

    vi.mocked(axios.get)
      .mockResolvedValueOnce(mockHistoryResponse)
      .mockResolvedValueOnce({
        data: {
          ...mockZonesResponse.data,
          stats: [
            {
              zoneId: 'exit',
              label: '清仓 / 退出区',
              tradingDays: 2,
              tradingDayRatio: 0.2,
              averageTradingDaysPerYear: 1,
              occurrenceWindows: 1,
            },
          ],
        },
      });

    submitDefaultQuery();

    return waitFor(() => {
      expect(screen.getByText('清仓区')).toBeDefined();
      expect(screen.queryByText('清仓 / 退出区')).toBeNull();
    });
  });

  it('asks whether to use mock data when all free history sources are unavailable', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce({
      response: { data: { error: '所有免费数据源均不可用' } },
    });
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as any);

    render(<App />);
    submitDefaultQuery();

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: '所有免费数据源均不可用',
      content: '是否使用 Mock 数据绘制图表？Mock 数据仅用于演示，不能代表真实市场行情。',
      okText: '使用 Mock 数据',
      cancelText: '保持空白',
    }));
  });

  it('retries history and zones with request-scoped mock fallback when the user confirms', async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({ response: { data: { error: '所有免费数据源均不可用' } } })
      .mockResolvedValueOnce(mockHistoryResponse)
      .mockResolvedValueOnce(mockZonesResponse);
    let confirmOptions: any;
    vi.spyOn(Modal, 'confirm').mockImplementation(options => {
      confirmOptions = options;
      return { destroy: vi.fn(), update: vi.fn() } as any;
    });

    render(<App />);
    submitDefaultQuery();

    await waitFor(() => expect(confirmOptions).toBeDefined());
    await confirmOptions.onOk();

    await waitFor(() => expect(screen.getByText('本地模拟数据')).toBeDefined());
    expect(vi.mocked(axios.get)).toHaveBeenNthCalledWith(2, '/api/stocks/600519/history', expect.objectContaining({
      params: expect.objectContaining({ allowMockFallback: true, cacheTtlHours: 24 }),
    }));
    expect(vi.mocked(axios.get)).toHaveBeenNthCalledWith(3, '/api/stocks/600519/dividend-yield-zones', expect.objectContaining({
      params: expect.objectContaining({ allowMockFallback: true, cacheTtlHours: 24 }),
    }));
  });

  it('keeps the chart blank when the user declines mock data', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce({
      response: { data: { error: '所有免费数据源均不可用' } },
    });
    let confirmOptions: any;
    vi.spyOn(Modal, 'confirm').mockImplementation(options => {
      confirmOptions = options;
      return { destroy: vi.fn(), update: vi.fn() } as any;
    });

    render(<App />);
    submitDefaultQuery();

    await waitFor(() => expect(confirmOptions).toBeDefined());
    confirmOptions.onCancel();

    expect(screen.queryByText('数据表格')).toBeNull();
  });

  it('keeps normal successful queries off the mock confirmation path', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce(mockHistoryResponse)
      .mockResolvedValueOnce(mockZonesResponse);
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as any);

    render(<App />);
    submitDefaultQuery();

    await waitFor(() => expect(screen.getByText('本地模拟数据')).toBeDefined());
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('sends the default cache TTL with stock data requests', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce(mockHistoryResponse)
      .mockResolvedValueOnce(mockZonesResponse);

    render(<App />);
    submitDefaultQuery();

    await waitFor(() => expect(screen.getByText('本地模拟数据')).toBeDefined());
    expect(vi.mocked(axios.get)).toHaveBeenNthCalledWith(1, '/api/stocks/600519/history', expect.objectContaining({
      params: expect.objectContaining({ cacheTtlHours: 24 }),
    }));
    expect(vi.mocked(axios.get)).toHaveBeenNthCalledWith(2, '/api/stocks/600519/dividend-yield-zones', expect.objectContaining({
      params: expect.objectContaining({ cacheTtlHours: 24 }),
    }));
  });

  it('sends the selected cache TTL with stock data requests', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce(mockHistoryResponse)
      .mockResolvedValueOnce(mockZonesResponse);

    render(<App />);
    fireEvent.click(screen.getByText('高级选项'));
    fireEvent.change(screen.getByLabelText('缓存有效期'), { target: { value: '2' } });
    submitDefaultQuery();

    await waitFor(() => expect(screen.getByText('本地模拟数据')).toBeDefined());
    expect(vi.mocked(axios.get)).toHaveBeenNthCalledWith(1, '/api/stocks/600519/history', expect.objectContaining({
      params: expect.objectContaining({ cacheTtlHours: 2 }),
    }));
  });

  it('confirms before clearing local stock cache and shows success feedback', async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({
      data: { success: true, message: 'Stock data cache cleared successfully.' },
    });
    const messageSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as any);
    let confirmOptions: any;
    vi.spyOn(Modal, 'confirm').mockImplementation(options => {
      confirmOptions = options;
      return { destroy: vi.fn(), update: vi.fn() } as any;
    });

    render(<App />);
    fireEvent.click(screen.getByText('清除本地缓存'));

    expect(confirmOptions).toEqual(expect.objectContaining({
      title: '清除本地缓存',
      okText: '清除缓存',
    }));
    await confirmOptions.onOk();

    expect(vi.mocked(axios.delete)).toHaveBeenCalledWith('/api/cache/stocks');
    expect(messageSpy).toHaveBeenCalledWith('本地缓存已清除。');
  });

  it('shows an error when clearing local stock cache fails', async () => {
    vi.mocked(axios.delete).mockRejectedValueOnce(new Error('failed'));
    const messageSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as any);
    let confirmOptions: any;
    vi.spyOn(Modal, 'confirm').mockImplementation(options => {
      confirmOptions = options;
      return { destroy: vi.fn(), update: vi.fn() } as any;
    });

    render(<App />);
    fireEvent.click(screen.getByText('清除本地缓存'));
    await confirmOptions.onOk();

    expect(messageSpy).toHaveBeenCalledWith('清除缓存失败，请稍后重试。');
  });

  it('uses the existing error message path for non-provider-exhaustion history errors', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce({
      response: { data: { error: '获取数据失败' } },
    });
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as any);
    const messageSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as any);

    render(<App />);
    submitDefaultQuery();

    await waitFor(() => expect(messageSpy).toHaveBeenCalledWith('获取数据失败'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed A-share stock codes before submitting requests', async () => {
    render(<App />);

    fireEvent.change(screen.getAllByPlaceholderText('例如 600519 或 600519.SH')[0], {
      target: { value: '60051' },
    });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(await screen.findByText('请输入符合A股股票代码格式的代码，例如 600519 或 600519.SH')).toBeDefined();
    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
  });
});
