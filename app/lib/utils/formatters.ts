/**
 * Formatting utilities for chart axes and data display
 */

/**
 * Detects if a value is a date (ISO string or Date object)
 */
export function isDateValue(value: any): boolean {
  if (!value) return false;
  
  // Check if it's a Date object
  if (value instanceof Date) return true;
  
  // Check if it's an ISO date string
  if (typeof value === 'string') {
    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (isoRegex.test(value)) return true;
    
    // Date-only format: YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(value)) return true;
  }
  
  return false;
}

/**
 * Detects if a column name suggests currency values
 */
export function isCurrencyColumn(columnName: string): boolean {
  const lowerName = columnName.toLowerCase();
  
  // First, check for explicit count/quantity indicators that should NOT be currency
  const countIndicators = [
    'count', 'quantity', 'items_sold', 'items', 'units', 'number', 
    'qty', 'num_', 'cnt', 'qty_', 'items_', 'units_', 'sold', 'volume'
  ];
  if (countIndicators.some(indicator => lowerName.includes(indicator))) {
    return false;
  }
  
  // Currency keywords - but be more specific
  const currencyKeywords = [
    'revenue', 
    'sales', // but not "items_sold" (already filtered above)
    'price', 
    'cost', 
    'payment', 
    'balance',
    'total_revenue', // specific patterns
    'total_sales',
    'total_amount',
    'total_cost',
    'total_price'
  ];
  
  // Check for currency keywords
  const hasCurrencyKeyword = currencyKeywords.some(keyword => lowerName.includes(keyword));
  
  // If it has "total" but also count indicators, it's not currency
  if (lowerName.includes('total') && countIndicators.some(indicator => lowerName.includes(indicator))) {
    return false;
  }
  
  // Only treat as currency if it has currency keywords AND doesn't have count indicators
  return hasCurrencyKeyword;
}

/**
 * Detects if a column name suggests percentage values
 */
export function isPercentageColumn(columnName: string): boolean {
  const percentKeywords = ['percent', 'percentage', 'rate', 'ratio'];
  const lowerName = columnName.toLowerCase();
  return percentKeywords.some(keyword => lowerName.includes(keyword));
}

/**
 * Formats a date value for display based on granularity
 */
export function formatDateValue(value: any): string {
  if (!value) return 'N/A';
  
  try {
    const date = value instanceof Date ? value : new Date(value);
    
    if (isNaN(date.getTime())) return String(value);
    
    // Detect granularity based on time component
    const hasTime = value instanceof Date || 
      (typeof value === 'string' && value.includes('T'));
    
    const hasNonZeroTime = hasTime && (
      date.getHours() !== 0 || 
      date.getMinutes() !== 0 || 
      date.getSeconds() !== 0
    );
    
    // Format based on granularity
    if (hasNonZeroTime) {
      // Has specific time - show hour
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      const hour = date.getHours();
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${month} ${day}, ${displayHour}:00 ${period}`;
    } else if (date.getDate() === 1) {
      // First of month - likely monthly aggregation
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else {
      // Specific day
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (error) {
    return String(value);
  }
}

/**
 * Formats a number with abbreviations (K, M, B)
 */
export function formatNumberValue(
  value: number, 
  options: { isCurrency?: boolean; isPercentage?: boolean; decimals?: number } = {}
): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  
  const { isCurrency = false, isPercentage = false, decimals = 1 } = options;
  
  // Handle percentages
  if (isPercentage) {
    return `${value.toFixed(decimals)}%`;
  }
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const prefix = isCurrency ? '$' : '';
  
  // Billions
  if (abs >= 1_000_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(decimals)}B`;
  }
  
  // Millions
  if (abs >= 1_000_000) {
    return `${sign}${prefix}${(abs / 1_000_000).toFixed(decimals)}M`;
  }
  
  // Thousands
  if (abs >= 1_000) {
    return `${sign}${prefix}${(abs / 1_000).toFixed(decimals)}K`;
  }
  
  // Less than 1000
  if (abs >= 1) {
    // Show up to 2 decimal places for numbers less than 1000
    const formatted = abs < 10 ? value.toFixed(2) : value.toFixed(decimals);
    return `${sign}${prefix}${formatted}`;
  }
  
  // Very small numbers (decimals)
  return `${sign}${prefix}${value.toFixed(decimals + 1)}`;
}

/**
 * Formats a number with full precision and thousands separators for tooltips
 */
export function formatNumberFull(
  value: number,
  options: { isCurrency?: boolean; isPercentage?: boolean } = {}
): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  
  const { isCurrency = false, isPercentage = false } = options;
  
  if (isPercentage) {
    return `${value.toFixed(2)}%`;
  }
  
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  const formatted = formatter.format(value);
  return isCurrency ? `$${formatted}` : formatted;
}

