import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { Form, Input, InputNumber, Button, Card, Table, Typography, Space, message, Alert, Tooltip, Row, Col, Modal } from 'antd';
import {
  InfoCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SortAscendingOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import axios from 'axios';
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
import {
  reorderStockPoolBySortedRows,
  sortValuationRowsByDeviationAsc,
} from '../utils/sortGrahamPoolByDeviation';
import { readStockPool, writeStockPool } from '../utils/grahamStockPool';
import { orderValuationRowsByPool } from '../utils/orderValuationRowsByPool';
import { DEFAULT_R_GROWTH_COEFF, recalcValuationPrices } from '../utils/grahamFormula';

const { Title, Text } = Typography;

export interface ValuationRow {
  stockCode: string;
  stockName: string;
  currentPrice: number;
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

  const [initialParams] = useState<GrahamFormValues>(() => {
    const saved = parseGrahamFormValues(localStorage.getItem('grahamGlobalParams'));
    if (saved) return saved;
    const currentYear = new Date().getFullYear();
    return { startYear: currentYear - 6, endYear: currentYear - 1, Y: 1.71, rGrowthCoeff: DEFAULT_R_GROWTH_COEFF };
  });

  const [newStockCode, setNewStockCode] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const persistStockPool = useCallback(
    (pool: string[]) => {
      writeStockPool(market, pool);
    },
    [market]
  );

  const getGrahamParams = useCallback((): GrahamFormValues => {
    const values = form.getFieldsValue();
    return {
      ...initialParams,
      ...values,
      rGrowthCoeff: values.rGrowthCoeff ?? initialParams.rGrowthCoeff ?? DEFAULT_R_GROWTH_COEFF,
    };
  }, [form, initialParams]);

  useEffect(() => {
    const pool = readStockPool(market);
    setStockPool(pool);
    setData([]);
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
    } = {}
  ): Promise<{ ok: boolean; rows: ValuationRow[]; errorMessage?: string }> => {
    const {
      isRefreshAll = false,
      refreshPolicy = 'default',
      marketOverride = market,
      orderPool,
    } = options;
    if (codes.length === 0) return { ok: true, rows: [] };
    try {
      setLoading(true);
      const params = getGrahamParams();
      const inputs = codes.map(code => ({
        stockCode: code,
        startYear: params.startYear,
        endYear: params.endYear,
        Y: params.Y,
        rGrowthCoeff: params.rGrowthCoeff,
        market: marketOverride,
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
      return { ok: true, rows };
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = axios.isAxiosError(error)
        ? (error.response?.data?.error || '请求失败，请检查网络')
        : '发生了未知错误';
      message.error(errorMessage);
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

    const normalizedCodes = codes.map(code =>
      market === 'us' ? code.trim().toUpperCase() : code.trim()
    );
    const duplicateCodes = normalizedCodes.filter(code => stockPool.includes(code));
    if (duplicateCodes.length === normalizedCodes.length) {
      message.info('该股票已在池中或输入无效');
      setNewStockCode('');
      return;
    }

    const pendingCodes = normalizedCodes.filter(code => !stockPool.includes(code));
    if (stockPool.length + pendingCodes.length > 50) {
      message.warning('股票池最多允许 50 只股票');
      return;
    }

    const nextPool = [...stockPool, ...pendingCodes];
    const result = await fetchValuations(pendingCodes, {
      refreshPolicy: 'default',
      orderPool: nextPool,
    });
    if (!result.ok) {
      return;
    }

    const succeeded = result.rows.filter(row => row.status === 'OK' || row.status === 'WARNING');
    const failed = result.rows.filter(row => row.status === 'ERROR');

    if (succeeded.length > 0) {
      const addedCodes = succeeded.map(row => row.stockCode);
      setStockPool(prev => {
        const next = [...prev, ...addedCodes];
        persistStockPool(next);
        return next;
      });
      setNewStockCode('');
      message.success(`已添加 ${addedCodes.join(', ')}`);
    }

    if (failed.length > 0) {
      message.error(failed.map(row => `${row.stockCode}: ${row.message}`).join('；'));
    } else if (succeeded.length === 0) {
      message.error('未能获取有效估值数据，股票未加入股票池');
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

  const handleSortByDeviation = () => {
    if (data.length < 2) {
      message.info('至少需要 2 只股票才能排序');
      return;
    }
    const sortableCount = data.filter(row => row.priceDeviationPercent != null).length;
    if (sortableCount < 2) {
      message.info('至少需要 2 只有效偏离率的股票才能排序');
      return;
    }
    const sortedRows = sortValuationRowsByDeviationAsc(data);
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
    const oldIndex = data.findIndex(r => r.stockCode === active.id);
    const newIndex = data.findIndex(r => r.stockCode === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedData = arrayMove(data, oldIndex, newIndex);
    const reorderedPool = reorderedData.map(r => r.stockCode);
    setData(reorderedData);
    setStockPool(reorderedPool);
    persistStockPool(reorderedPool);
  };

  const columns = useMemo(
    () => [
      {
        key: 'sort',
        width: 40,
        fixed: 'left' as const,
        render: () => <DragHandle />,
      },
      { title: '代码', dataIndex: 'stockCode', key: 'stockCode', fixed: 'left' as const, width: 80 },
      {
        title: '名称',
        dataIndex: 'stockName',
        key: 'stockName',
        fixed: 'left' as const,
        width: 90,
        render: (text: string) => <Text strong>{text || '-'}</Text>,
      },
      {
        title: '每股净资产',
        dataIndex: 'bvps',
        key: 'bvps',
        render: (v: number) => (v != null ? v.toFixed(2) : '-'),
      },
      { title: '现价', dataIndex: 'currentPrice', key: 'currentPrice', render: (v: number) => v?.toFixed(2) },
      {
        title: 'Beg. Adj. EPS',
        dataIndex: 'startEPS',
        key: 'startEPS',
        render: (v: number) => v?.toFixed(2),
      },
      {
        title: 'End. Adj. EPS',
        dataIndex: 'endEPS',
        key: 'endEPS',
        render: (v: number) => v?.toFixed(2),
      },
      {
        title: 'R(%)',
        dataIndex: 'R',
        key: 'R',
        render: (v: number) => (v != null ? v.toFixed(0) : '-'),
      },
      {
        title: 'Graham Price',
        dataIndex: 'grahamPrice',
        key: 'grahamPrice',
        render: (v: number) =>
          v != null ? <Text strong style={{ color: '#38bdf8' }}>{v.toFixed(2)}</Text> : '-',
      },
      {
        title: '偏离率',
        dataIndex: 'priceDeviationPercent',
        key: 'priceDeviationPercent',
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
        title: 'R=0 模拟',
        dataIndex: 'grahamPriceR0',
        key: 'grahamPriceR0',
        render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text>,
      },
      {
        title: 'R=3 模拟',
        dataIndex: 'grahamPriceR3',
        key: 'grahamPriceR3',
        render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text>,
      },
      {
        title: 'R=5 模拟',
        dataIndex: 'grahamPriceR5',
        key: 'grahamPriceR5',
        render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text>,
      },
      {
        title: 'ROE',
        dataIndex: 'roeLatest',
        key: 'roeLatest',
        render: (v: number) => (v != null ? `${v.toFixed(0)}%` : '-'),
      },
      {
        title: '状态',
        key: 'status',
        render: (_: unknown, r: ValuationRow) => {
          if (r.status === 'OK')
            return <Alert type="success" message="计算成功" showIcon style={{ padding: '0px 8px', fontSize: '12px' }} />;
          if (r.status === 'WARNING')
            return <Alert type="warning" message={r.message} showIcon style={{ padding: '0px 8px', fontSize: '12px' }} />;
          return <Alert type="error" message={r.message} showIcon style={{ padding: '0px 8px', fontSize: '12px' }} />;
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 60,
        fixed: 'right' as const,
        render: (_: unknown, r: ValuationRow) => (
          <Tooltip title="从股票池中移除">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveStock(r.stockCode)}
            />
          </Tooltip>
        ),
      },
    ],
    []
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
            disabled={data.length < 2 || loading}
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
          <SortableContext items={data.map(r => r.stockCode)} strategy={verticalListSortingStrategy}>
            <Table
              dataSource={data}
              columns={columns}
              rowKey="stockCode"
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="middle"
              components={{ body: { row: SortableRow } }}
              locale={{ emptyText: loading ? '正在加载...' : '暂无数据，请在上方添加股票' }}
            />
          </SortableContext>
        </DndContext>
      </Card>
    </div>
  );
};
