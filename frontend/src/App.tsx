import React, { useEffect, useState } from 'react';
import { Layout, Form, Input, InputNumber, Button, DatePicker, Select, Card, Table, Typography, Space, message, Radio, Alert, Switch, Tag, Tooltip, Collapse, Modal, ConfigProvider, theme, Tabs, Segmented } from 'antd';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import { GrahamValuation } from './components/GrahamValuation';

axios.defaults.baseURL = 'http://localhost:3000';

import dayjs from 'dayjs';
import {
  buildCombinedChartOption,
  type ApiResponse,
  type DisplayMode,
  type DividendYieldZoneResponse,
} from './chartOptions';
import { useMarket } from './context/MarketContext';
import { checkBackendHealth } from './utils/backendHealth';
import {
  isValidStockCode,
  stockCodeErrorForMarket,
  stockCodePlaceholderForMarket,
} from './utils/stock';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const ALL_FREE_SOURCES_UNAVAILABLE = '所有免费数据源均不可用';
const appTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorBgBase: '#0b1120',
    colorBgContainer: '#111827',
    colorBgElevated: '#172033',
    colorBorder: '#243244',
    colorPrimary: '#38bdf8',
    colorTextBase: '#e5e7eb',
    colorTextSecondary: '#94a3b8',
    borderRadius: 8,
  },
};

const cardStyle: React.CSSProperties = {
  background: '#111827',
  borderColor: '#243244',
  borderRadius: 8,
  boxShadow: '0 18px 38px rgba(0,0,0,0.28)',
};

const sourceNameMap: Record<string, string> = {
  sohu: '搜狐财经',
  sina: '新浪财经',
  eastmoney: '东方财富',
  cninfo: '巨潮资讯',
  baostock: 'Baostock开源数据',
  akshare_generic: 'AKShare开源数据',
  tushare: 'Tushare免费数据',
  yahoo: 'Yahoo Finance',
  mock: '本地模拟数据',
};

function formatZoneLabel(zoneId: string, label: string): string {
  return zoneId === 'exit' ? '清仓区' : label;
}

export const SourceMetadataView: React.FC<{ 
  priceSource?: string;
  dividendSource?: string;
}> = ({ priceSource, dividendSource }) => {
  if (!priceSource) return null;

  const getSourceName = (s: string) => sourceNameMap[s] || s;

  if (dividendSource && priceSource !== dividendSource) {
    return (
      <Space size={[4, 4]}>
        <Tag color={priceSource === 'mock' ? 'error' : 'purple'} style={{ border: 'none', borderRadius: 4 }}>
          价格源: {getSourceName(priceSource)}
        </Tag>
        <Tag color={dividendSource === 'mock' ? 'error' : 'cyan'} style={{ border: 'none', borderRadius: 4 }}>
          分红源: {getSourceName(dividendSource)}
        </Tag>
      </Space>
    );
  }

  return (
    <Tag color={priceSource === 'mock' ? 'error' : 'blue'} style={{ border: 'none', borderRadius: 4 }}>
      数据源: {getSourceName(priceSource)}
    </Tag>
  );
};

