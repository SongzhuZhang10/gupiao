import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Card, Table, Typography, Space, message, Alert, Tooltip, Row, Col } from 'antd';
import { InfoCircleOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

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
  grahamPriceR3?: number;
  grahamPriceR5?: number;
  grahamPriceR7?: number;
  roeLatest?: number;
  dataAsOfDate: string;
  status: 'OK' | 'ERROR' | 'WARNING';
  message: string;
}

interface GrahamFormValues {
  startYear: number;
  endYear: number;
  Y: number;
}

const cardStyle: React.CSSProperties = {
  background: '#111827',
  borderColor: '#243244',
  borderRadius: 8,
  boxShadow: '0 18px 38px rgba(0,0,0,0.28)',
};

export const GrahamValuation: React.FC = () => {
  const [form] = Form.useForm<GrahamFormValues>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ValuationRow[]>([]);
  
  const [stockPool, setStockPool] = useState<string[]>(() => {
    const savedPool = localStorage.getItem('grahamStockPool');
    if (savedPool) {
      try {
        return JSON.parse(savedPool);
      } catch (e) { console.error(e); }
    }
    return [];
  });

  const [initialParams] = useState<GrahamFormValues>(() => {
    const savedParams = localStorage.getItem('grahamGlobalParams');
    if (savedParams) {
      try {
        return JSON.parse(savedParams);
      } catch (e) { console.error(e); }
    }
    const currentYear = new Date().getFullYear();
    return { startYear: currentYear - 6, endYear: currentYear - 1, Y: 1.71 };
  });

  const [newStockCode, setNewStockCode] = useState('');

  // 移除了引起警告的挂载时 useEffect
  
  // 挂载时自动拉取缓存股票池的数据
  useEffect(() => {
    if (stockPool.length > 0) {
      fetchValuations(stockPool, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('grahamStockPool', JSON.stringify(stockPool));
  }, [stockPool]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleValuesChange = (_: any, allValues: GrahamFormValues) => {
    localStorage.setItem('grahamGlobalParams', JSON.stringify(allValues));
  };

  const fetchValuations = async (codes: string[], isRefreshAll = false) => {
    if (codes.length === 0) return;
    try {
      setLoading(true);
      const params = form.getFieldsValue();
      const inputs = codes.map((code) => ({
        stockCode: code,
        startYear: params.startYear,
        endYear: params.endYear,
        Y: params.Y,
      }));

      const res = await axios.post('/api/graham/evaluate', { inputs });
      
      setData(prev => {
        const newData = isRefreshAll ? [] : [...prev];
        res.data.rows.forEach((newRow: ValuationRow) => {
          const idx = newData.findIndex(r => r.stockCode === newRow.stockCode);
          if (idx !== -1) {
            newData[idx] = newRow;
          } else {
            newData.push(newRow);
          }
        });
        return newData;
      });
      if (isRefreshAll) message.success('全部刷新完成');
    } catch (error: unknown) {
      console.error(error);
      if (axios.isAxiosError(error)) {
        message.error(error.response?.data?.error || '请求失败，请检查网络');
      } else {
        message.error('发生了未知错误');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async () => {
    const codes = newStockCode.split(',').map(s => s.trim()).filter(Boolean);
    if (!codes.length) return;
    
    const updatedPool = [...stockPool];
    const addedCodes: string[] = [];
    
    for (const code of codes) {
      if (!updatedPool.includes(code)) {
        if (updatedPool.length >= 50) {
          message.warning('股票池最多允许 50 只股票');
          break;
        }
        updatedPool.push(code);
        addedCodes.push(code);
      }
    }
    
    if (addedCodes.length > 0) {
      setStockPool(updatedPool);
      setNewStockCode('');
      await fetchValuations(addedCodes, false);
      message.success(`已添加 ${addedCodes.join(', ')}`);
    } else {
      message.info('该股票已在池中或输入无效');
      setNewStockCode('');
    }
  };

  const handleRefreshAll = () => {
    if (stockPool.length === 0) {
      message.info('请先添加股票');
      return;
    }
    fetchValuations(stockPool, true);
  };

  const handleRemoveStock = (code: string) => {
    setStockPool(prev => prev.filter(c => c !== code));
    setData(prev => prev.filter(r => r.stockCode !== code));
  };

  const columns = [
    { title: '代码', dataIndex: 'stockCode', key: 'stockCode', fixed: 'left' as const, width: 80 },
    { title: '名称', dataIndex: 'stockName', key: 'stockName', fixed: 'left' as const, width: 90, render: (text: string) => <Text strong>{text || '-'}</Text> },
    { title: '现价', dataIndex: 'currentPrice', key: 'currentPrice', render: (v: number) => v?.toFixed(2) },
    { 
      title: '初年扣非EPS',
      dataIndex: 'startEPS', 
      key: 'startEPS', 
      render: (v: number) => v?.toFixed(2) 
    },
    { 
      title: (
        <Space size="small">
          末年扣非EPS
          <Tooltip title="正常化每股收益，即结束年份的扣非每股收益。"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip>
        </Space>
      ),
      dataIndex: 'endEPS', 
      key: 'endEPS', 
      render: (v: number) => v?.toFixed(2) 
    },
    { 
      title: (
        <Space size="small">
          R(%)
          <Tooltip title="基于起止年份扣非EPS计算的年均盈利增长率。"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip>
        </Space>
      ), 
      dataIndex: 'R', 
      key: 'R', 
      render: (v: number) => v != null ? `${v.toFixed(0)}%` : '-' 
    },
    { 
      title: (
        <Space size="small">
          格雷厄姆股价
          <Tooltip title="公式内在价值 V = E × (8.5 + 2R) × (4.4 ÷ Y)"><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip>
        </Space>
      ), 
      dataIndex: 'grahamPrice', 
      key: 'grahamPrice', 
      render: (v: number) => v != null ? <Text strong style={{ color: '#38bdf8' }}>{v.toFixed(2)}</Text> : '-' 
    },
    { 
      title: '偏离率', 
      dataIndex: 'priceDeviationPercent', 
      key: 'priceDeviationPercent', 
      render: (v: number) => {
        if (v == null) return '-';
        const color = v > 0 ? '#ef4444' : '#10b981';
        return <span style={{ color, fontWeight: 500 }}>{v > 0 ? '+' : ''}{v.toFixed(0)}%</span>;
      }
    },
    { title: 'R=3 模拟', dataIndex: 'grahamPriceR3', key: 'grahamPriceR3', render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text> },
    { title: 'R=5 模拟', dataIndex: 'grahamPriceR5', key: 'grahamPriceR5', render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text> },
    { title: 'R=7 模拟', dataIndex: 'grahamPriceR7', key: 'grahamPriceR7', render: (v: number) => <Text type="secondary">{v?.toFixed(2)}</Text> },
    { title: 'ROE', dataIndex: 'roeLatest', key: 'roeLatest', render: (v: number) => v != null ? `${v.toFixed(0)}%` : '-' },
    { 
      title: '状态', 
      key: 'status',
      render: (_: unknown, r: ValuationRow) => {
        if (r.status === 'OK') return <Alert type="success" message="计算成功" showIcon style={{ padding: '0px 8px', fontSize: '12px' }} />;
        if (r.status === 'WARNING') return <Alert type="warning" message={r.message} showIcon style={{ padding: '0px 8px', fontSize: '12px' }} />;
        return <Alert type="error" message={r.message} showIcon style={{ padding: '0px 8px', fontSize: '12px' }} />;
      }
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
      )
    }
  ];

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        {/* 参数设置卡片 */}
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
                    label="开始年份"
                    rules={[{ required: true, message: '必填' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber precision={0} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="endYear"
                    label="结束年份"
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
            </Form>
          </Card>
        </Col>

        {/* 股票管理卡片 */}
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
                  placeholder="输入股票代码，如 600519，支持逗号分隔" 
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
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <Title level={4} style={{ margin: '0 0 4px 0' }}>我的股票池 ({data.length}/50)</Title>
            <Text type="secondary" style={{ fontSize: '13px' }}>
              偏离率 = (当前股价 - 格雷厄姆股价) / 当前股价。正数代表当前股价偏高（红色），负数代表偏低（绿色）。
            </Text>
          </div>
        </div>
        <Table 
          dataSource={data} 
          columns={columns} 
          rowKey="stockCode"
          pagination={false}
          scroll={{ x: 'max-content' }}
          size="middle"
          locale={{ emptyText: loading ? '正在加载...' : '暂无数据，请在上方添加股票' }}
        />
      </Card>
    </div>
  );
};
