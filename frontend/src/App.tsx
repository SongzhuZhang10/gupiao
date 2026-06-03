import React, { useState } from 'react';
import { Layout, Form, Input, Button, DatePicker, Select, Card, Table, Typography, Space, message, Radio, Alert, Switch, Tag, Tooltip } from 'antd';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import dayjs from 'dayjs';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface DataPoint {
  week: string;
  sampleDate: string;
  price: number;
  dividendYield: number | null;
  dividendYieldMode: string;
}

interface ApiResponse {
  stockCode: string;
  startDate: string;
  endDate: string;
  dataSource?: string;
  sourceMetadata?: SourceMetadataSummary;
  warnings?: string[];
  samplingRule: string;
  points: DataPoint[];
}

interface SourceMetadataSummary {
  logical_source: string;
  access_layer: string;
  fallback_used: boolean;
  source_priority_rank: number;
  quality_flags?: string[];
}

export const SourceMetadataView: React.FC<{ metadata?: SourceMetadataSummary }> = ({ metadata }) => {
  if (!metadata) return null;

  const flags = metadata.quality_flags || [];

  return (
    <Space size={[8, 8]} wrap style={{ marginBottom: 16 }}>
      <Text strong>数据来源</Text>
      <Tag color="blue">{metadata.logical_source}</Tag>
      <Tooltip title="实际访问层">
        <Tag>{metadata.access_layer}</Tag>
      </Tooltip>
      <Tag color={metadata.fallback_used ? 'orange' : 'green'}>
        {metadata.fallback_used ? '已降级' : '首选源'}
      </Tag>
      <Tag>优先级 #{metadata.source_priority_rank}</Tag>
      {flags.map(flag => (
        <Tag key={flag} color={flag === 'needs_review' ? 'red' : 'default'}>
          {flag}
        </Tag>
      ))}
    </Space>
  );
};

