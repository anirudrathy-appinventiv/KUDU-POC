import { AnalyticalPattern, QueryAnalysis, ChatMessage } from '@/app/types/database';

/**
 * Detects analytical patterns in user queries
 */
export function detectAnalyticalPattern(query: string): AnalyticalPattern | null {
  const lowerQuery = query.toLowerCase();

  // Year-over-year patterns
  const yoyPatterns = [
    /year[\s-]over[\s-]year/i,
    /\byoy\b/i,
    /year[\s-]on[\s-]year/i,
    /compare.*\d{4}.*\d{4}/i,
    /\d{4}\s+vs\.?\s+\d{4}/i,
    /annual.*comparison/i,
  ];
  if (yoyPatterns.some(pattern => pattern.test(query))) {
    return 'YOY_COMPARISON';
  }

  // Month-over-month patterns
  const momPatterns = [
    /month[\s-]over[\s-]month/i,
    /\bmom\b/i,
    /month[\s-]on[\s-]month/i,
    /monthly.*comparison/i,
    /monthly.*growth/i,
    /compare.*months?/i,
  ];
  if (momPatterns.some(pattern => pattern.test(query))) {
    return 'MOM_COMPARISON';
  }

  // Quarter-over-quarter patterns
  const qoqPatterns = [
    /quarter[\s-]over[\s-]quarter/i,
    /\bqoq\b/i,
    /quarter[\s-]on[\s-]quarter/i,
    /quarterly.*comparison/i,
    /\bq[1-4].*vs\.?.*q[1-4]/i,
  ];
  if (qoqPatterns.some(pattern => pattern.test(query))) {
    return 'QOQ_COMPARISON';
  }

  // Rolling average patterns
  const rollingAvgPatterns = [
    /rolling.*average/i,
    /moving.*average/i,
    /\d+[\s-]day.*average/i,
    /\d+[\s-]week.*average/i,
    /\d+[\s-]month.*average/i,
  ];
  if (rollingAvgPatterns.some(pattern => pattern.test(query))) {
    return 'ROLLING_AVERAGE';
  }

  // Cumulative sum patterns
  const cumulativePatterns = [
    /cumulative/i,
    /running.*total/i,
    /year[\s-]to[\s-]date/i,
    /\bytd\b/i,
    /quarter[\s-]to[\s-]date/i,
    /\bqtd\b/i,
  ];
  if (cumulativePatterns.some(pattern => pattern.test(query))) {
    return 'CUMULATIVE_SUM';
  }

  // Growth rate patterns
  const growthPatterns = [
    /growth.*rate/i,
    /percent.*change/i,
    /%.*change/i,
    /rate.*of.*change/i,
    /increase.*rate/i,
  ];
  if (growthPatterns.some(pattern => pattern.test(query))) {
    return 'GROWTH_RATE';
  }

  // Trend analysis patterns
  const trendPatterns = [
    /trend/i,
    /pattern/i,
    /over.*time/i,
    /time.*series/i,
  ];
  if (trendPatterns.some(pattern => pattern.test(query))) {
    return 'TREND_ANALYSIS';
  }

  return null;
}

/**
 * Extracts date ranges from query
 */
function extractDateRanges(query: string, pattern: AnalyticalPattern | null): Array<{ start: string; end: string; label: string }> {
  const ranges: Array<{ start: string; end: string; label: string }> = [];
  const currentYear = new Date().getFullYear();

  // Extract year mentions
  const yearMatches = query.match(/\b(20\d{2})\b/g);
  
  if (yearMatches && yearMatches.length >= 2) {
    // Multiple years mentioned
    const years = [...new Set(yearMatches)].sort();
    years.forEach(year => {
      ranges.push({
        start: `${year}-01-01`,
        end: `${parseInt(year) + 1}-01-01`,
        label: year,
      });
    });
  } else if (pattern === 'YOY_COMPARISON') {
    // Default to current year and previous year
    ranges.push({
      start: `${currentYear}-01-01`,
      end: `${currentYear + 1}-01-01`,
      label: currentYear.toString(),
    });
    ranges.push({
      start: `${currentYear - 1}-01-01`,
      end: `${currentYear}-01-01`,
      label: (currentYear - 1).toString(),
    });
  } else if (pattern === 'MOM_COMPARISON') {
    // Default to last 3 months for MoM
    const now = new Date();
    for (let i = 2; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      ranges.push({
        start: date.toISOString().split('T')[0],
        end: nextDate.toISOString().split('T')[0],
        label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      });
    }
  } else if (pattern === 'QOQ_COMPARISON') {
    // Default to last 2 quarters
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    for (let i = 1; i >= 0; i--) {
      const q = currentQuarter - i;
      const year = now.getFullYear() + Math.floor(q / 4);
      const quarter = ((q % 4) + 4) % 4;
      const startMonth = quarter * 3;
      ranges.push({
        start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
        end: `${year}-${String(startMonth + 4).padStart(2, '0')}-01`,
        label: `Q${quarter + 1} ${year}`,
      });
    }
  } else {
    // Default to 2025 as per requirements
    ranges.push({
      start: '2025-01-01',
      end: '2026-01-01',
      label: '2025',
    });
  }

  return ranges;
}

/**
 * Detects detail level from query
 */
