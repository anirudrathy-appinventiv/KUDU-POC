export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
}

export interface SchemaMetadata {
  tableName: string;
  columns: ColumnMetadata[];
}

export interface ColumnMetadata {
  columnName: string;
  dataType: string;
  isNullable: boolean;
}

export interface VisualizationPlan {
  chartType: 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'table' | 'none';
  xAxis?: {
    column: string;
    label: string;
    type: 'category' | 'time' | 'numeric';
    format?: {
      type: 'currency' | 'number' | 'percentage' | 'date' | 'count' | 'auto';
      currency?: string; // 'USD', 'EUR', etc.
      decimals?: number;
      dateFormat?: string; // 'YYYY-MM-DD', 'MM/DD/YYYY', etc.
      scale?: 'linear' | 'log' | 'sqrt';
    };
    visual?: {
      angle?: number; // -45, 0, 45, 90
      tickInterval?: number;
      maxLength?: number; // truncate labels
    };
  };
  yAxis?: {
    columns: string[];
    label: string;
    aggregation?: 'sum' | 'avg' | 'count' | 'none';
    format?: {
      type: 'currency' | 'number' | 'percentage' | 'date' | 'count' | 'auto';
      currency?: string;
      decimals?: number;
      scale?: 'linear' | 'log' | 'sqrt';
      min?: number;
      max?: number;
    };
    secondaryAxis?: {
      columns: string[];
      label: string;
      position?: 'left' | 'right';
      format?: {
        type: 'currency' | 'number' | 'percentage' | 'date' | 'count' | 'auto';
        currency?: string;
        decimals?: number;
        scale?: 'linear' | 'log' | 'sqrt';
        min?: number;
        max?: number;
      };
    };
  };
  groupBy?: string;
  title?: string;
  reasoning: string;
  shouldVisualize: boolean;
  styling?: {
    colors?: string[]; // Custom color palette
    theme?: 'light' | 'dark' | 'auto';
    gridLines?: boolean;
    legend?: {
      show: boolean;
      position?: 'top' | 'bottom' | 'left' | 'right';
    };
    tooltip?: {
      format?: 'full' | 'abbreviated' | 'custom';
      showPercentages?: boolean; // For pie charts
    };
  };
  dataTransform?: {
    sort?: {
      column: string;
      direction: 'asc' | 'desc';
    };
    filter?: {
      column: string;
      operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
      value: any;
    };
    limit?: number; // Max rows to display
    aggregate?: boolean;
  };
  insights?: {
    keyFindings?: string[]; // AI-generated insights
    annotations?: Array<{
      type: 'highlight' | 'note' | 'trend';
      value: any;
      label: string;
    }>;
    recommendations?: string[];
  };
  validation?: {
    requiredColumns: string[];
    minRows?: number;
    maxRows?: number;
    allowedTypes?: string[];
    warnings?: string[]; // AI-generated warnings
  };
  fallback?: {
    chartType: string;
    reasoning: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sqlQuery?: string;
  queryResult?: QueryResult;
  summary?: string;
  error?: string;
  visualizationPlan?: VisualizationPlan;
  topResults?: string[]; // Summary of top results for drill-down context
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area' | 'table';
  data: any[];
  xAxisKey?: string;
  yAxisKey?: string;
  labelKey?: string;
  valueKey?: string;
}

export interface ChatResponse {
  message: string;
  sqlQuery?: string;
  result?: QueryResult | null;
  summary?: string;
  chartData?: ChartData;
  visualizationPlan?: VisualizationPlan;
  error?: string;
}

export interface AnalysisSnapshot {
  id: string;
  timestamp: Date;
  userQuery: string;
  chatResponse: ChatResponse;
  messageId: string; // Reference to the assistant message ID
}

// Analytical query types
export type AnalyticalPattern = 
  | 'YOY_COMPARISON' 
  | 'MOM_COMPARISON' 
  | 'QOQ_COMPARISON'
  | 'ROLLING_AVERAGE' 
  | 'CUMULATIVE_SUM'
  | 'GROWTH_RATE'
  | 'TREND_ANALYSIS';

export interface QueryAnalysis {
  pattern: AnalyticalPattern | null;
  complexity: 'simple' | 'moderate' | 'complex';
  strategy: 'single' | 'cte' | 'multi-query';
  estimatedRows: number;
  timeoutRisk: 'low' | 'medium' | 'high';
  reasoning: string;
  detailLevel?: 'summary' | 'hourly' | 'detailed';
  dateRanges?: Array<{ start: string; end: string; label: string }>;
}

export interface SQLPlan {
  strategy: 'single' | 'cte' | 'multi-query';
  queries: string[];
  pattern: AnalyticalPattern | null;
  combineStrategy?: 'join' | 'union' | 'pivot' | 'calculate';
  description: string;
  analysis: QueryAnalysis;
}

export interface ExecutionResult {
  combinedResult: QueryResult;
  intermediateResults?: QueryResult[];
  calculatedMetrics?: Record<string, any>;
  executionTimeMs: number;
  queriesExecuted: number;
}

