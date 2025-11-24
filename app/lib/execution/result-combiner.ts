import { QueryResult, AnalyticalPattern } from '@/app/types/database';

/**
 * Formats numbers for display
 */
function formatNumber(value: number, decimals: number = 2): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Combines results from multiple queries for YoY comparison
 */
function combineYoYResults(results: QueryResult[]): QueryResult {
  if (results.length < 2) {
    return results[0];
  }

  // Assume first result is older period, second is newer period
  const olderResult = results[0];
  const newerResult = results[1];

  // Extract period labels from column names or use defaults
  const olderPeriod = extractPeriodFromColumns(olderResult.columns) || '2024';
  const newerPeriod = extractPeriodFromColumns(newerResult.columns) || '2025';

  // Find common grouping columns (non-metric columns)
  const groupingColumns = olderResult.columns.filter(col => 
    !isMetricColumn(col) && newerResult.columns.includes(col)
  );

  // Find metric columns
  const olderMetrics = olderResult.columns.filter(col => isMetricColumn(col));
  const newerMetrics = newerResult.columns.filter(col => isMetricColumn(col));

  // Create a map for quick lookup
  const olderMap = new Map<string, Record<string, any>>();
  olderResult.rows.forEach(row => {
    const key = groupingColumns.map(col => row[col]).join('|');
    olderMap.set(key, row);
  });

  const newerMap = new Map<string, Record<string, any>>();
  newerResult.rows.forEach(row => {
    const key = groupingColumns.map(col => row[col]).join('|');
    newerMap.set(key, row);
  });

  // Get all unique keys
  const allKeys = new Set([...olderMap.keys(), ...newerMap.keys()]);

  // Build combined rows
  const combinedRows: Record<string, any>[] = [];
  const metricName = olderMetrics[0] || 'value';
  const baseMetricName = metricName.replace(/_\d{4}.*$/, ''); // Remove year suffix if present

  allKeys.forEach(key => {
    const olderRow = olderMap.get(key);
    const newerRow = newerMap.get(key);
    
    const combinedRow: Record<string, any> = {};
    
    // Add grouping columns
    groupingColumns.forEach(col => {
      combinedRow[col] = olderRow?.[col] || newerRow?.[col];
    });

    // Add metrics for both periods
    const olderValue = olderRow?.[metricName] || 0;
    const newerValue = newerRow?.[metricName] || 0;

    combinedRow[`${baseMetricName}_${olderPeriod}`] = formatNumber(olderValue);
    combinedRow[`${baseMetricName}_${newerPeriod}`] = formatNumber(newerValue);
    combinedRow[`yoy_change`] = formatNumber(newerValue - olderValue);
    
    // Calculate percentage change
    if (olderValue !== 0) {
      combinedRow[`yoy_percent`] = formatNumber(((newerValue - olderValue) / olderValue) * 100);
    } else {
      combinedRow[`yoy_percent`] = null;
    }

    combinedRows.push(combinedRow);
  });

  // Sort by yoy_percent descending
  combinedRows.sort((a, b) => {
    const aVal = a.yoy_percent !== null ? a.yoy_percent : -Infinity;
    const bVal = b.yoy_percent !== null ? b.yoy_percent : -Infinity;
    return bVal - aVal;
  });

  // Build column list
  const combinedColumns = [
    ...groupingColumns,
    `${baseMetricName}_${olderPeriod}`,
    `${baseMetricName}_${newerPeriod}`,
    'yoy_change',
    'yoy_percent',
  ];

  return {
    columns: combinedColumns,
    rows: combinedRows.slice(0, 100), // Limit to 100 rows
    rowCount: combinedRows.length,
  };
}

/**
 * Combines results from multiple queries for MoM comparison
 */
