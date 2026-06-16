import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { Card, Table, Typography, Space, Button, message, Tooltip, Input, Row, Col, Form, InputNumber, Modal, Tag, Select } from 'antd';
import type { TableProps } from 'antd';
import {
  InfoCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SortAscendingOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { axiosErrorMessage } from '../utils/axiosErrorMessage';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DraggableAttributes } from '@dnd-kit/core';
import { useMarket } from '../context/MarketContext';
import {
  isValidStockCode,
  stockCodeErrorForMarket,
  stockCodePlaceholderForMarket,
} from '../utils/stock';
import { normalizeCodesForPool, resolveAddStockFetchPlan } from '../utils/grahamAddStock';
import { buildDisplayRowsForPool, createGrahamPlaceholderRow } from '../utils/grahamPoolDisplay';
import {
  reorderStockPoolBySortedRows,
  sortValuationRowsByDeviationAsc,
} from '../utils/sortGrahamPoolByDeviation';
import { readStockPool, writeStockPool } from '../utils/grahamStockPool';
import {
  clampGrahamTableColumnWidth,
  readGrahamTableColumnWidths,
  writeGrahamTableColumnWidths,
  type GrahamTableColumnKey,
} from '../utils/grahamTableColumnWidths';
import { orderValuationRowsByPool } from '../utils/orderValuationRowsByPool';
import { DEFAULT_R_GROWTH_COEFF, recalcValuationPrices } from '../utils/grahamFormula';
import { AUTO_RETRY_DELAY_MS, pickAutoRetryCodes } from '../utils/grahamRetryPolicy';
import {
  formatGrahamStatusMessage,
  grahamStatusLabel,
  grahamStatusTagColor,
  isGrahamRowRetryable,
} from '../utils/grahamRowStatus';

const { Title, Text } = Typography;

export interface ValuationRow {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  dataSource?: string;
  startYear: number;
  endYear: number;
  startEPS?: number;
  endEPS?: number;
  R?: number;
  grahamPrice?: number;
  priceDeviationPercent?: number;
  grahamPriceR0?: number;
  grahamPriceR3?: number;
  grahamPriceR5?: number;
  roeLatest?: number;
  bvps?: number;
  dataAsOfDate: string;
  status: 'OK' | 'ERROR' | 'WARNING';
  message: string;
}

const CN_DATA_SOURCES = [
  { label: '自动 (东方财富优先)', value: '' },
  { label: '东财F10', value: 'eastmoney' },
  { label: '新浪财经', value: 'sina' },
  { label: 'AKShare', value: 'akshare_generic' },
  { label: 'Baostock', value: 'baostock' },
  { label: '巨潮资讯', value: 'cninfo' },
  { label: 'Tushare', value: 'tushare' },
  { label: '搜狐财经', value: 'sohu' },
];

const US_DATA_SOURCES = [
  { label: '自动 (默认)', value: '' },
  { label: 'Yahoo', value: 'yahoo' },
];



interface GrahamFormValues {
  startYear: number;
  endYear: number;
  Y: number;
  rGrowthCoeff: number;
}

const cardStyle: React.CSSProperties = {
  background: '#111827',
  borderColor: '#243244',
  borderRadius: 8,
  boxShadow: '0 18px 38px rgba(0,0,0,0.28)',
};

interface RowContextValue {
  listeners?: Record<string, unknown>;
  attributes?: DraggableAttributes;
}

const RowContext = React.createContext<RowContextValue>({});

interface SortableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

const SortableRow: React.FC<SortableRowProps> = props => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key'],
  });
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
  };
  return (
    <RowContext.Provider value={{ attributes, listeners }}>
      <tr {...props} ref={setNodeRef} style={style} />
    </RowContext.Provider>
  );
};

const DragHandle: React.FC = () => {
  const { listeners, attributes } = useContext(RowContext);
  return (
    <HolderOutlined
      data-testid="drag-handle"
      style={{ cursor: 'grab', color: '#94a3b8' }}
      {...listeners}
      {...attributes}
    />
  );
};

interface ResizableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  columnKey?: GrahamTableColumnKey;
  columnTitle?: string;
  columnWidth?: number;
  onResizeColumn?: (key: GrahamTableColumnKey, width: number) => void;
}

const COLUMN_RESIZE_KEYBOARD_STEP = 8;

