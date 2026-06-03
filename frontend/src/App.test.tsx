/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';
import React from 'react';

// Basic setup to avoid matching media/canvas errors in jsdom with echarts
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('App Component', () => {
  it('renders the dashboard title', () => {
    render(<App />);
    expect(screen.getByText('A-Share Visualization Dashboard')).toBeDefined();
  });
});