function combineMoMResults(results: QueryResult[]): QueryResult {
  if (results.length < 2) {
    return results[0];
  }

  // Similar logic to YoY but for months
  // For simplicity, just return the CTE result if available, or stack results
  
  // If we have CTE result (single query with all months), return it
  if (results.length === 1) {
    return results[0];
  }

  // Otherwise, combine multiple month results
  const allRows: Record<string, any>[] = [];
  const baseColumns = results[0].columns.filter(col => !isMetricColumn(col));
  const metricColumns = results[0].columns.filter(col => isMetricColumn(col));

  results.forEach((result, index) => {
    result.rows.forEach(row => {
      const newRow: Record<string, any> = { ...row };
      // Add month identifier if not present
      if (!newRow.month && !newRow.date) {
        newRow.period_index = index + 1;
      }
      allRows.push(newRow);
    });
  });

  // Sort by month/date if available
  allRows.sort((a, b) => {
    if (a.month && b.month) {
      return new Date(b.month).getTime() - new Date(a.month).getTime();
    }
    if (a.date && b.date) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    return (b.period_index || 0) - (a.period_index || 0);
  });

  return {
    columns: results[0].columns,
    rows: allRows.slice(0, 100),
    rowCount: allRows.length,
  };
}

/**
 * Helper: Extract period label from column names
 */
function extractPeriodFromColumns(columns: string[]): string | null {
  for (const col of columns) {
    const match = col.match(/_(20\d{2})/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Helper: Determine if column is a metric (numeric aggregate)
 */
function isMetricColumn(columnName: string): boolean {
  const metricPatterns = [
    /sales/i,
    /revenue/i,
    /cost/i,
    /profit/i,
    /quantity/i,
    /amount/i,
    /total/i,
    /count/i,
    /sum/i,
    /avg/i,
    /average/i,
    /_\d{4}$/, // Ends with year
  ];
  return metricPatterns.some(pattern => pattern.test(columnName));
}

/**
 * Main function: Combines multiple query results based on pattern
 */
export function combineResults(
  results: QueryResult[],
  pattern: AnalyticalPattern | null
): QueryResult {
  if (results.length === 0) {
    throw new Error('No results to combine');
  }

  if (results.length === 1) {
    // Single result, no combination needed
    return results[0];
  }

  // Combine based on pattern
  switch (pattern) {
    case 'YOY_COMPARISON':
      return combineYoYResults(results);
    
    case 'MOM_COMPARISON':
    case 'QOQ_COMPARISON':
      return combineMoMResults(results);
    
    case 'ROLLING_AVERAGE':
    case 'CUMULATIVE_SUM':
    case 'TREND_ANALYSIS':
      // These patterns should use CTE single query, so just return first result
      return results[0];
    
    default:
      // Default: return first result
      return results[0];
  }
}

/**
 * Calculates additional metrics for display
 */
export function calculateMetrics(
  result: QueryResult,
  pattern: AnalyticalPattern | null
): Record<string, any> {
  const metrics: Record<string, any> = {};

  if (pattern === 'YOY_COMPARISON' || pattern === 'MOM_COMPARISON' || pattern === 'QOQ_COMPARISON') {
    // Calculate overall growth rate
    const growthColumns = result.columns.filter(col => 
      col.includes('_percent') || col.includes('percent')
    );
    
    if (growthColumns.length > 0 && result.rows.length > 0) {
      const growthValues = result.rows
        .map(row => row[growthColumns[0]])
        .filter((val): val is number => val !== null && typeof val === 'number');
      
      if (growthValues.length > 0) {
        const avgGrowth = growthValues.reduce((sum, val) => sum + val, 0) / growthValues.length;
        const maxGrowth = Math.max(...growthValues);
        const minGrowth = Math.min(...growthValues);
        
        metrics.averageGrowth = formatNumber(avgGrowth);
        metrics.maxGrowth = formatNumber(maxGrowth);
        metrics.minGrowth = formatNumber(minGrowth);
        metrics.positiveCount = growthValues.filter(v => v > 0).length;
        metrics.negativeCount = growthValues.filter(v => v < 0).length;
      }
    }
  }

  return metrics;
}