const ResizableHeaderCell: React.FC<ResizableHeaderCellProps> = ({
  columnKey,
  columnTitle,
  columnWidth,
  onResizeColumn,
  children,
  style,
  ...restProps
}) => {
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    cleanupDragRef.current?.();
  }, []);

  const resizeTo = useCallback((nextWidth: number) => {
    if (!columnKey || !onResizeColumn) return;
    onResizeColumn(columnKey, nextWidth);
  }, [columnKey, onResizeColumn]);

  const handlePointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!columnKey || !onResizeColumn || columnWidth == null) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidth;

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      cleanupDragRef.current = null;
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeTo(startWidth + moveEvent.clientX - startX);
    };
    const handlePointerUp = () => {
      cleanup();
    };

    cleanupDragRef.current?.();
    cleanupDragRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (columnWidth == null) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    resizeTo(columnWidth + direction * COLUMN_RESIZE_KEYBOARD_STEP);
  };

  return (
    <th
      {...restProps}
      aria-label={columnTitle || restProps['aria-label']}
      style={{ ...style, width: columnWidth }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
        {columnKey && columnTitle && columnWidth != null && (
          <span
            aria-label={`调整 ${columnTitle} 列宽`}
            aria-orientation="vertical"
            role="separator"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            style={{
              position: 'absolute',
              top: 0,
              right: -4,
              width: 8,
              height: '100%',
              cursor: 'col-resize',
              touchAction: 'none',
              userSelect: 'none',
              zIndex: 1,
            }}
          />
        )}
      </div>
    </th>
  );
};