/**
 * Smart axis label formatter that detects type and formats accordingly
 */
export function formatAxisLabel(
  value: any,
  columnName?: string
): string {
  // Special case: day_of_month should be treated as a simple number, not a date
  if (columnName && (columnName.toLowerCase().includes('day_of_month') || columnName.toLowerCase() === 'day')) {
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
      return String(value); // Just return the number as-is (1, 2, 3...)
    }
  }
  
  // Check if it's a date
  if (isDateValue(value)) {
    return formatDateValue(value);
  }
  
  // Check if it's a number
  if (typeof value === 'number') {
    const isCurrency = columnName ? isCurrencyColumn(columnName) : false;
    const isPercentage = columnName ? isPercentageColumn(columnName) : false;
    return formatNumberValue(value, { isCurrency, isPercentage });
  }
  
  // Return as string, truncate if too long
  const str = String(value);
  return str.length > 20 ? str.substring(0, 17) + '...' : str;
}

/**
 * Formats axis label using format configuration from visualization plan
 */
export function formatAxisLabelWithPlan(
  value: any,
  formatConfig?: {
    type?: 'currency' | 'number' | 'percentage' | 'date' | 'count' | 'auto';
    currency?: string;
    decimals?: number;
    dateFormat?: string;
    scale?: 'linear' | 'log' | 'sqrt';
  },
  columnName?: string
): string {
  // Special case: day_of_month should be treated as a simple number, not a date
  if (columnName && (columnName.toLowerCase().includes('day_of_month') || columnName.toLowerCase() === 'day')) {
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
      return String(value); // Just return the number as-is (1, 2, 3...)
    }
  }
  
  // Check if it's a date
  if (isDateValue(value)) {
    return formatDateValue(value);
  }
  
  // Check if it's a number
  if (typeof value === 'number') {
    // Use plan format if available
    if (formatConfig?.type) {
      const formatType = formatConfig.type;
      
      if (formatType === 'currency') {
        return formatNumberValue(value, { 
          isCurrency: true, 
          decimals: formatConfig.decimals ?? 0 
        });
      } else if (formatType === 'count') {
        return formatNumberValue(value, { 
          isCurrency: false, 
          decimals: formatConfig.decimals ?? 0 
        });
      } else if (formatType === 'percentage') {
        return formatNumberValue(value, { 
          isPercentage: true, 
          decimals: formatConfig.decimals ?? 1 
        });
      } else if (formatType === 'number') {
        return formatNumberValue(value, { 
          isCurrency: false, 
          decimals: formatConfig.decimals ?? 1 
        });
      }
      // For 'auto' or 'date', fall through to default detection
    }
    
    // Fallback to column name detection if no format config
    const isCurrency = columnName ? isCurrencyColumn(columnName) : false;
    const isPercentage = columnName ? isPercentageColumn(columnName) : false;
    return formatNumberValue(value, { isCurrency, isPercentage });
  }
  
  // Return as string, truncate if too long
  const str = String(value);
  return str.length > 20 ? str.substring(0, 17) + '...' : str;
}

/**
 * Formats tooltip values with full precision
 */
export function formatTooltipValue(
  value: any,
  columnName?: string
): string {
  // Check if it's a date
  if (isDateValue(value)) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: date.getHours() !== 0 ? 'numeric' : undefined,
      minute: date.getMinutes() !== 0 ? '2-digit' : undefined,
    });
  }
  
  // Check if it's a number
  if (typeof value === 'number') {
    const isCurrency = columnName ? isCurrencyColumn(columnName) : false;
    const isPercentage = columnName ? isPercentageColumn(columnName) : false;
    return formatNumberFull(value, { isCurrency, isPercentage });
  }
  
  return String(value);
}

/**
 * Detects the most appropriate formatter for a data column
 */
export function getColumnFormatter(
  columnName: string,
  sampleValues: any[]
): (value: any) => string {
  // Check sample values to detect type
  const nonNullSamples = sampleValues.filter(v => v !== null && v !== undefined);
  
  if (nonNullSamples.length === 0) {
    return (value: any) => String(value);
  }
  
  // Check if values are dates
  if (nonNullSamples.some(v => isDateValue(v))) {
    return (value: any) => formatDateValue(value);
  }
  
  // Check if values are numbers
  if (nonNullSamples.every(v => typeof v === 'number')) {
    const isCurrency = isCurrencyColumn(columnName);
    const isPercentage = isPercentageColumn(columnName);
    return (value: any) => formatNumberValue(value, { isCurrency, isPercentage });
  }
  
  // Default: string formatter
  return (value: any) => {
    const str = String(value);
    return str.length > 20 ? str.substring(0, 17) + '...' : str;
  };
}

