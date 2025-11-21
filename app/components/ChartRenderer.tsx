'use client';

import { QueryResult, VisualizationPlan } from '@/app/types/database';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  TooltipProps,
} from 'recharts';
import { 
  formatAxisLabel, 
  formatTooltipValue, 
  isDateValue,
  isCurrencyColumn,
} from '@/app/lib/utils/formatters';

interface ChartRendererProps {
  data: QueryResult;
  plan?: VisualizationPlan;
}

const COLORS = ['#98B1D3', '#4CB49C', '#F3C32B', '#FCE457', '#C6A17E', '#87776B'];
const GRID_COLOR = 'rgba(242,241,240,0.25)';
const TICK_COLOR = '#F2F1F0';
const tooltipStyle = {
  backgroundColor: '#2b2c34',
  borderRadius: '12px',
  border: '1px solid rgba(242,241,240,0.25)',
  color: '#fff',
};
const legendStyle = { color: '#F2F1F0' };

// Custom tooltip component with formatted values
const CustomTooltip = ({ active, payload, label, columnNames }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={tooltipStyle} className="p-3">
      <p className="mb-2 font-semibold">
        {payload[0]?.payload?.rawName 
          ? formatTooltipValue(payload[0].payload.rawName, columnNames?.[0])
          : label}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}: {formatTooltipValue(entry.value, entry.name)}
        </p>
      ))}
    </div>
  );
};

function detectChartType(data: QueryResult): 'line' | 'bar' | 'pie' | 'area' | 'table' {
  if (data.rows.length === 0) return 'table';
  
  // If we have exactly 2 columns, it's likely a simple key-value chart
  if (data.columns.length === 2) {
    const firstValue = data.rows[0]?.[data.columns[1]];
    
    // If second column is numeric, use bar chart
    if (typeof firstValue === 'number') {
      // Use pie if we have few rows (<= 10), bar otherwise
      return data.rows.length <= 10 ? 'pie' : 'bar';
    }
  }
  
  // If we have a date/time column, prefer line or area chart
  const dateColumns = data.columns.filter(col => {
    const sample = data.rows[0]?.[col];
    if (!sample) return false;
    const str = String(sample);
    return /^\d{4}-\d{2}-\d{2}/.test(str) || /date|time|timestamp/i.test(col);
  });
  
  if (dateColumns.length > 0) {
    // Check if we have numeric columns for y-axis
    const numericColumns = data.columns.filter(col => {
      if (dateColumns.includes(col)) return false;
      const sample = data.rows[0]?.[col];
      return typeof sample === 'number';
    });
    
    if (numericColumns.length > 0) {
      return 'line';
    }
  }
  
  // Default to bar chart for most cases
  return 'bar';
}

function prepareChartData(data: QueryResult, chartType: string) {
  if (data.rows.length === 0) return [];
  
  const xAxisKey = data.columns[0];
  
  // For simple 2-column data
  if (data.columns.length === 2 && chartType === 'pie') {
    return data.rows.map(row => {
      const rawName = row[data.columns[0]];
      return {
        name: formatAxisLabel(rawName, data.columns[0]),
        value: Number(row[data.columns[1]]) || 0,
        rawName, // Store raw value for tooltips
      };
    });
  }
  
  if (data.columns.length === 2) {
    return data.rows.map(row => {
      const rawName = row[data.columns[0]];
      return {
        name: formatAxisLabel(rawName, data.columns[0]),
        value: Number(row[data.columns[1]]) || 0,
        rawName, // Store raw value for tooltips
      };
    });
  }
  
  // For multi-column data, use first column as x-axis
  // and find numeric columns for y-axis
  const numericColumns = data.columns.slice(1).filter(col => {
    const sample = data.rows[0]?.[col];
    return typeof sample === 'number';
  });
  
  if (numericColumns.length === 0) {
    // No numeric columns, return as-is
    return data.rows.map(row => {
      const obj: Record<string, any> = {};
      data.columns.forEach(col => {
        obj[col] = row[col];
      });
      return obj;
    });
  }
  
  return data.rows.map(row => {
    const rawName = row[xAxisKey];
    const obj: Record<string, any> = {
      name: formatAxisLabel(rawName, xAxisKey),
      rawName, // Store raw value for tooltips
    };
    numericColumns.forEach(col => {
      obj[col] = Number(row[col]) || 0;
    });
    return obj;
  });
}

