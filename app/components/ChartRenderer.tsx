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
  formatAxisLabelWithPlan,
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
const CustomTooltip = ({ active, payload, label, columnNames, formatConfigs, primaryColumns, secondaryColumns }: any) => {
  if (!active || !payload || !payload.length) return null;

  const formatValue = (value: any, columnName?: string) => {
    // Determine which axis this column belongs to
    const isPrimaryColumn = primaryColumns?.includes(columnName);
    const isSecondaryColumn = secondaryColumns?.includes(columnName);
    
    // Use appropriate format config
    if (formatConfigs?.primary && isPrimaryColumn) {
      return formatAxisLabelWithPlan(value, formatConfigs.primary, columnName);
    } else if (formatConfigs?.secondary && isSecondaryColumn) {
      return formatAxisLabelWithPlan(value, formatConfigs.secondary, columnName);
    } else if (formatConfigs?.primary) {
      // Default to primary format if no specific axis is determined
      return formatAxisLabelWithPlan(value, formatConfigs.primary, columnName);
    }
    
    // Fallback to standard tooltip formatting
    return formatTooltipValue(value, columnName);
  };

  return (
    <div style={tooltipStyle} className="p-3">
      <p className="mb-2 font-semibold">
        {payload[0]?.payload?.rawName 
          ? formatValue(payload[0].payload.rawName, columnNames?.[0])
          : label}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}: {formatValue(entry.value, entry.name)}
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
  
  // Start with all rows
  let processedRows = [...data.rows];
  
  // Apply filtering if specified in plan
  if (plan.dataTransform?.filter) {
    // Note: Complex filtering would need more implementation
    // For now, we pass through all data
  }
  
  // Apply sorting if specified in plan
  if (plan.dataTransform?.sort) {
    const sortColumn = plan.dataTransform.sort.column;
    const sortDirection = plan.dataTransform.sort.direction || 'asc';
    
    processedRows = processedRows.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }
  
  // Apply limit if specified in plan
  if (plan.dataTransform?.limit) {
    processedRows = processedRows.slice(0, plan.dataTransform.limit);
  }
  
  // For pie charts, use simple name/value structure
  if (plan.chartType === 'pie') {
    return processedRows.map(row => {
      const rawName = row[xAxisColumn];
      return {
        name: formatAxisLabel(rawName, xAxisColumn),
        value: Number(row[yAxisColumns[0]]) || 0,
        rawName, // Store raw value for tooltips
      };
    });
  }
  
  // For other charts, map data according to plan
  return processedRows.map(row => {
    const rawName = row[xAxisColumn];
    
    // Special handling for day_of_month: keep as simple number, don't format as date
    let displayName: string;
    if (xAxisColumn.toLowerCase().includes('day_of_month') || xAxisColumn.toLowerCase() === 'day') {
      // For day_of_month, just show the number (1, 2, 3...)
      displayName = String(rawName);
    } else {
      displayName = formatAxisLabel(rawName, xAxisColumn);
    }
    
    const obj: Record<string, any> = {
      name: displayName,
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
  
  // Use plan's limit if available, otherwise default to 50 for performance
  const dataLimit = plan?.dataTransform?.limit || 50;
  const displayData = chartData.slice(0, dataLimit);
  
  const xAxisKey = plan?.xAxis?.column || data.columns[0];
  const numericColumns = plan?.yAxis?.columns || data.columns.slice(1).filter(col => {
    const sample = data.rows[0]?.[col];
    return typeof sample === 'number';
  });

  // Extract format configs from plan
  const yAxisFormat = plan?.yAxis?.format;
  const secondaryAxisFormat = plan?.yAxis?.secondaryAxis?.format;
  const yAxisColumn = numericColumns[0];
  
  // Create formatter functions that use plan format when available
  const formatYAxisValue = (value: any) => {
    if (yAxisFormat) {
      return formatAxisLabelWithPlan(value, yAxisFormat, yAxisColumn);
    }
    return formatAxisLabel(value, yAxisColumn);
  };
  
  const formatSecondaryYAxisValue = (value: any) => {
    if (secondaryAxisFormat) {
      const secondaryColumn = plan?.yAxis?.secondaryAxis?.columns?.[0];
      return formatAxisLabelWithPlan(value, secondaryAxisFormat, secondaryColumn);
    }
    return formatAxisLabel(value, numericColumns[1]);
  };

  // Determine if we have a secondary axis
  const hasSecondaryAxis = !!plan?.yAxis?.secondaryAxis;
  const primaryColumns = hasSecondaryAxis 
    ? numericColumns.filter(col => !plan?.yAxis?.secondaryAxis?.columns?.includes(col))
    : numericColumns;
  const secondaryColumns = hasSecondaryAxis 
    ? (plan?.yAxis?.secondaryAxis?.columns || [])
    : [];

  // Use custom colors from plan if available, otherwise use defaults
  const chartColors = plan?.styling?.colors || COLORS;
  
  // Use grid lines setting from plan if available, otherwise default to true
  const showGridLines = plan?.styling?.gridLines !== false;
  
  // Use legend settings from plan if available
  const showLegend = plan?.styling?.legend?.show !== false;
  const legendPosition = plan?.styling?.legend?.position || 'top';
  const legendWrapperStyle = {
    ...legendStyle,
    ...(legendPosition === 'bottom' && { paddingTop: '20px' }),
    ...(legendPosition === 'top' && { paddingBottom: '10px' }),
  };

  // Check if this is a day-of-month comparison (special handling)
  const isDayOfMonthComparison = xAxisKey.toLowerCase().includes('day_of_month') || 
                                  xAxisKey.toLowerCase() === 'day' ||
                                  (plan?.xAxis?.type === 'category' && plan?.xAxis?.label?.toLowerCase().includes('day of month'));

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
              <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip columnNames={data.columns} formatConfigs={{ primary: yAxisFormat }} primaryColumns={primaryColumns} secondaryColumns={secondaryColumns} />} />
          {showLegend && <Legend wrapperStyle={legendWrapperStyle} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={displayData}>
          {showGridLines && <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />}
          <XAxis 
            dataKey="name" 
            angle={isDayOfMonthComparison ? 0 : (plan?.xAxis?.visual?.angle ?? -45)}
            textAnchor={isDayOfMonthComparison ? "middle" : "end"}
            height={isDayOfMonthComparison ? 40 : 80}
            tick={{ fontSize: 12, fill: TICK_COLOR }}
          />
          <YAxis 
            yAxisId="left"
            orientation="left"
            tick={{ fill: TICK_COLOR }}
            tickFormatter={formatYAxisValue}
          />
          {hasSecondaryAxis && (
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fill: TICK_COLOR }}
              tickFormatter={formatSecondaryYAxisValue}
            />
          )}
          <Tooltip content={<CustomTooltip columnNames={data.columns} formatConfigs={{ primary: yAxisFormat, secondary: secondaryAxisFormat }} primaryColumns={primaryColumns} secondaryColumns={secondaryColumns} />} />
          {showLegend && <Legend wrapperStyle={legendWrapperStyle} />}
          {primaryColumns.length > 0 && primaryColumns.map((col, idx) => (
            <Line
              key={col}
              type="monotone"
              dataKey={col}
              stroke={chartColors[idx % chartColors.length]}
              strokeWidth={2}
              yAxisId="left"
            />
          ))}
          {secondaryColumns.length > 0 && secondaryColumns.map((col, idx) => (
            <Line
              key={col}
              type="monotone"
              dataKey={col}
              stroke={chartColors[(idx + primaryColumns.length) % chartColors.length]}
              strokeWidth={2}
              yAxisId="right"
            />
          ))}
          {numericColumns.length === 0 && (
            <Line
              type="monotone"
              dataKey="value"
              stroke={chartColors[0]}
              strokeWidth={2}
              yAxisId="left"
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
          {showGridLines && <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />}
          <XAxis 
            dataKey="name" 
            angle={isDayOfMonthComparison ? 0 : (plan?.xAxis?.visual?.angle ?? -45)}
            textAnchor={isDayOfMonthComparison ? "middle" : "end"}
            height={isDayOfMonthComparison ? 40 : 80}
            tick={{ fontSize: 12, fill: TICK_COLOR }}
          />
          <YAxis 
            yAxisId="left"
            orientation="left"
            tick={{ fill: TICK_COLOR }}
            tickFormatter={formatYAxisValue}
          />
          {hasSecondaryAxis && (
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fill: TICK_COLOR }}
              tickFormatter={formatSecondaryYAxisValue}
            />
          )}
          <Tooltip content={<CustomTooltip columnNames={data.columns} formatConfigs={{ primary: yAxisFormat, secondary: secondaryAxisFormat }} primaryColumns={primaryColumns} secondaryColumns={secondaryColumns} />} />
          {showLegend && <Legend wrapperStyle={legendWrapperStyle} />}
          {primaryColumns.length > 0 && primaryColumns.map((col, idx) => (
            <Area
              key={col}
              type="monotone"
              dataKey={col}
              stroke={chartColors[idx % chartColors.length]}
              fill={chartColors[idx % chartColors.length]}
              fillOpacity={0.6}
              yAxisId="left"
            />
          ))}
          {secondaryColumns.length > 0 && secondaryColumns.map((col, idx) => (
            <Area
              key={col}
              type="monotone"
              dataKey={col}
              stroke={chartColors[(idx + primaryColumns.length) % chartColors.length]}
              fill={chartColors[(idx + primaryColumns.length) % chartColors.length]}
              fillOpacity={0.6}
              yAxisId="right"
            />
          ))}
          {numericColumns.length === 0 && (
            <Area
              type="monotone"
              dataKey="value"
              stroke={chartColors[0]}
              fill={chartColors[0]}
              fillOpacity={0.6}
              yAxisId="left"
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
        {showGridLines && <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />}
        <XAxis 
          dataKey="name" 
          angle={isDayOfMonthComparison ? 0 : (plan?.xAxis?.visual?.angle ?? -45)}
          textAnchor={isDayOfMonthComparison ? "middle" : "end"}
          height={isDayOfMonthComparison ? 40 : 80}
          tick={{ fontSize: 12, fill: TICK_COLOR }}
        />
        <YAxis 
          yAxisId="left"
          orientation="left"
          tick={{ fill: TICK_COLOR }}
          tickFormatter={formatYAxisValue}
        />
        {hasSecondaryAxis && (
          <YAxis 
            yAxisId="right"
            orientation="right"
            tick={{ fill: TICK_COLOR }}
            tickFormatter={formatSecondaryYAxisValue}
          />
        )}
        <Tooltip content={<CustomTooltip columnNames={data.columns} formatConfigs={{ primary: yAxisFormat, secondary: secondaryAxisFormat }} primaryColumns={primaryColumns} secondaryColumns={secondaryColumns} />} />
        {showLegend && <Legend wrapperStyle={legendWrapperStyle} />}
        {primaryColumns.length > 0 && primaryColumns.map((col, idx) => (
          <Bar
            key={col}
            dataKey={col}
            fill={chartColors[idx % chartColors.length]}
            yAxisId="left"
          />
        ))}
        {secondaryColumns.length > 0 && secondaryColumns.map((col, idx) => (
          <Bar
            key={col}
            dataKey={col}
            fill={chartColors[(idx + primaryColumns.length) % chartColors.length]}
            yAxisId="right"
          />
        ))}
        {numericColumns.length === 0 && (
          <Bar dataKey="value" fill={chartColors[0]} yAxisId="left" />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

