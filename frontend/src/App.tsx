import React, { useState } from 'react';
import { Layout, Form, Input, Button, DatePicker, Select, Card, Table, Typography, Space, message, Radio } from 'antd';
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
  samplingRule: string;
  points: DataPoint[];
}

const App: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [displayMode, setDisplayMode] = useState<'both' | 'dividend' | 'price'>('both');

  const onFinish = async (values: any) => {
    try {
      setLoading(true);
      setData(null);
      const [start, end] = values.dateRange;
      const startDate = start.format('YYYY-MM-DD');
      const endDate = end.format('YYYY-MM-DD');

      const response = await axios.get(`/api/stocks/${values.stockCode}/history`, {
        params: {
          startDate,
          endDate,
          priceMode: values.priceMode,
          dividendMode: values.dividendMode
        }
      });
      setData(response.data);
    } catch (error: any) {
      console.error(error);
      message.error(error.response?.data?.error || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const combinedChartOption = data ? {
    title: { text: '股价与股息率综合走势图', left: 'center' },
    tooltip: { trigger: 'axis' },
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
        itemStyle: { color: '#91CC75' }
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

        {data && (
          <>
            <Card style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <Radio.Group value={displayMode} onChange={e => setDisplayMode(e.target.value)} optionType="button" buttonStyle="solid">
                  <Radio.Button value="dividend">只显示股息率</Radio.Button>
                  <Radio.Button value="price">只显示股价</Radio.Button>
                  <Radio.Button value="both">同时显示两者</Radio.Button>
                </Radio.Group>
              </div>
              <ReactECharts option={combinedChartOption} style={{ height: 500 }} />
            </Card>

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