const App: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [displayMode, setDisplayMode] = useState<'both' | 'dividend' | 'price'>('both');
  const [zonesData, setZonesData] = useState<any>(null);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const warningMessages = Array.from(new Set([
    ...(data?.warnings || []),
    ...((zonesData && zonesData.warnings) || [])
  ]));

  const onFinish = async (values: any) => {
    try {
      setLoading(true);
      setData(null);
      const [start, end] = values.dateRange;
      const startDate = start.format('YYYY-MM-DD');
      const endDate = end.format('YYYY-MM-DD');

      const historyReq = axios.get(`/api/stocks/${values.stockCode}/history`, {
        params: {
          startDate,
          endDate,
          priceMode: values.priceMode,
          dividendMode: values.dividendMode
        }
      });

      const zonesReq = axios.get(`/api/stocks/${values.stockCode}/dividend-yield-zones`, {
        params: {
          startDate,
          endDate,
          lookbackYears: values.lookbackYears,
          dividendBasis: 'pre_tax'
        }
      }).catch(err => {
        setZonesError(err.response?.data?.error || '获取操作区间数据失败');
        return null;
      });

      const [historyRes, zonesRes] = await Promise.all([historyReq, zonesReq]);
      setData(historyRes.data);
      if (zonesRes) {
        setZonesData(zonesRes.data);
        setZonesError(null);
      } else {
        setZonesData(null);
      }
    } catch (error: any) {
      console.error(error);
      message.error(error.response?.data?.error || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const combinedChartOption = data ? {
    title: { text: '股价与股息率综合走势图', left: 'center' },
    tooltip: {
      trigger: 'axis',
      formatter: function (params: any) {
        let result = `<div><b>${params[0].axisValue}</b></div>`;
        let priceStr = '';
        let divStr = '';
        const sampleMap = new Map();
        if (zonesData && zonesData.samples) {
          zonesData.samples.forEach((s: any) => sampleMap.set(s.date, s));
        }

        params.forEach((param: any) => {
          if (param.seriesName === '股价') {
            priceStr = `<div>${param.marker} 股价: ${param.value !== undefined ? param.value : '-'}</div>`;
          } else if (param.seriesName === '股息率') {
            const date = param.axisValue;
            const zoneSample = sampleMap.get(date);
            divStr = `<div>${param.marker} 股息率: ${param.value !== undefined ? param.value + '%' : '-'}</div>`;
            if (zoneSample) {
              divStr += `<div style="font-size:12px;color:#888">&nbsp;&nbsp;TTM 每股现金分红: ${zoneSample.ttmDividendPerShare}</div>`;
              divStr += `<div style="font-size:12px;color:#888">&nbsp;&nbsp;未复权收盘价: ${zoneSample.close}</div>`;
              const zoneLabel = zonesData.zones.find((z:any)=>z.id===zoneSample.zoneId)?.label || zoneSample.zoneId;
              divStr += `<div style="font-size:12px;color:#888">&nbsp;&nbsp;操作区间: ${zoneLabel}</div>`;
              divStr += `<div style="font-size:12px;color:#888">&nbsp;&nbsp;阈值: q20=${zonesData.quantiles.q20.toFixed(2)}%, q40=${zonesData.quantiles.q40.toFixed(2)}%, q60=${zonesData.quantiles.q60.toFixed(2)}%, q80=${zonesData.quantiles.q80.toFixed(2)}%</div>`;
            }
          }
        });
        return result + priceStr + divStr;
      }
    },
    legend: {
      show: true,
      selectedMode: false,
      left: 'left',
      top: 0,
      data: ['股价', '股息率'],
      selected: {
        '股价': displayMode === 'both' || displayMode === 'price',
        '股息率': displayMode === 'both' || displayMode === 'dividend'
      }
    },
    xAxis: {
      type: 'category',
      data: data.points.map(p => p.sampleDate),
      name: '日期'
    },
    yAxis: [
      {
        type: 'value',
        name: '价格 (元)',
        position: 'left',
        alignTicks: true,
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#5470C6' } }
      },
      {
        type: 'value',
        name: '收益率 (%)',
        position: 'right',
        alignTicks: true,
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#91CC75' } }
      }
    ],
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    toolbox: {
      feature: {
        saveAsImage: {}
      }
    },
    series: [
      {
        name: '股价',
        data: data.points.map(p => p.price),
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: '#5470C6' }
      },
      {
        name: '股息率',
        data: data.points.map(p => p.dividendYield),
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        connectNulls: false,
        itemStyle: { color: '#91CC75' },
        markArea: showZones && zonesData && !zonesError ? {
          silent: true,
          data: zonesData.zones.map((z: any) => {
            let color = '';
            if (z.id === 'strong_buy') color = 'rgba(0, 153, 76, 0.25)';
            else if (z.id === 'add') color = 'rgba(173, 255, 47, 0.25)';
            else if (z.id === 'hold') color = 'rgba(128, 128, 128, 0.15)';
            else if (z.id === 'reduce') color = 'rgba(255, 165, 0, 0.2)';
            else if (z.id === 'exit') color = 'rgba(255, 0, 0, 0.2)';
            return [
              { 
                yAxis: z.yMin !== null ? z.yMin : 'min', 
                itemStyle: { color }, 
                name: z.label, 
                label: { position: 'insideRight', color: 'rgba(0,0,0,0.4)', fontSize: 12 } 
              },
              { yAxis: z.yMax !== null ? z.yMax : 'max' }
            ];
          })
        } : undefined
      }
    ]
  } : {};

  const columns = [
    { title: '周次', dataIndex: 'week', key: 'week' },
    { title: '采样日期', dataIndex: 'sampleDate', key: 'sampleDate' },
    { title: '价格', dataIndex: 'price', key: 'price' },
    { title: '股息率 (%)', dataIndex: 'dividendYield', key: 'dividendYield', render: (val: any) => val ?? '-' }
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Header style={{ background: '#fff', padding: '0 24px' }}>
        <Title level={3} style={{ margin: '12px 0' }}>A股可视化仪表盘</Title>
      </Header>
      
      <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <Card style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              priceMode: 'forward',
              dividendMode: 'dv_ttm',
              dateRange: [dayjs('2010-01-01'), dayjs()]
            }}
          >
            <Space size="large" align="end" wrap>
              <Form.Item
                name="stockCode"
                label="股票代码"
                rules={[{ required: true, message: '请输入股票代码 (例如 600519)' }]}
              >
                <Input placeholder="例如 600519 或 600519.SH" style={{ width: 200 }} />
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

              <Form.Item name="priceMode" label="价格模式">
                <Select style={{ width: 150 }}>
                  <Select.Option value="unadjusted">不复权</Select.Option>
                  <Select.Option value="forward">前复权</Select.Option>
                  <Select.Option value="backward">后复权</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item name="dividendMode" label="股息率模式">
                <Select style={{ width: 150 }}>
                  <Select.Option value="dv_ratio">静态股息率</Select.Option>
                  <Select.Option value="dv_ttm">滚动股息率(TTM)</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>
                  分析
                </Button>
              </Form.Item>
            </Space>
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
            <Card style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <SourceMetadataView metadata={data.sourceMetadata} />
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
                <Alert message={zonesError} type="error" showIcon style={{ marginBottom: 16 }} />
              )}
              <ReactECharts option={combinedChartOption} style={{ height: 500 }} />
            </Card>

            {zonesData && (
              <Card style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24 }}>
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
                    { title: '区间', dataIndex: 'label', key: 'label' },
                    { title: '有效交易日', dataIndex: 'tradingDays', key: 'tradingDays' },
                    { title: '占总比', dataIndex: 'tradingDayRatio', key: 'tradingDayRatio', render: (v: number) => `${(v * 100).toFixed(2)}%` },
                    { title: '年均出现(天)', dataIndex: 'averageTradingDaysPerYear', key: 'averageTradingDaysPerYear' },
                    { title: '连续出现窗口数', dataIndex: 'occurrenceWindows', key: 'occurrenceWindows' },
                  ]}
                />
              </Card>
            )}

            <Card style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
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
      </Content>
    </Layout>
  );
};

export default App;