function parseGrahamFormValues(saved: string | null): GrahamFormValues | null {
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as Partial<GrahamFormValues>;
    if (
      typeof parsed.startYear === 'number' &&
      typeof parsed.endYear === 'number' &&
      typeof parsed.Y === 'number'
    ) {
      return {
        startYear: parsed.startYear,
        endYear: parsed.endYear,
        Y: parsed.Y,
        rGrowthCoeff: typeof parsed.rGrowthCoeff === 'number' ? parsed.rGrowthCoeff : DEFAULT_R_GROWTH_COEFF,
      };
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export const GrahamValuation: React.FC = () => {
  const { market } = useMarket();
  const [form] = Form.useForm<GrahamFormValues>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ValuationRow[]>([]);
  const [stockPool, setStockPool] = useState<string[]>(() => readStockPool(market));
  const [columnWidths, setColumnWidths] = useState(() => readGrahamTableColumnWidths());

  const [initialParams] = useState<GrahamFormValues>(() => {
    const saved = parseGrahamFormValues(localStorage.getItem('grahamGlobalParams'));
    if (saved) return saved;
    const currentYear = new Date().getFullYear();
    return { startYear: currentYear - 6, endYear: currentYear - 1, Y: 1.71, rGrowthCoeff: DEFAULT_R_GROWTH_COEFF };
  });

  const [newStockCode, setNewStockCode] = useState('');
  const [retryingCodes, setRetryingCodes] = useState<Set<string>>(() => new Set());

  const [dataSourceOverrides, setDataSourceOverridesState] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`grahamOverrides_${market}`) || '{}');
    } catch {
      return {};
    }
  });
  const overridesRef = React.useRef(dataSourceOverrides);

  const setDataSourceOverrides = useCallback((nextOverrides: Record<string, string>) => {
    overridesRef.current = nextOverrides;
    setDataSourceOverridesState(nextOverrides);
    localStorage.setItem(`grahamOverrides_${market}`, JSON.stringify(nextOverrides));
  }, [market]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const persistStockPool = useCallback(
    (pool: string[]) => {
      writeStockPool(market, pool);
    },
    [market]
  );

  const handleColumnResize = useCallback((key: GrahamTableColumnKey, width: number) => {
    setColumnWidths(prev => {
      const nextWidth = clampGrahamTableColumnWidth(key, width);
      if (prev[key] === nextWidth) return prev;
      const next = { ...prev, [key]: nextWidth };
      writeGrahamTableColumnWidths(next);
      return next;
    });
  }, []);

  const getGrahamParams = useCallback((): GrahamFormValues => {
    const values = form.getFieldsValue();
    return {
      ...initialParams,
      ...values,
      rGrowthCoeff: values.rGrowthCoeff ?? initialParams.rGrowthCoeff ?? DEFAULT_R_GROWTH_COEFF,
    };
  }, [form, initialParams]);

  const displayRows = useMemo(() => {
    const params = getGrahamParams();
    return buildDisplayRowsForPool(stockPool, data, {
      loading,
      params: { startYear: params.startYear, endYear: params.endYear },
    }) as ValuationRow[];
  }, [stockPool, data, loading, getGrahamParams]);

  useEffect(() => {
    const pool = readStockPool(market);
    setStockPool(pool);
    setData([]);
    let newOverrides: Record<string, string> = {};
    try {
      newOverrides = JSON.parse(localStorage.getItem(`grahamOverrides_${market}`) || '{}');
    } catch {}
    overridesRef.current = newOverrides;
    setDataSourceOverridesState(newOverrides);

    if (pool.length > 0) {
      void fetchValuations(pool, { refreshPolicy: 'default', marketOverride: market });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  useEffect(() => {
    return () => {
      if (stockPool.length > 0) {
        writeStockPool(market, stockPool);
      }
    };
  }, [market, stockPool]);

  useEffect(() => {
    if (market !== 'us') return;
    void axios
      .get<{ features?: { secRoe?: boolean } }>('/api/health')
      .then(res => {
        if (res.data?.features?.secRoe !== true) {
          message.warning(
            '后端版本过旧，美股 ROE 不可用。请重启后端（npm run dev:backend）或重新 build:backend 后重启应用，再点「全部刷新」。',
            8
          );
        }
      })
      .catch(() => {
        /* health 不可达时由 evaluate 请求报错 */
      });
  }, [market]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleValuesChange = (_: any, allValues: GrahamFormValues) => {
    localStorage.setItem('grahamGlobalParams', JSON.stringify(allValues));
  };

  const handleRGrowthCoeffChange = (value: number | null) => {
    if (value == null || value <= 0) return;
    const params = getGrahamParams();
    form.setFieldValue('rGrowthCoeff', value);
    localStorage.setItem(
      'grahamGlobalParams',
      JSON.stringify({ ...params, rGrowthCoeff: value })
    );
    setData(prev =>
      prev.map(row => recalcValuationPrices(row, { Y: params.Y, rGrowthCoeff: value }))
    );
  };

  const fetchValuations = async (
    codes: string[],
    options: {
      isRefreshAll?: boolean;
      refreshPolicy?: 'default' | 'fresh-prices';
      marketOverride?: typeof market;
      orderPool?: string[];
      skipAutoRetry?: boolean;
    } = {}
  ): Promise<{ ok: boolean; rows: ValuationRow[]; errorMessage?: string }> => {
    const {
      isRefreshAll = false,
      refreshPolicy = 'default',
      marketOverride = market,
      orderPool,
      skipAutoRetry = false,
    } = options;
    if (codes.length === 0) return { ok: true, rows: [] };
    const params = getGrahamParams();
    try {
      setLoading(true);
      const inputs = codes.map(code => ({
        stockCode: code,
        startYear: params.startYear,
        endYear: params.endYear,
        Y: params.Y,
        rGrowthCoeff: params.rGrowthCoeff,
        market: marketOverride,
        dataSourceOverride: overridesRef.current[code],
      }));

      const res = await axios.post('/api/graham/evaluate', {
        inputs,
        refreshPolicy,
        cacheTtlHours: 24,
      });
      const rows: ValuationRow[] = res.data.rows ?? [];

      setData(prev => {
        const newData = isRefreshAll ? [] : [...prev];
        rows.forEach((newRow: ValuationRow) => {
          const idx = newData.findIndex(r => r.stockCode === newRow.stockCode);
          if (idx !== -1) {
            newData[idx] = newRow;
          } else {
            newData.push(newRow);
          }
        });
        const poolOrder = orderPool ?? (stockPool.length > 0 ? stockPool : codes);
        return orderValuationRowsByPool(newData, poolOrder);
      });
      if (isRefreshAll) message.success('全部刷新完成');

      const autoRetryCodes = pickAutoRetryCodes(rows);
      if (autoRetryCodes.length > 0 && !skipAutoRetry && codes.length > 1) {
        window.setTimeout(() => {
          void fetchValuations(autoRetryCodes, {
            refreshPolicy: 'fresh-prices',
            marketOverride,
            orderPool,
            skipAutoRetry: true,
          });
        }, AUTO_RETRY_DELAY_MS);
      }

      return { ok: true, rows };
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = axiosErrorMessage(error);
      message.error(errorMessage);
      setData(prev => {
        const newData = isRefreshAll ? [] : [...prev];
        const poolOrder = orderPool ?? (stockPool.length > 0 ? stockPool : codes);
        codes.forEach(code => {
          const placeholder = createGrahamPlaceholderRow(
            code,
            { startYear: params.startYear, endYear: params.endYear },
            errorMessage
          );
          const idx = newData.findIndex(r => r.stockCode === code);
          if (idx !== -1) {
            newData[idx] = placeholder;
          } else {
            newData.push(placeholder);
          }
        });
        return orderValuationRowsByPool(newData, poolOrder);
      });
      return { ok: false, rows: [], errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async () => {
    const codes = newStockCode.split(',').map(s => s.trim()).filter(Boolean);
    if (!codes.length) return;

    const invalidCode = codes.find(code => !isValidStockCode(code, market));
    if (invalidCode) {
      message.error(stockCodeErrorForMarket(market));
      return;
    }

    const normalizedCodes = normalizeCodesForPool(codes, market);
    const { codesToFetch, duplicateOnly } = resolveAddStockFetchPlan(
      normalizedCodes,
      stockPool,
      data
    );
    if (codesToFetch.length === 0 && duplicateOnly.length === normalizedCodes.length) {
      message.info(`${duplicateOnly.join(', ')} 已在股票池中`);
      setNewStockCode('');
      return;
    }

    const newPoolCodes = codesToFetch.filter(code => !stockPool.includes(code));
    if (stockPool.length + newPoolCodes.length > 50) {
      message.warning('股票池最多允许 50 只股票');
      return;
    }

    const nextPool = [...new Set([...stockPool, ...codesToFetch])];
    setStockPool(nextPool);
    persistStockPool(nextPool);

    const result = await fetchValuations(codesToFetch, {
      refreshPolicy: 'default',
      orderPool: nextPool,
    });

    const succeeded = result.rows.filter(row => row.status === 'OK' || row.status === 'WARNING');
    const failed = result.rows.filter(row => row.status === 'ERROR');

    if (succeeded.length > 0) {
      setNewStockCode('');
      message.success(`已添加 ${succeeded.map(row => row.stockCode).join(', ')}`);
    }

    if (failed.length > 0) {
      message.error(failed.map(row => `${row.stockCode}: ${row.message}`).join('；'));
    } else if (!result.ok) {
      /* fetchValuations already surfaced the network error */
    } else if (succeeded.length === 0) {
      message.error('未能获取有效估值数据');
    }
  };

  const handleRefreshAll = () => {
    const pool = stockPool.length > 0 ? stockPool : readStockPool(market);
    if (pool.length === 0) {
      message.info('请先添加股票');
      return;
    }
    if (stockPool.length === 0 && pool.length > 0) {
      setStockPool(pool);
    }
    void fetchValuations(pool, { isRefreshAll: true, refreshPolicy: 'fresh-prices', orderPool: pool });
  };

  const clearLocalCache = () => {
    Modal.confirm({
      title: '清除本地缓存',
      content: '确定要删除后端本地股票数据缓存吗？格雷厄姆估值的历史 EPS/ROE 与行情缓存都将被清除，之后将重新请求外部数据源。',
      okText: '清除缓存',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await axios.delete('/api/cache/stocks');
          message.success('本地缓存已清除。');
        } catch (error) {
          console.error(error);
          message.error('清除缓存失败，请稍后重试。');
        }
      },
    });
  };

  const handleRemoveStock = (code: string) => {
    setStockPool(prev => {
      const next = prev.filter(c => c !== code);
      persistStockPool(next);
      return next;
    });
    setData(prev => prev.filter(r => r.stockCode !== code));
  };

  const handleDataSourceOverrideChange = (code: string, newSource: string) => {
    const nextOverrides = { ...dataSourceOverrides };
    if (!newSource) {
      delete nextOverrides[code];
    } else {
      nextOverrides[code] = newSource;
    }
    setDataSourceOverrides(nextOverrides);
    void fetchValuations([code], { refreshPolicy: 'fresh-prices' });
  };

  const handleRetryStock = async (code: string) => {
    setRetryingCodes(prev => new Set(prev).add(code));
    try {
      await fetchValuations([code], { refreshPolicy: 'fresh-prices' });
    } finally {
      setRetryingCodes(prev => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  };

  const handleSortByDeviation = () => {
    if (displayRows.length < 2) {
      message.info('至少需要 2 只股票才能排序');
      return;
    }
    const sortableCount = displayRows.filter(row => row.priceDeviationPercent != null).length;
    if (sortableCount < 2) {
      message.info('至少需要 2 只有效偏离率的股票才能排序');
      return;
    }
    const sortedRows = sortValuationRowsByDeviationAsc(displayRows);
    setData(sortedRows);
    setStockPool(prev => {
      const next = reorderStockPoolBySortedRows(prev, sortedRows);
      persistStockPool(next);
      return next;
    });
    message.success('已按偏离率从小到大排序');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayRows.findIndex(r => r.stockCode === active.id);
    const newIndex = displayRows.findIndex(r => r.stockCode === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedData = arrayMove(displayRows, oldIndex, newIndex);
    const reorderedPool = reorderedData.map(r => r.stockCode);
    setData(reorderedData);
    setStockPool(reorderedPool);
    persistStockPool(reorderedPool);
  };

  const columns = useMemo(
    (): NonNullable<TableProps<ValuationRow>['columns']> => {
      const resizableHeader = (key: GrahamTableColumnKey, title: string) => ({
        width: columnWidths[key],
        onHeaderCell: () => ({
          style: { width: columnWidths[key] },
          columnKey: key,
          columnTitle: title,
          columnWidth: columnWidths[key],
          onResizeColumn: handleColumnResize,
        } as React.ThHTMLAttributes<HTMLTableCellElement>),
      });

      return [
      {
        title: '',
        key: 'sort',
        ...resizableHeader('sort', '排序'),
        fixed: 'left' as const,
        render: () => <DragHandle />,
      },
      {
        title: '代码',
        dataIndex: 'stockCode',
        key: 'stockCode',
        fixed: 'left' as const,
        ...resizableHeader('stockCode', '代码'),
      },
      {
        title: '名称',
        dataIndex: 'stockName',
        key: 'stockName',
        fixed: 'left' as const,
        ...resizableHeader('stockName', '名称'),
        render: (text: string) => <Text strong>{text || '-'}</Text>,
      },
      {
        title: 'BVPS',
        dataIndex: 'bvps',
        key: 'bvps',
        ...resizableHeader('bvps', 'BVPS'),
        render: (v: number) => (v != null ? v.toFixed(2) : '-'),
      },
      {
        title: '最近收盘价',
        dataIndex: 'currentPrice',
        key: 'currentPrice',
        ...resizableHeader('currentPrice', '最近收盘价'),
        render: (v: number) => v?.toFixed(2),
      },
      {
        title: 'Beg. Adj. EPS',
        dataIndex: 'startEPS',
        key: 'startEPS',
        ...resizableHeader('startEPS', 'Beg. Adj. EPS'),
        render: (v: number) => v?.toFixed(2),
      },
      {
        title: 'End. Adj. EPS',
        dataIndex: 'endEPS',
        key: 'endEPS',
        ...resizableHeader('endEPS', 'End. Adj. EPS'),
        render: (v: number) => v?.toFixed(2),
      },
      {
        title: 'R(%)',
        dataIndex: 'R',
        key: 'R',
        ...resizableHeader('R', 'R(%)'),
        render: (v: number) => (v != null ? v.toFixed(0) : '-'),
      },
      {
        title: 'Graham Price',
        dataIndex: 'grahamPrice',
        key: 'grahamPrice',
        ...resizableHeader('grahamPrice', 'Graham Price'),
        render: (v: number) =>
          v != null ? <Text strong style={{ color: '#38bdf8' }}>{v.toFixed(2)}</Text> : '-',
      },
      {
        title: '偏离率',
        dataIndex: 'priceDeviationPercent',
        key: 'priceDeviationPercent',
        ...resizableHeader('priceDeviationPercent', '偏离率'),
        render: (v: number) => {
          if (v == null) return '-';
          const color = v > 0 ? '#ef4444' : '#10b981';
          return (
            <span style={{ color, fontWeight: 500 }}>
              {v > 0 ? '+' : ''}
              {v.toFixed(0)}%
            </span>
          );
        },
      },
      {
        title: 'R=0',
        dataIndex: 'grahamPriceR0',
        key: 'grahamPriceR0',
        ...resizableHeader('grahamPriceR0', 'R=0'),
        render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text>,
      },
      {
        title: 'R=3',
        dataIndex: 'grahamPriceR3',
        key: 'grahamPriceR3',
        ...resizableHeader('grahamPriceR3', 'R=3'),
        render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text>,
      },
      {
        title: 'R=5',
        dataIndex: 'grahamPriceR5',
        key: 'grahamPriceR5',
        ...resizableHeader('grahamPriceR5', 'R=5'),
        render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text>,
      },
      {
        title: 'ROE',
        dataIndex: 'roeLatest',
        key: 'roeLatest',
        ...resizableHeader('roeLatest', 'ROE'),
        render: (v: number) => (v != null ? `${v.toFixed(0)}%` : '-'),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        ...resizableHeader('status', '状态'),
        fixed: 'right' as const,
        render: (status: ValuationRow['status'], row: ValuationRow) => (
          <Tooltip title={formatGrahamStatusMessage(row)}>
            <Tag color={grahamStatusTagColor(status)} style={{ margin: 0, cursor: 'help' }}>
              {grahamStatusLabel(status)}
            </Tag>
          </Tooltip>
        ),
      },

      {
        title: '数据源',
        dataIndex: 'dataSource',
        key: 'dataSource',
        ...resizableHeader('dataSource', '数据源'),
        render: (text: string, r: ValuationRow) => {
          const currentOverride = dataSourceOverrides[r.stockCode] || '';
          const nameMap: Record<string, string> = {
            eastmoney: '东财F10',
            cninfo: '巨潮资讯',
            baostock: 'BaoStock',
            akshare_generic: 'AKShare',
            tushare: 'Tushare',
            sina: '新浪财经',
            sohu: '搜狐财经',
            yahoo: 'Yahoo',
            sec_edgar: 'SEC Edgar',
            daily_bars_bridge: '兜底',
            mock: 'Mock',
          };
          const resolvedName = text ? (nameMap[text] || text) : '未知';
          const options = market === 'us' ? US_DATA_SOURCES : CN_DATA_SOURCES;

          return (
            <Select
              size="small"
              value={currentOverride}
              onChange={(val) => handleDataSourceOverrideChange(r.stockCode, val)}
              options={options}
              labelRender={opt => {
                if (opt.value === '' || opt.value == null) return resolvedName;
                return opt.label;
              }}
              style={{ width: '100%' }}
              dropdownMatchSelectWidth={false}
              bordered={false}
            />
          );
        },
      },
      {
        title: '操作',
        key: 'action',
        ...resizableHeader('action', '操作'),
        fixed: 'right' as const,
        render: (_: unknown, r: ValuationRow) => (
          <Space size={4}>
            {isGrahamRowRetryable(r) && (
              <Tooltip title="重新拉取该股票数据">
                <Button
                  type="text"
                  aria-label={`重试 ${r.stockCode}`}
                  icon={<ReloadOutlined />}
                  loading={retryingCodes.has(r.stockCode)}
                  onClick={() => void handleRetryStock(r.stockCode)}
                />
              </Tooltip>
            )}
            <Tooltip title="从股票池中移除">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveStock(r.stockCode)}
              />
            </Tooltip>
          </Space>
        ),
      },
    ];
    },
    [retryingCodes, dataSourceOverrides, market, columnWidths, handleColumnResize]
  );

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={<Space><InfoCircleOutlined /> 估值模型参数</Space>}
            style={{ ...cardStyle, height: '100%' }}
            styles={{ body: { padding: '20px 24px' }, header: { borderBottom: '1px solid #1f2937' } }}
          >
            <Form
              form={form}
              layout="vertical"
              onValuesChange={handleValuesChange}
              initialValues={initialParams}
            >
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="startYear"
                    label={
                      <Space size="small">
                        开始年份
                        <Tooltip title="年报报告期日历年，A 股与美股语义一致。">
                          <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                        </Tooltip>
                      </Space>
                    }
                    rules={[{ required: true, message: '必填' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber precision={0} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="endYear"
                    label={
                      <Space size="small">
                        结束年份
                        <Tooltip title="年报报告期日历年，A 股与美股语义一致；末年扣非 EPS 取自该年。">
                          <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                        </Tooltip>
                      </Space>
                    }
                    rules={[{ required: true, message: '必填' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber precision={0} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="Y"
                    label={
                      <Space size="small">
                        AAA债收益率(%)
                        <Tooltip title="当前市场中长期 AAA 级企业债年化收益率。修改后需点击“全部刷新”生效。">
                          <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                        </Tooltip>
                      </Space>
                    }
                    rules={[{ required: true, message: '必填' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber precision={2} step={0.1} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="rGrowthCoeff" hidden>
                <InputNumber />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={<Space><PlusOutlined /> 股票池管理</Space>}
            style={{ ...cardStyle, height: '100%' }}
            styles={{ body: { padding: '20px 24px' }, header: { borderBottom: '1px solid #1f2937' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="large"
                  placeholder={`输入股票代码，${stockCodePlaceholderForMarket(market)}，支持逗号分隔`}
                  value={newStockCode}
                  onChange={e => setNewStockCode(e.target.value)}
                  onPressEnter={handleAddStock}
                />
                <Button size="large" type="primary" onClick={handleAddStock} loading={loading}>
                  添加股票
                </Button>
              </Space.Compact>
              <Button
                size="large"
                type="default"
                block
                icon={<ReloadOutlined />}
                onClick={handleRefreshAll}
                loading={loading}
              >
                根据左侧参数，一键重新计算所有股票
              </Button>
              <Button danger onClick={clearLocalCache}>
                清除本地缓存
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Title level={4} style={{ margin: '0 0 4px 0' }}>我的股票池 ({stockPool.length}/50)</Title>
            <Text type="secondary" style={{ fontSize: '13px' }}>
              偏离率 = (当前股价 - 格雷厄姆股价) / 当前股价。正数代表当前股价偏高（红色），负数代表偏低（绿色）。
            </Text>
          </div>
          <Button
            icon={<SortAscendingOutlined />}
            onClick={handleSortByDeviation}
            disabled={displayRows.length < 2 || loading}
          >
            按偏离率排序
          </Button>
        </div>
        <Space align="center" style={{ marginBottom: 12 }} wrap>
          <Text type="secondary">公式：V = E × (5 + k × R) × (3.6 ÷ Y)</Text>
          <Space size="small">
            <Text>R 增长系数 (k)</Text>
            <InputNumber
              min={0.01}
              step={0.1}
              precision={2}
              aria-label="R 增长系数"
              value={getGrahamParams().rGrowthCoeff}
              onChange={handleRGrowthCoeffChange}
            />
          </Space>
        </Space>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayRows.map(r => r.stockCode)} strategy={verticalListSortingStrategy}>
            <Table
              className="graham-pool-table"
              dataSource={displayRows}
              columns={columns}
              rowKey="stockCode"
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="middle"
              components={{ header: { cell: ResizableHeaderCell }, body: { row: SortableRow } }}
              locale={{ emptyText: '暂无数据，请在上方添加股票' }}
            />
          </SortableContext>
        </DndContext>
        
        <div style={{ marginTop: 24, padding: 16, background: 'rgba(255, 255, 255, 0.02)', borderRadius: 8 }}>
          <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: 8, color: '#e2e8f0' }}>
            <InfoCircleOutlined style={{ marginRight: 6 }} />
            <strong style={{ color: '#f8fafc' }}>数据源标识说明：</strong>（系统会自动跨接口寻找最稳定的数据源并降级）
          </Text>
          <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: 6, marginLeft: 20 }}>
            • <Tag color="blue" style={{ border: 'none' }}>常规数据源</Tag>（如东方财富 / 巨潮资讯 / SEC Edgar / Yahoo 等）：代表主干网络顺畅，成功通过该主流接口获取到了最新的财务报表和最近收盘价。
          </Text>
          <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: 6, marginLeft: 20 }}>
            • <Tag color="blue" style={{ border: 'none' }}>行情兜底</Tag>：当常规数据源的收盘价接口未响应或遇到节假日/停牌时，自动触发的一套高级容错机制。系统会自动抓取历史 K 线数据的最近一个收盘价完成估值。
          </Text>
          <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginLeft: 20 }}>
            • <Tag color="error" style={{ border: 'none' }}>Mock</Tag>：当所有在线数据源均不可用时（如遭遇严厉拦截或断网），使用的本地内置模拟数据。此数据仅用于演示，不具备真实的投资参考价值。
          </Text>
        </div>
      </Card>
    </div>
  );
};
