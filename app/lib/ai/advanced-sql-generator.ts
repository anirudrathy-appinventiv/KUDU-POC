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

  const systemPrompt = `You are a SQL expert specializing in AWS Redshift for KUDU, a famous food chain company in Saudi Arabia. Your task is to generate accurate, highly optimized analytical SQL queries using CTEs and window functions.

BUSINESS CONTEXT:
- KUDU is a food chain/restaurant business with multiple stores in Saudi Arabia
- Common data includes: sales, revenue, orders, products, menu items, stores, payroll, income statements, and inventory
- Schema is in the 'gold' schema (automatically set)
- Only SELECT queries are allowed (security requirement)

AVAILABLE SCHEMA:
${schemaPrompt}

HIGH-LEVEL MODELING:
- FACT views (large transactional): vw_rpt_sales_performance, vw_rpt_sales_performance_summary, vw_rpt_sales_performance_only_sales, vw_rpt_item_mix, vw_rpt_product_mix, vw_rpt_labor_summary, vw_rpt_income_statement, vw_rpt_inv_flow, vw_rpt_inv_wastage
- DIMENSION views (small lookup): vw_dim_store, vw_dim_item, vw_dim_brand, vw_dim_order_mode
- MAPPING views: vw_mapping_grouped_categories, vw_mapping_grouped_items, vw_mapping_order_mode_sales_channel, vw_mapping_store_types

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

IF USER ASKS FOR "DAY BY DAY" OR "DAILY COMPARISON" BETWEEN TWO SPECIFIC MONTHS:
Use this pattern to compare by day of month (1-31), not calendar dates:

WITH month1_daily AS (
  SELECT 
    EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS day_of_month,
    SUM([metric]) as month1_total
  FROM ${view}
  WHERE order_date_key >= [MONTH1_START_KEY] AND order_date_key < [MONTH1_END_KEY]
  GROUP BY EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD'))
),
month2_daily AS (
  SELECT 
    EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS day_of_month,
    SUM([metric]) as month2_total
  FROM ${view}
  WHERE order_date_key >= [MONTH2_START_KEY] AND order_date_key < [MONTH2_END_KEY]
  GROUP BY EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD'))
)
SELECT 
  COALESCE(m1.day_of_month, m2.day_of_month) AS day_of_month,
  COALESCE(m1.month1_total, 0) AS [month1_name]_[metric],
  COALESCE(m2.month2_total, 0) AS [month2_name]_[metric],
  COALESCE(m2.month2_total, 0) - COALESCE(m1.month1_total, 0) AS daily_change
FROM month1_daily m1
FULL OUTER JOIN month2_daily m2 ON m1.day_of_month = m2.day_of_month
ORDER BY day_of_month
LIMIT 31;

OTHERWISE (for general month-over-month trends):
CRITICAL: You MUST use this EXACT structure with these EXACT column names. Do NOT use placeholders.

For store-agnostic MoM (no grouping by store/brand):
WITH monthly_sales AS (
  SELECT
    DATE_TRUNC('month', TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS month,
    SUM(net_sales) AS sales_this_month
  FROM ${view}
  WHERE order_date_key >= [start_date_key] AND order_date_key < [end_date_key]
  GROUP BY DATE_TRUNC('month', TO_DATE(order_date_key::TEXT, 'YYYYMMDD'))
),
with_lag AS (
  SELECT
    month,
    sales_this_month,
    LAG(sales_this_month) OVER (ORDER BY month) AS sales_prev_month
  FROM monthly_sales
)
SELECT
  month,
  sales_this_month,
  sales_prev_month,
  sales_this_month - sales_prev_month AS mom_change,
  CASE 
    WHEN sales_prev_month = 0 OR sales_prev_month IS NULL THEN NULL
    ELSE ((sales_this_month - sales_prev_month) / sales_prev_month) * 100 
  END AS mom_percent
FROM with_lag
WHERE sales_prev_month IS NOT NULL
ORDER BY month
LIMIT 100;

For store-level MoM (grouping by store):
WITH monthly_sales AS (
  SELECT
    DATE_TRUNC('month', TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS month,
    store_key,
    SUM(net_sales) AS sales_this_month
  FROM ${view}
  WHERE order_date_key >= [start_date_key] AND order_date_key < [end_date_key]
  GROUP BY DATE_TRUNC('month', TO_DATE(order_date_key::TEXT, 'YYYYMMDD')), store_key
),
with_lag AS (
  SELECT
    month,
    store_key,
    sales_this_month,
    LAG(sales_this_month) OVER (PARTITION BY store_key ORDER BY month) AS sales_prev_month
  FROM monthly_sales
)
SELECT
  ms.month,
  ds.store_name,
  wl.sales_this_month,
  wl.sales_prev_month,
  wl.sales_this_month - wl.sales_prev_month AS mom_change,
  CASE 
    WHEN wl.sales_prev_month = 0 OR wl.sales_prev_month IS NULL THEN NULL
    ELSE ((wl.sales_this_month - wl.sales_prev_month) / wl.sales_prev_month) * 100 
  END AS mom_percent
FROM with_lag wl
JOIN monthly_sales ms ON wl.month = ms.month AND wl.store_key = ms.store_key
JOIN vw_dim_store ds ON wl.store_key = ds.store_key
WHERE wl.sales_prev_month IS NOT NULL
ORDER BY ms.month, ds.store_name
LIMIT 100;

MANDATORY REQUIREMENTS:
- Column names MUST be: sales_this_month, sales_prev_month (exactly these names)
- MUST include LAG() window function in with_lag CTE
- MUST use ORDER BY month (not DESC) for proper LAG calculation
- MUST filter WHERE sales_prev_month IS NOT NULL to exclude first month
- Replace [start_date_key] and [end_date_key] with actual date keys (e.g., 20240101, 20260101)
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

CRITICAL RULES - MUST FOLLOW:

OUTPUT FORMAT (ABSOLUTELY CRITICAL):
1. Return ONLY the raw SQL query - NO explanations, NO markdown, NO introductory text
2. Your ENTIRE response must be executable SQL starting with SELECT or WITH
3. First word MUST be SELECT or WITH - NO "Certainly!", NO "Here's", NO assumptions list
4. If you include ANY text that isn't SQL, the query will be blocked as unsafe

MOM_COMPARISON SPECIFIC REQUIREMENTS (IF PATTERN IS MOM_COMPARISON):
5. For month-over-month queries, you MUST use EXACT column names: sales_this_month and sales_prev_month
6. You MUST include LAG() window function: LAG(sales_this_month) OVER (ORDER BY month) AS sales_prev_month
7. You MUST have two CTEs: monthly_sales (aggregates) and with_lag (adds LAG)
8. Final SELECT must include: month, sales_this_month, sales_prev_month
9. Do NOT use placeholder names like monthly_total, prev_month_total, or any variations
10. The query will be REJECTED if it doesn't contain both sales_this_month and sales_prev_month columns

QUERY CONSTRUCTION:
5. Use ONLY the view "${view}" as the primary data source for this query
6. Always include date filters from the date ranges provided
7. Handle NULL values properly in calculations (use COALESCE, NULLIF, CASE)
8. Use meaningful column aliases (e.g., sales_2024, sales_2025, yoy_percent, mom_change)
9. Sort results by the most relevant metric (DESC for growth, ASC for decline)
10. Add LIMIT 100 to prevent excessive results
11. Use FULL OUTER JOIN for comparisons to show all entities even if missing in one period

DATE HANDLING:
12. For order_date_key (INT format YYYYMMDD): Use comparisons like order_date_key >= 20250101 AND order_date_key < 20260101
13. For DATE columns (effective_date, month_date, etc.): Use standard date comparisons like effective_date >= '2025-01-01'
14. For temporal grouping, convert date keys: TO_DATE(order_date_key::TEXT, 'YYYYMMDD')
15. Use DATE_TRUNC for month/week/day grouping

KEY-BASED JOINS (CRITICAL FOR ACCURACY):
16. ALWAYS join tables using KEY columns (store_key, item_key, brand_key), NEVER text names
17. Multi-source queries (e.g., labor + sales): Join on store_key, NOT on branch name or store_name
18. Pattern: Aggregate FACT data on keys first, THEN join to DIMENSION views for names
19. Example: SUM(labor) and SUM(sales) joined ON store_key, then join vw_dim_store for store_name

DAY-BY-DAY MONTH COMPARISON (IMPORTANT):
20. When user asks to "compare day by day" or "daily breakdown" between TWO SPECIFIC MONTHS:
    - Extract day of month using EXTRACT(DAY FROM ...) for X-axis values (1-31)
    - Create separate CTEs for each month
    - Join on day_of_month, NOT on full date
    - This allows comparing "Nov 1 vs Oct 1", "Nov 2 vs Oct 2", etc.
21. When user asks for general "month over month" trends (multiple months):
    - Use DATE_TRUNC('month', ...) to group by full months
    - Use LAG() window function to compare consecutive months

PERFORMANCE:
20. Aggregate on FACT views using key columns before joining to DIMENSION views
21. Push filters (date, store_key, etc.) as early as possible in CTEs
22. Use window functions (LAG, LEAD, AVG OVER) for time-series analysis
23. Avoid SELECT * - only select needed columns

EXAMPLE 1 - Multi-Source Join (Labor + Sales):
WITH labor_by_store AS (
  SELECT 
    store_key,
    SUM(costed_value) AS total_labor_cost
  FROM vw_rpt_labor_summary
  WHERE effective_date >= '2025-01-01' AND effective_date < '2026-01-01'
  GROUP BY store_key
),
sales_by_store AS (
  SELECT 
    store_key,
    SUM(net_sales) AS total_net_sales
  FROM vw_rpt_sales_performance_only_sales
  WHERE order_date_key >= 20250101 AND order_date_key < 20260101
  GROUP BY store_key
)
SELECT
  ds.store_name,
  l.total_labor_cost,
  COALESCE(s.total_net_sales, 0) AS total_net_sales,
  CASE
    WHEN COALESCE(s.total_net_sales, 0) = 0 THEN NULL
    ELSE (l.total_labor_cost / s.total_net_sales) * 100
  END AS labor_cost_percent
FROM labor_by_store l
LEFT JOIN sales_by_store s ON l.store_key = s.store_key
JOIN vw_dim_store ds ON l.store_key = ds.store_key
ORDER BY labor_cost_percent DESC NULLS LAST
LIMIT 100;

EXAMPLE 2 - Day-by-Day Comparison Between Two Months (Nov vs Oct):
WITH oct_daily AS (
  SELECT 
    EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS day_of_month,
    SUM(net_sales) AS oct_sales
  FROM vw_rpt_sales_performance_only_sales
  WHERE order_date_key >= 20251001 AND order_date_key < 20251101
  GROUP BY EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD'))
),
nov_daily AS (
  SELECT 
    EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS day_of_month,
    SUM(net_sales) AS nov_sales
  FROM vw_rpt_sales_performance_only_sales
  WHERE order_date_key >= 20251101 AND order_date_key < 20251201
  GROUP BY EXTRACT(DAY FROM TO_DATE(order_date_key::TEXT, 'YYYYMMDD'))
)
SELECT 
  COALESCE(o.day_of_month, n.day_of_month) AS day_of_month,
  COALESCE(n.nov_sales, 0) AS nov_2025_sales,
  COALESCE(o.oct_sales, 0) AS oct_2025_sales
FROM oct_daily o
FULL OUTER JOIN nov_daily n ON o.day_of_month = n.day_of_month
ORDER BY day_of_month
LIMIT 31;

${conversationContext ? `\nPrevious conversation:\n${conversationContext}\n` : ''}

REMEMBER: Your response must START with SELECT or WITH. No other text allowed.

Generate a CTE-based SQL query for: "${userQuery}"`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: systemPrompt + '\n\nCRITICAL: You MUST respond with ONLY the SQL query. First word must be SELECT or WITH.',
      },
      {
        role: 'user',
        content: userQuery,
      },
    ],
    temperature: 0.05, // Very low temperature for deterministic SQL generation
    max_tokens: 1500, // Increased for complex CTE queries
  });

  let sql = completion.choices[0]?.message?.content?.trim() || '';
  
  // Clean up markdown code blocks
  sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
  
  // Remove common chatty prefixes that LLMs add
  sql = sql.replace(/^(Certainly!?|Sure!?|Here'?s?|Here is|This query)[^:]*:?\s*/i, '').trim();
  sql = sql.replace(/^(The following|Below is|I'll|Let me)[^:]*:?\s*/i, '').trim();
  
  // Remove markdown formatting (bold, bullets, assumptions sections)
  sql = sql.replace(/^\*\*.*?\*\*\s*/gm, '').trim();
  sql = sql.replace(/^[-*]\s+/gm, '').trim();
  sql = sql.replace(/^\*\*Assumptions:\*\*/gmi, '').trim();
  
  // If there are multiple lines and first line doesn't start with SELECT/WITH, find the SQL
  const firstLine = sql.split('\n')[0].trim().toUpperCase();
  if (!firstLine.startsWith('SELECT') && !firstLine.startsWith('WITH')) {
    const lines = sql.split('\n');
    const sqlLineIndex = lines.findIndex(line => {
      const trimmed = line.trim().toUpperCase();
      return trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
    });
    
    if (sqlLineIndex !== -1) {
      // Found SQL line - take everything from that point
      sql = lines.slice(sqlLineIndex).join('\n').trim();
    }
  }
  
  // Final validation
  if (!sql.toUpperCase().trim().startsWith('SELECT') && !sql.toUpperCase().trim().startsWith('WITH')) {
    throw new Error('Generated query does not start with SELECT or WITH. The model returned explanatory text instead of SQL.');
  }

  // MOM-specific validation: Check if this is a MOM query and validate required elements
  // Only validate if pattern is MOM AND SQL actually looks like a MOM query
  if (analysis.pattern === 'MOM_COMPARISON') {
    const sqlUpper = sql.toUpperCase();
    
    // Check if SQL actually contains month-related keywords (defensive check)
    // If it doesn't look like a MOM query, skip validation (might be false positive pattern detection)
    const hasMonthKeywords = sqlUpper.includes('DATE_TRUNC(\'MONTH') || 
                                          sqlUpper.includes('MONTH') ||
                                          sqlUpper.includes('MONTHLY');
    
    // Only validate if it actually looks like a MOM query
    if (hasMonthKeywords) {
      const hasLag = sqlUpper.includes('LAG(');
      const hasSalesThisMonth = sqlUpper.includes('SALES_THIS_MONTH');
      const hasSalesPrevMonth = sqlUpper.includes('SALES_PREV_MONTH');
      
      // Check if it's a day-by-day comparison (different validation)
      const isDayByDay = sqlUpper.includes('DAY_OF_MONTH') || sqlUpper.includes('EXTRACT(DAY');
      
      if (!isDayByDay) {
        // For general MoM, must have LAG and both column names
        if (!hasLag) {
          throw new Error('MOM query is missing LAG() window function. The query must include LAG(sales_this_month) OVER (ORDER BY month) AS sales_prev_month.');
        }
        
        if (!hasSalesThisMonth || !hasSalesPrevMonth) {
          throw new Error('MOM query must include columns named exactly: sales_this_month and sales_prev_month. Generated query is missing required columns.');
        }
      }
    }
    // If pattern is MOM but SQL doesn't look like MOM, skip validation (likely false positive)
  }

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

CRITICAL: Return ONLY raw SQL. No explanations. Must start with SELECT or WITH.

REQUIREMENTS:
- Generate a simple aggregation query for ${range.label}
- Use view: ${view}
- Date range: ${range.start} to ${range.end}
- Join using KEY columns (store_key, item_key, brand_key), NOT text names
- Include main grouping dimension (e.g., store, brand, region)
- Include key metrics (e.g., SUM(net_sales), SUM(quantity), COUNT(*))
- Use clear column aliases with year suffix: metric_${range.label.replace(/\s/g, '_')}
- Add LIMIT 100

Generate ONLY SQL for: "${userQuery}" for period ${range.label}`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt + '\n\nYou MUST respond with ONLY SQL. No explanations.' },
          { role: 'user', content: `${userQuery} for ${range.label}` },
        ],
        temperature: 0.05, // Lower temperature for more deterministic output
        max_tokens: 400,
      });

      let sql = completion.choices[0]?.message?.content?.trim() || '';
      
      // Aggressive cleaning
      sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
      sql = sql.replace(/^(Certainly!?|Sure!?|Here'?s?|Here is|This query)[^:]*:?\s*/i, '').trim();
      sql = sql.replace(/^(The following|Below is|I'll|Let me)[^:]*:?\s*/i, '').trim();
      sql = sql.replace(/^\*\*.*?\*\*\s*/gm, '').trim();
      
      // Find SQL if wrapped in text
      const firstLine = sql.split('\n')[0].trim().toUpperCase();
      if (!firstLine.startsWith('SELECT') && !firstLine.startsWith('WITH')) {
        const lines = sql.split('\n');
        const sqlLineIndex = lines.findIndex(line => {
          const trimmed = line.trim().toUpperCase();
          return trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
        });
        if (sqlLineIndex !== -1) {
          sql = lines.slice(sqlLineIndex).join('\n').trim();
        }
      }
      
      if (sql && sql.toUpperCase().startsWith('SELECT')) {
        queries.push(sql);
      }
    }
  } else if (pattern === 'MOM_COMPARISON' && dateRanges && dateRanges.length > 1) {
    // Generate separate query for each month
    for (const range of dateRanges) {
      const schemaPrompt = formatSchemaForPrompt(schema);
      
      const systemPrompt = `You are a SQL expert for KUDU's Redshift database.

CRITICAL: Return ONLY raw SQL. No explanations. Must start with SELECT or WITH.

Generate a simple SQL query for ${range.label} using ${view} with date filter ${range.start} to ${range.end}. Include main grouping and key metrics. Use KEY-based joins (store_key, item_key, brand_key), NOT text names.`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt + '\n\nYou MUST respond with ONLY SQL.' },
          { role: 'user', content: `${userQuery} for ${range.label}` },
        ],
        temperature: 0.05,
        max_tokens: 400,
      });

      let sql = completion.choices[0]?.message?.content?.trim() || '';
      
      // Aggressive cleaning
      sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
      sql = sql.replace(/^(Certainly!?|Sure!?|Here'?s?|Here is|This query)[^:]*:?\s*/i, '').trim();
      sql = sql.replace(/^(The following|Below is|I'll|Let me)[^:]*:?\s*/i, '').trim();
      sql = sql.replace(/^\*\*.*?\*\*\s*/gm, '').trim();
      
      // Find SQL if wrapped in text
      const firstLine = sql.split('\n')[0].trim().toUpperCase();
      if (!firstLine.startsWith('SELECT') && !firstLine.startsWith('WITH')) {
        const lines = sql.split('\n');
        const sqlLineIndex = lines.findIndex(line => {
          const trimmed = line.trim().toUpperCase();
          return trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
        });
        if (sqlLineIndex !== -1) {
          sql = lines.slice(sqlLineIndex).join('\n').trim();
        }
      }
      
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