function detectDetailLevel(query: string): 'summary' | 'hourly' | 'detailed' {
  const lowerQuery = query.toLowerCase();

  // Detailed patterns (item-level)
  const detailedPatterns = [
    /\bitem\b/i,
    /\bproduct\b/i,
    /\bsku\b/i,
    /detailed/i,
    /granular/i,
    /by.*item/i,
  ];
  if (detailedPatterns.some(pattern => pattern.test(query))) {
    return 'detailed';
  }

  // Hourly patterns (order hour)
  const hourlyPatterns = [
    /\bhour/i,
    /\btime/i,
    /hourly/i,
    /by.*hour/i,
    /peak.*time/i,
  ];
  if (hourlyPatterns.some(pattern => pattern.test(query))) {
    return 'hourly';
  }

  // Default to summary
  return 'summary';
}

/**
 * Estimates row count based on view and date range
 */
function estimateRowCount(detailLevel: string, dateRanges: Array<any>): number {
  const yearsCount = dateRanges.length;
  
  // Base row counts per year
  const rowCounts = {
    summary: 2_000_000,    // vw_rpt_sales_performance_only_sales
    hourly: 20_000_000,     // vw_rpt_sales_performance_summary
    detailed: 100_000_000,  // vw_rpt_sales_performance (full)
  };

  const baseCount = rowCounts[detailLevel as keyof typeof rowCounts] || rowCounts.summary;
  return baseCount * yearsCount;
}

/**
 * Assesses timeout risk based on estimated rows and pattern complexity
 */
function assessTimeoutRisk(
  estimatedRows: number,
  pattern: AnalyticalPattern | null,
  detailLevel: string
): 'low' | 'medium' | 'high' {
  // High risk thresholds
  if (estimatedRows > 50_000_000) return 'high';
  if (detailLevel === 'detailed' && estimatedRows > 20_000_000) return 'high';
  
  // Medium risk
  if (estimatedRows > 20_000_000) return 'medium';
  if (pattern && ['YOY_COMPARISON', 'QOQ_COMPARISON'].includes(pattern) && estimatedRows > 10_000_000) {
    return 'medium';
  }

  // Low risk
  return 'low';
}

/**
 * Determines optimal execution strategy
 */
function determineStrategy(
  pattern: AnalyticalPattern | null,
  timeoutRisk: 'low' | 'medium' | 'high',
  estimatedRows: number
): 'single' | 'cte' | 'multi-query' {
  // No analytical pattern = simple single query
  if (!pattern) return 'single';

  // High timeout risk = multi-query decomposition
  if (timeoutRisk === 'high') return 'multi-query';

  // Rolling average and cumulative sums work best with CTEs/window functions
  if (pattern === 'ROLLING_AVERAGE' || pattern === 'CUMULATIVE_SUM') {
    return 'cte';
  }

  // Comparison patterns with medium risk = CTE
  if (['YOY_COMPARISON', 'MOM_COMPARISON', 'QOQ_COMPARISON'].includes(pattern)) {
    return timeoutRisk === 'medium' ? 'multi-query' : 'cte';
  }

  // Default to CTE for analytical queries
  return 'cte';
}

/**
 * Classifies query complexity
 */
function classifyComplexity(
  pattern: AnalyticalPattern | null,
  timeoutRisk: 'low' | 'medium' | 'high',
  dateRanges: Array<any>
): 'simple' | 'moderate' | 'complex' {
  if (!pattern) return 'simple';
  
  if (timeoutRisk === 'high' || dateRanges.length > 3) return 'complex';
  if (timeoutRisk === 'medium' || dateRanges.length > 2) return 'moderate';
  
  return 'moderate';
}

/**
 * Main function: Analyzes query and returns comprehensive analysis
 */
export async function analyzeQuery(
  userQuery: string,
  conversationHistory: ChatMessage[] = []
): Promise<QueryAnalysis> {
  // Detect analytical pattern
  const pattern = detectAnalyticalPattern(userQuery);

  // Extract date ranges based on pattern
  const dateRanges = extractDateRanges(userQuery, pattern);

  // Detect detail level (affects view selection)
  const detailLevel = detectDetailLevel(userQuery);

  // Estimate row count
  const estimatedRows = estimateRowCount(detailLevel, dateRanges);

  // Assess timeout risk
  const timeoutRisk = assessTimeoutRisk(estimatedRows, pattern, detailLevel);

  // Determine execution strategy
  const strategy = determineStrategy(pattern, timeoutRisk, estimatedRows);

  // Classify complexity
  const complexity = classifyComplexity(pattern, timeoutRisk, dateRanges);

  // Generate reasoning
  let reasoning = '';
  if (pattern) {
    reasoning = `Detected ${pattern.replace(/_/g, ' ').toLowerCase()} pattern. `;
    reasoning += `Using ${detailLevel} level data (est. ${(estimatedRows / 1_000_000).toFixed(1)}M rows). `;
    reasoning += `Timeout risk: ${timeoutRisk}. `;
    reasoning += `Strategy: ${strategy === 'cte' ? 'CTE-based single query' : strategy === 'multi-query' ? 'decomposed multi-query execution' : 'simple query'}.`;
  } else {
    reasoning = 'Simple query with no complex analytical pattern detected.';
  }

  return {
    pattern,
    complexity,
    strategy,
    estimatedRows,
    timeoutRisk,
    reasoning,
    detailLevel,
    dateRanges,
  };
}

