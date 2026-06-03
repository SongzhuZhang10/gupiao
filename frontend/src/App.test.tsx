/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App, { SourceMetadataView } from './App';
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

describe('App Component', () => {
  it('renders the dashboard title', () => {
    render(<App />);
    expect(screen.getByText('A股可视化仪表盘')).toBeDefined();
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
    expect(screen.getByText('eastmoney')).toBeDefined();
    expect(screen.getByText('eastmoney_push2his')).toBeDefined();
    expect(screen.getByText('已降级')).toBeDefined();
    expect(screen.getByText('needs_review')).toBeDefined();
  });
});