function prepareChartDataWithPlan(data: QueryResult, plan: VisualizationPlan) {
  if (data.rows.length === 0) return [];
  
  const xAxisColumn = plan.xAxis?.column || data.columns[0];
  const yAxisColumns = plan.yAxis?.columns || [data.columns[1]];
  
  // For pie charts, use simple name/value structure
  if (plan.chartType === 'pie') {
    return data.rows.map(row => {
      const rawName = row[xAxisColumn];
      return {
        name: formatAxisLabel(rawName, xAxisColumn),
        value: Number(row[yAxisColumns[0]]) || 0,
        rawName, // Store raw value for tooltips
      };
    });
  }
  
  // For other charts, map data according to plan
  return data.rows.map(row => {
    const rawName = row[xAxisColumn];
    const obj: Record<string, any> = {
      name: formatAxisLabel(rawName, xAxisColumn),
      rawName, // Store raw value for tooltips
    };
    yAxisColumns.forEach(col => {
      obj[col] = Number(row[col]) || 0;
    });
    return obj;
  });
}

export default function ChartRenderer({ data, plan }: ChartRendererProps) {
  if (data.rows.length === 0) {
    return (
      <div className="py-8 text-center text-white/60">
        No data available for visualization
      </div>
    );
  }

  // Use plan if available, otherwise fall back to heuristics
  const chartType = plan?.chartType || detectChartType(data);
  
  // Don't visualize if plan says not to
  if (plan && !plan.shouldVisualize) {
    return null;
  }
  
  // Skip visualization for 'none' or 'table' types
  if (chartType === 'none' || chartType === 'table') {
    return null;
  }

  // Prepare data with plan or fallback
  const chartData = plan 
    ? prepareChartDataWithPlan(data, plan)
    : prepareChartData(data, chartType);
  
  // Limit data for performance
  const displayData = chartData.slice(0, 50);
  const xAxisKey = plan?.xAxis?.column || data.columns[0];
  const numericColumns = plan?.yAxis?.columns || data.columns.slice(1).filter(col => {
    const sample = data.rows[0]?.[col];
    return typeof sample === 'number';
  });

  // Log reasoning if available
  if (plan?.reasoning) {
    console.log('[VIZ]', plan.reasoning);
  }

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={displayData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => {
              const pct = ((percent ?? 0) * 100).toFixed(0);
              const displayName = name ?? 'Unknown';
              // Truncate long names for labels
              const truncatedName = displayName.length > 15 ? displayName.substring(0, 12) + '...' : displayName;
              return `${truncatedName}: ${pct}%`;
            }}
            outerRadius={85}
            dataKey="value"
          >
            {displayData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip columnNames={data.columns} />} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    // Determine if Y-axis should be formatted as currency
    const yAxisIsCurrency = numericColumns.length > 0 
      ? isCurrencyColumn(numericColumns[0]) 
      : false;
    
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={displayData}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 12, fill: TICK_COLOR }}
          />
          <YAxis 
            tick={{ fill: TICK_COLOR }}
            tickFormatter={(value) => formatAxisLabel(value, numericColumns[0])}
          />
          <Tooltip content={<CustomTooltip columnNames={data.columns} />} />
          <Legend wrapperStyle={legendStyle} />
          {numericColumns.length > 0 ? (
            numericColumns.map((col, idx) => (
              <Line
                key={col}
                type="monotone"
                dataKey={col}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={COLORS[0]}
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={displayData}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis 
            dataKey="name" 
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 12, fill: TICK_COLOR }}
          />
          <YAxis 
            tick={{ fill: TICK_COLOR }}
            tickFormatter={(value) => formatAxisLabel(value, numericColumns[0])}
          />
          <Tooltip content={<CustomTooltip columnNames={data.columns} />} />
          <Legend wrapperStyle={legendStyle} />
          {numericColumns.length > 0 ? (
            numericColumns.map((col, idx) => (
              <Area
                key={col}
                type="monotone"
                dataKey={col}
                stroke={COLORS[idx % COLORS.length]}
                fill={COLORS[idx % COLORS.length]}
                fillOpacity={0.6}
              />
            ))
          ) : (
            <Area
              type="monotone"
              dataKey="value"
              stroke={COLORS[0]}
              fill={COLORS[0]}
              fillOpacity={0.6}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Default to bar chart
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={displayData}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
        <XAxis 
          dataKey="name" 
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 12, fill: TICK_COLOR }}
        />
        <YAxis 
          tick={{ fill: TICK_COLOR }}
          tickFormatter={(value) => formatAxisLabel(value, numericColumns[0])}
        />
        <Tooltip content={<CustomTooltip columnNames={data.columns} />} />
        <Legend wrapperStyle={legendStyle} />
        {numericColumns.length > 0 ? (
          numericColumns.map((col, idx) => (
            <Bar
              key={col}
              dataKey={col}
              fill={COLORS[idx % COLORS.length]}
            />
          ))
        ) : (
          <Bar dataKey="value" fill={COLORS[0]} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

