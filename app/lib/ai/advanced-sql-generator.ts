import OpenAI from 'openai';
import { formatSchemaForPrompt, getSchemaMetadata } from '../db/schema';
import { ChatMessage, QueryAnalysis, SQLPlan, AnalyticalPattern } from '@/app/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Selects the optimal view based on detail level and pattern
 */
function selectOptimalView(detailLevel?: string, pattern?: AnalyticalPattern | null): string {
  if (detailLevel === 'detailed') {
    return 'vw_rpt_sales_performance'; // Full detail with items
  }
  if (detailLevel === 'hourly') {
    return 'vw_rpt_sales_performance_summary'; // Order hour details
  }
  // Default to summary view (most efficient)
  return 'vw_rpt_sales_performance_only_sales';
}

/**
 * Generates CTE-based SQL for analytical queries
 */
async function generateCTEQuery(
  userQuery: string,
  analysis: QueryAnalysis,
  schema: any[],
  conversationHistory: ChatMessage[]
): Promise<string> {
  const { pattern, dateRanges, detailLevel } = analysis;
  const view = selectOptimalView(detailLevel, pattern);
  
  const schemaPrompt = formatSchemaForPrompt(schema);

  // Build context from conversation
  const conversationContext = conversationHistory
    .slice(-4)
    .map((msg) => {
      if (msg.role === 'user') return `User: ${msg.content}`;
      return msg.summary ? `Assistant: ${msg.summary}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You are a SQL expert for KUDU's Redshift database specializing in analytical queries.

BUSINESS CONTEXT:
- KUDU is a famous food chain company in Saudi Arabia
- Schema is in the 'gold' schema (automatically set)
- Only SELECT queries are allowed (security requirement)

AVAILABLE SCHEMA:
${schemaPrompt}

ANALYTICAL QUERY REQUIREMENTS:

Pattern Detected: ${pattern || 'None'}
Detail Level: ${detailLevel || 'summary'}
Recommended View: ${view}
Date Ranges: ${JSON.stringify(dateRanges, null, 2)}

${pattern === 'YOY_COMPARISON' ? `
YEAR-OVER-YEAR COMPARISON TEMPLATE:
Use CTEs to fetch each year's data separately, then join and calculate:

WITH sales_YEAR1 AS (
  SELECT 
    [grouping_columns],
    SUM([metric]) as [metric]_YEAR1
  FROM ${view}
  WHERE order_date >= 'YEAR1-01-01' AND order_date < 'YEAR2-01-01'
  GROUP BY [grouping_columns]
),
sales_YEAR2 AS (
  SELECT 
    [grouping_columns],
    SUM([metric]) as [metric]_YEAR2
  FROM ${view}
  WHERE order_date >= 'YEAR2-01-01' AND order_date < 'YEAR3-01-01'
  GROUP BY [grouping_columns]
)
SELECT 
  COALESCE(s1.[grouping_columns], s2.[grouping_columns]) as [grouping_columns],
  s1.[metric]_YEAR1,
  s2.[metric]_YEAR2,
  s2.[metric]_YEAR2 - s1.[metric]_YEAR1 as yoy_change,
  CASE 
    WHEN s1.[metric]_YEAR1 = 0 OR s1.[metric]_YEAR1 IS NULL THEN NULL
    ELSE ((s2.[metric]_YEAR2 - s1.[metric]_YEAR1) / s1.[metric]_YEAR1) * 100 
  END as yoy_percent
FROM sales_YEAR1 s1
FULL OUTER JOIN sales_YEAR2 s2 ON s1.[grouping_columns] = s2.[grouping_columns]
ORDER BY yoy_percent DESC NULLS LAST
LIMIT 100;
` : ''}

${pattern === 'MOM_COMPARISON' ? `
MONTH-OVER-MONTH COMPARISON TEMPLATE:
Use DATE_TRUNC to group by month and calculate changes:

WITH monthly_sales AS (
  SELECT 
    DATE_TRUNC('month', order_date) as month,
    [grouping_columns],
    SUM([metric]) as monthly_total
  FROM ${view}
  WHERE order_date >= '[start_date]'
  GROUP BY DATE_TRUNC('month', order_date), [grouping_columns]
),
with_lag AS (
  SELECT
    month,
    [grouping_columns],
    monthly_total,
    LAG(monthly_total) OVER (PARTITION BY [grouping_columns] ORDER BY month) as prev_month_total
  FROM monthly_sales
)
SELECT
  month,
  [grouping_columns],
  monthly_total,
  prev_month_total,
  monthly_total - prev_month_total as mom_change,
  CASE 
    WHEN prev_month_total = 0 OR prev_month_total IS NULL THEN NULL
    ELSE ((monthly_total - prev_month_total) / prev_month_total) * 100 
  END as mom_percent
FROM with_lag
WHERE prev_month_total IS NOT NULL
ORDER BY month DESC, [grouping_columns]
LIMIT 100;
` : ''}

${pattern === 'ROLLING_AVERAGE' ? `
ROLLING AVERAGE TEMPLATE:
Use window functions for rolling calculations:

WITH daily_metrics AS (
  SELECT 
    DATE(order_date) as date,
    [grouping_columns],
    SUM([metric]) as daily_total
  FROM ${view}
  WHERE order_date >= '[start_date]'
  GROUP BY DATE(order_date), [grouping_columns]
)
SELECT
  date,
  [grouping_columns],
  daily_total,
  AVG(daily_total) OVER (
    PARTITION BY [grouping_columns] 
    ORDER BY date 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as rolling_7day_avg
FROM daily_metrics
ORDER BY date DESC, [grouping_columns]
LIMIT 100;
` : ''}

${pattern === 'CUMULATIVE_SUM' ? `
CUMULATIVE SUM TEMPLATE:
Use window functions for running totals:

WITH daily_sales AS (
  SELECT 
    DATE(order_date) as date,
    [grouping_columns],
    SUM([metric]) as daily_total
  FROM ${view}
  WHERE order_date >= '[start_date]'
  GROUP BY DATE(order_date), [grouping_columns]
)
SELECT
  date,
  [grouping_columns],
  daily_total,
  SUM(daily_total) OVER (
    PARTITION BY [grouping_columns] 
    ORDER BY date 
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) as cumulative_total
FROM daily_sales
ORDER BY date DESC, [grouping_columns]
LIMIT 100;
` : ''}

CRITICAL RULES:
1. Use ONLY the view "${view}" for this query
2. Always include date filters from the date ranges provided
3. Handle NULL values properly in calculations
4. Use meaningful column aliases (e.g., sales_2024, sales_2025, yoy_percent)
5. Sort results by the most relevant metric (DESC for growth, ASC for decline)
6. Add LIMIT 100 to prevent excessive results
7. Use FULL OUTER JOIN for comparisons to show all entities even if missing in one period
8. Convert date keys properly (e.g., order_date_key >= 20250101)

${conversationContext ? `\nPrevious conversation:\n${conversationContext}\n` : ''}

Generate a CTE-based SQL query for: "${userQuery}"`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userQuery,
      },
    ],
    temperature: 0.1,
    max_tokens: 1500, // Increased for complex CTE queries
  });

  let sql = completion.choices[0]?.message?.content?.trim() || '';
  
  // Clean up markdown
  sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();

  return sql;
}