const App: React.FC = () => {
  const { market, setMarket, marketLabel } = useMarket();
  const [form] = Form.useForm();
  const priceMode = Form.useWatch('priceMode', form) || 'forward';
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [zonesData, setZonesData] = useState<DividendYieldZoneResponse | null>(null);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkBackendHealth().then(ok => {
      if (!cancelled) setBackendOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const warningMessages = Array.from(new Set([
    ...(data?.warnings || []),
    ...((zonesData && zonesData.warnings) || [])
  ]));

  const clearAnalysis = () => {
    setData(null);
    setZonesData(null);
    setZonesError(null);
  };

  useEffect(() => {
    clearAnalysis();
    form.setFieldValue('stockCode', undefined);
  }, [market, form]);

  const fetchAnalysis = async (values: any, allowMockFallback: boolean) => {
    try {
      setLoading(true);
      clearAnalysis();
      const [start, end] = values.dateRange;
      const startDate = start.format('YYYY-MM-DD');
      const endDate = end.format('YYYY-MM-DD');
      const cacheTtlHours = values.cacheTtlHours ?? 24;

      const historyRes = await axios.get(`/api/stocks/${values.stockCode}/history`, {
        params: {
          startDate,
          endDate,
          priceMode: values.priceMode,
          dividendMode: values.dividendMode,
          allowMockFallback,
          cacheTtlHours,
          market,
          dataSourceOverride: values.dataSourceOverride || undefined,
        }
      });

      const zonesRes = await axios.get(`/api/stocks/${values.stockCode}/dividend-yield-zones`, {
        params: {
          startDate,
          endDate,
          lookbackYears: values.lookbackYears,
          dividendBasis: 'pre_tax',
          allowMockFallback,
          cacheTtlHours,
          market,
          dataSourceOverride: values.dataSourceOverride || undefined,
        }
      }).catch(err => {
        setZonesError(err.response?.data?.error || '获取操作区间数据失败');
        return null;
      });

      setData(historyRes.data);
      if (zonesRes) {
        setZonesData(zonesRes.data);
        setZonesError(null);
      } else {
        setZonesData(null);
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.response?.data?.error;
      if (!allowMockFallback && errorMessage === ALL_FREE_SOURCES_UNAVAILABLE) {
        Modal.confirm({
          title: ALL_FREE_SOURCES_UNAVAILABLE,
          content: '是否使用 Mock 数据绘制图表？Mock 数据仅用于演示，不能代表真实市场行情。',
          okText: '使用 Mock 数据',
          cancelText: '保持空白',
          onOk: () => fetchAnalysis(values, true),
          onCancel: clearAnalysis,
        });
      } else {
        message.error(errorMessage || '获取数据失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const onFinish = (values: any) => {
    fetchAnalysis(values, false);
  };

  const clearLocalCache = () => {
    Modal.confirm({
      title: '清除本地缓存',
      content: '确定要删除后端本地股票数据缓存吗？之后再次查询会重新请求外部数据源。',
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

  const combinedChartOption = data ? buildCombinedChartOption({
    data,
    zonesData,
    displayMode,
    showZones,
    zonesError,
  }) : {};

  const columns = [
    { title: '周次', dataIndex: 'week', key: 'week' },
    { title: '采样日期', dataIndex: 'sampleDate', key: 'sampleDate' },
    { title: '价格', dataIndex: 'price', key: 'price' },
    { title: '股息率 (%)', dataIndex: 'dividendYield', key: 'dividendYield', render: (val: number | null) => val ?? '-' }
  ];
  const priceModeLabels: Record<string, string> = {
    unadjusted: '不复权',
    forward: '前复权',
    backward: '后复权',
  };

  const dividendYieldTabContent = (
    <>
      <Card style={{ ...cardStyle, marginBottom: 24 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            priceMode: 'forward',
            dividendMode: 'dv_ttm',
            cacheTtlHours: 24,
            dateRange: [dayjs('2010-01-01'), dayjs()]
          }}
        >
          <Space size="large" align="end" wrap style={{ width: '100%' }}>
            <Form.Item
              name="stockCode"
              label="股票代码"
              rules={[
                { required: true, message: `请输入股票代码 (${stockCodePlaceholderForMarket(market)})` },
                {
                  validator: (_, value) => (
                    !value || isValidStockCode(value, market)
                      ? Promise.resolve()
                      : Promise.reject(new Error(stockCodeErrorForMarket(market)))
                  ),
                },
              ]}
            >
              <Input placeholder={stockCodePlaceholderForMarket(market)} style={{ width: 200 }} />
            </Form.Item>

            <Form.Item
              name="dateRange"
              label="日期范围"
              rules={[{ required: true, message: '请选择日期范围' }]}
            >
              <RangePicker style={{ width: 280 }} />
            </Form.Item>

            <Form.Item name="lookbackYears" label="分位数窗口" initialValue={10}>
              <Select style={{ width: 100 }}>
                {[5,6,7,8,9,10].map(y => <Select.Option key={y} value={y}>{y} 年</Select.Option>)}
              </Select>
            </Form.Item>

            <Form.Item name="dividendMode" label="股息率模式">
              <Select style={{ width: 150 }}>
                <Select.Option value="dv_ratio">静态股息率</Select.Option>
                <Select.Option value="dv_ttm">滚动股息率(TTM)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="dataSourceOverride" label="行情与分红数据源" initialValue="">
              <Select style={{ width: 160 }}>
                <Select.Option value="">自动 (东方财富优先)</Select.Option>
                {market === 'cn' ? (
                  <>
                    <Select.Option value="eastmoney">东方财富</Select.Option>
                    <Select.Option value="sina">新浪财经</Select.Option>
                    <Select.Option value="akshare_generic">AKShare</Select.Option>
                    <Select.Option value="baostock">Baostock</Select.Option>
                    <Select.Option value="cninfo">巨潮资讯</Select.Option>
                    <Select.Option value="tushare">Tushare</Select.Option>
                    <Select.Option value="sohu">搜狐财经</Select.Option>
                  </>
                ) : (
                  <>
                    <Select.Option value="yahoo">Yahoo Finance</Select.Option>
                  </>
                )}
              </Select>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                分析
              </Button>
            </Form.Item>

            <Form.Item>
              <Button danger onClick={clearLocalCache}>
                清除本地缓存
              </Button>
            </Form.Item>
          </Space>
          <div style={{ marginTop: 4 }}>
            <Collapse
              bordered={false}
              size="small"
              items={[
                {
                  key: 'advanced',
                  label: '高级选项',
                  extra: <Text type="secondary">股价显示：{priceModeLabels[priceMode]}</Text>,
                  children: (
                    <Space size="large" align="start" wrap>
                      <Form.Item
                        name="priceMode"
                        label={
                          <Tooltip title="仅影响股价走势图，股息率始终按不复权收盘价计算。">
                            <span>股价显示模式</span>
                          </Tooltip>
                        }
                        style={{ marginBottom: 0 }}
                      >
                        <Select style={{ width: 150 }}>
                          <Select.Option value="forward">前复权</Select.Option>
                          <Select.Option value="unadjusted">不复权</Select.Option>
                          <Select.Option value="backward">后复权</Select.Option>
                        </Select>
                      </Form.Item>
                      <Text type="secondary" style={{ maxWidth: 420, lineHeight: 1.8 }}>
                        仅影响股价走势图，股息率始终按不复权收盘价计算。
                      </Text>
                      <Form.Item
                        name="cacheTtlHours"
                        label="缓存有效期"
                        style={{ marginBottom: 0 }}
                        rules={[
                          { type: 'number', min: 1, message: '缓存有效期至少为 1 小时' },
                        ]}
                      >
                        <InputNumber min={1} precision={0} addonAfter="小时" style={{ width: 150 }} />
                      </Form.Item>
                    </Space>
                  ),
                },
              ]}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              仅影响股价走势图，股息率始终按不复权收盘价计算。
            </Text>
          </div>
        </Form>
      </Card>

      {warningMessages.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {warningMessages.map((w: string, i: number) => (
            <Alert key={i} message={w} type="warning" showIcon style={{ marginBottom: 8 }} />
          ))}
        </div>
      )}

      {data && (
        <>
          <Card 
            title={
              <Space align="center" size="middle">
                <span style={{ fontSize: 16, fontWeight: 500 }}>行情走势与操作区间 - {data.stockCode}</span>
                <SourceMetadataView 
                  priceSource={data.dataSource} 
                  dividendSource={zonesData?.dataSource} 
                />
              </Space>
            }
            style={{ ...cardStyle, marginBottom: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ marginRight: 8, fontWeight: 500 }}>彩色区间背景:</span>
                <Switch checked={showZones} onChange={setShowZones} disabled={!!zonesError} />
              </div>
              <Radio.Group value={displayMode} onChange={e => setDisplayMode(e.target.value)} optionType="button" buttonStyle="solid">
                <Radio.Button value="dividend">只显示股息率</Radio.Button>
                <Radio.Button value="price">只显示股价</Radio.Button>
                <Radio.Button value="both">同时显示两者</Radio.Button>
              </Radio.Group>
            </div>
            {zonesError && (
              <Alert 
                message={
                  (data?.sourceMetadata?.logical_source === 'mock' || data?.dataSource === 'mock')
                    ? `${zonesError} (注：当前展示的走势图使用的是 Mock 模拟数据)`
                    : zonesError.includes('无法获取股价数据')
                      ? `操作区间计算失败：无法获取足够长期的股价数据（如10年历史），因此无法计算股息率分位数区间。但当前查询的较短时间段走势图成功获取了真实数据，并已正常展示。`
                      : `${zonesError} (注：当前走势图使用的是真实数据)`
                } 
                type="error" 
                showIcon 
                style={{ marginBottom: 16 }} 
              />
            )}
            <ReactECharts option={combinedChartOption} style={{ height: 500, background: '#0f172a', borderRadius: 8 }} />
          </Card>

          {zonesData && (
            <Card style={{ ...cardStyle, marginBottom: 24 }}>
              <Title level={4}>股息率操作区间统计</Title>
              <Text type="secondary">
                阈值计算窗口: {zonesData.thresholdWindowStart} 到 {zonesData.thresholdWindowEnd}
                &nbsp;|&nbsp;
                有效样本数: {zonesData.samples.length} 交易日
                &nbsp;|&nbsp;
                阈值: q20={zonesData.quantiles.q20.toFixed(2)}%, q40={zonesData.quantiles.q40.toFixed(2)}%, q60={zonesData.quantiles.q60.toFixed(2)}%, q80={zonesData.quantiles.q80.toFixed(2)}%
              </Text>
              <Table
                dataSource={zonesData.stats}
                rowKey="zoneId"
                pagination={false}
                style={{ marginTop: 16 }}
                columns={[
                  { title: '区间', dataIndex: 'label', key: 'label', render: (label: string, row: { zoneId: string }) => formatZoneLabel(row.zoneId, label) },
                  { title: '有效交易日', dataIndex: 'tradingDays', key: 'tradingDays' },
                  { title: '占总比', dataIndex: 'tradingDayRatio', key: 'tradingDayRatio', render: (v: number) => `${(v * 100).toFixed(2)}%` },
                  { title: '年均出现(天)', dataIndex: 'averageTradingDaysPerYear', key: 'averageTradingDaysPerYear' },
                  { title: '连续出现窗口数', dataIndex: 'occurrenceWindows', key: 'occurrenceWindows' },
                ]}
              />
            </Card>
          )}

          <Card style={cardStyle}>
            <Title level={4}>数据表格</Title>
            <Text type="secondary">股票: {data.stockCode} | 采样规则: {data.samplingRule}</Text>
            <Table 
              dataSource={data.points} 
              columns={columns} 
              rowKey="week" 
              pagination={{ pageSize: 10 }}
              style={{ marginTop: 16 }}
            />
          </Card>
        </>
      )}
    </>
  );

  return (
    <ConfigProvider theme={appTheme}>
      <Layout className="app-shell" style={{ minHeight: '100vh', background: '#0b1120' }}>
      <Header style={{ background: '#0f172a', borderBottom: '1px solid #243244', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <Title level={3} style={{ margin: '12px 0', color: '#f8fafc' }}>{marketLabel}可视化仪表盘</Title>
          <Segmented
            value={market}
            onChange={(value) => setMarket(value as typeof market)}
            options={[
              { label: 'A股', value: 'cn' },
              { label: '美股', value: 'us' },
            ]}
          />
        </div>
      </Header>
      
      <Content style={{ padding: '24px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
        {backendOk === false && (
          <Alert
            type="error"
            showIcon
            message="无法连接后端服务"
            description="请在项目根目录运行 npm run dev 或 npm run dev:backend，然后刷新页面。打包版 Electron 应用会在启动时自动拉起后端。"
            style={{ marginBottom: 16 }}
          />
        )}
        <Tabs
          defaultActiveKey="1" 
          items={[
            {
              key: '1',
              label: '格雷厄姆估值',
              children: <GrahamValuation />,
            },
            {
              key: '2',
              label: '股息率分析',
              children: dividendYieldTabContent,
            },
          ]} 
        />
      </Content>
    </Layout>
    </ConfigProvider>
  );
};

export default App;