/**
 * Decomposes query into multiple simpler queries for high-risk scenarios
 */
async function decomposeToMultiQuery(
  userQuery: string,
  analysis: QueryAnalysis,
  schema: any[],
  conversationHistory: ChatMessage[]
): Promise<string[]> {
  const { pattern, dateRanges, detailLevel } = analysis;
  const view = selectOptimalView(detailLevel, pattern);
  
  const queries: string[] = [];

  if (pattern === 'YOY_COMPARISON' && dateRanges && dateRanges.length >= 2) {
    // Generate separate query for each year
    for (const range of dateRanges) {
      const schemaPrompt = formatSchemaForPrompt(schema);
      
      const systemPrompt = `You are a SQL expert for KUDU's Redshift database.

AVAILABLE SCHEMA:
${schemaPrompt}

REQUIREMENTS:
- Generate a simple aggregation query for ${range.label}
- Use view: ${view}
- Date range: ${range.start} to ${range.end}
- Include main grouping dimension (e.g., store, brand, region)
- Include key metrics (e.g., SUM(net_sales), SUM(quantity), COUNT(*))
- Use clear column aliases with year suffix: metric_${range.label.replace(/\s/g, '_')}
- Add LIMIT 100

Generate SQL for: "${userQuery}" for period ${range.label}`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userQuery} for ${range.label}` },
        ],
        temperature: 0.1,
        max_tokens: 400,
      });

      let sql = completion.choices[0]?.message?.content?.trim() || '';
      sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
      
      if (sql && sql.toUpperCase().startsWith('SELECT')) {
        queries.push(sql);
      }
    }
  } else if (pattern === 'MOM_COMPARISON' && dateRanges && dateRanges.length > 1) {
    // Generate separate query for each month
    for (const range of dateRanges) {
      const schemaPrompt = formatSchemaForPrompt(schema);
      
      const systemPrompt = `Generate a simple SQL query for ${range.label} using ${view} with date filter ${range.start} to ${range.end}. Include main grouping and key metrics.`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userQuery} for ${range.label}` },
        ],
        temperature: 0.1,
        max_tokens: 400,
      });

      let sql = completion.choices[0]?.message?.content?.trim() || '';
      sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
      
      if (sql && sql.toUpperCase().startsWith('SELECT')) {
        queries.push(sql);
      }
    }
  }

  return queries;
}

/**
 * Main function: Generates SQL plan based on query analysis
 */
export async function generateAnalyticalSQL(
  userQuery: string,
  analysis: QueryAnalysis,
  conversationHistory: ChatMessage[] = []
): Promise<SQLPlan> {
  const schema = await getSchemaMetadata();
  
  let queries: string[] = [];
  let combineStrategy: 'join' | 'union' | 'pivot' | 'calculate' = 'calculate';
  let description = '';

  if (analysis.strategy === 'multi-query') {
    // Decompose into multiple queries
    queries = await decomposeToMultiQuery(userQuery, analysis, schema, conversationHistory);
    combineStrategy = 'calculate';
    description = `Executing ${queries.length} separate queries and combining results with calculated metrics for ${analysis.pattern?.replace(/_/g, ' ').toLowerCase() || 'analysis'}.`;
  } else if (analysis.strategy === 'cte') {
    // Generate CTE-based single query
    const sql = await generateCTEQuery(userQuery, analysis, schema, conversationHistory);
    queries = [sql];
    combineStrategy = 'join';
    description = `Executing single CTE-based query for ${analysis.pattern?.replace(/_/g, ' ').toLowerCase() || 'analysis'}.`;
  } else {
    // Simple single query (fallback to existing generator)
    // This will be handled by the existing sql-generator in the API route
    queries = [];
    description = 'Simple query - using standard SQL generation.';
  }

  return {
    strategy: analysis.strategy,
    queries,
    pattern: analysis.pattern,
    combineStrategy,
    description,
    analysis,
  };
}

