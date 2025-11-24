import OpenAI from 'openai';
import { QueryResult } from '@/app/types/database';
import { VisualizationPlan } from '@/app/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analyzes data to extract statistics and patterns for AI context
 */
function analyzeDataForContext(queryResult: QueryResult): string {
  if (queryResult.rows.length === 0) {
    return 'No data available for analysis.';
  }

  const analysis: string[] = [];
  
  // Analyze each column
  queryResult.columns.forEach(col => {
    const values = queryResult.rows.map(row => row[col]).filter(v => v !== null && v !== undefined);
    if (values.length === 0) return;
    
    const sampleValue = values[0];
    const isNumeric = typeof sampleValue === 'number';
    
    if (isNumeric) {
      const nums = values as number[];
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const sorted = [...nums].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      
      analysis.push(`\n${col} (numeric):`);
      analysis.push(`  - Count: ${nums.length} values`);
      analysis.push(`  - Sum: ${sum.toLocaleString()}`);
      analysis.push(`  - Average: ${avg.toLocaleString()}`);
      analysis.push(`  - Median: ${median.toLocaleString()}`);
      analysis.push(`  - Min: ${min.toLocaleString()}`);
      analysis.push(`  - Max: ${max.toLocaleString()}`);
      analysis.push(`  - Range: ${(max - min).toLocaleString()}`);
      
      // Detect if it's likely currency, count, or percentage
      const colLower = col.toLowerCase();
      if (colLower.includes('revenue') || colLower.includes('sales') || colLower.includes('price') || colLower.includes('cost') || colLower.includes('amount')) {
        analysis.push(`  - Type: Likely CURRENCY (format with $)`);
      } else if (colLower.includes('count') || colLower.includes('items') || colLower.includes('quantity') || colLower.includes('sold')) {
        analysis.push(`  - Type: Likely COUNT (format as number, not currency)`);
      } else if (colLower.includes('percent') || colLower.includes('rate') || colLower.includes('ratio')) {
        analysis.push(`  - Type: Likely PERCENTAGE (format with %)`);
      }
      
      // Detect outliers
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const outliers = nums.filter(n => n < q1 - 1.5 * iqr || n > q3 + 1.5 * iqr);
      if (outliers.length > 0) {
        analysis.push(`  - Outliers detected: ${outliers.length} values`);
      }
    } else {
      // String/categorical analysis
      const uniqueValues = new Set(values.map(v => String(v)));
      analysis.push(`\n${col} (categorical):`);
      analysis.push(`  - Unique values: ${uniqueValues.size}`);
      analysis.push(`  - Total values: ${values.length}`);
      
      // Check if it's a date
      const datePattern = /^\d{4}-\d{2}-\d{2}/;
      if (values.some(v => datePattern.test(String(v)))) {
        analysis.push(`  - Type: Likely DATE`);
        const dates = values.map(v => new Date(String(v))).filter(d => !isNaN(d.getTime()));
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
          const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
          analysis.push(`  - Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
        }
      }
      
      // Show top values if not too many
      if (uniqueValues.size <= 20) {
        const valueCounts = new Map<string, number>();
        values.forEach(v => {
          const key = String(v);
          valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
        });
        const topValues = Array.from(valueCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
        analysis.push(`  - Top values: ${topValues.map(([val, count]) => `${val} (${count})`).join(', ')}`);
      }
    }
  });
  
  return analysis.join('\n');
}

/**
 * Generates an initial visualization plan based on user query and FULL data context
 */
export async function generateVisualizationPlan(
  userQuery: string,
  sqlQuery: string,
  queryResult: QueryResult
): Promise<VisualizationPlan> {
  try {
    // Don't visualize if no data
    if (queryResult.rows.length === 0) {
      return {
        chartType: 'none',
        reasoning: 'No data to visualize',
        shouldVisualize: false,
      };
    }

    // If too many columns, default to table only
    if (queryResult.columns.length > 8) {
      return {
        chartType: 'table',
        reasoning: 'Too many columns for effective visualization - showing data table instead',
        shouldVisualize: false,
      };
    }

    // Prepare FULL data context (all rows, not just sample)
    // For very large datasets, we'll still include all data but note the size
    const allData = JSON.stringify(queryResult.rows, null, 2);
    const dataSize = queryResult.rows.length;
    
    // Analyze column types with full context
    const columnAnalysis = queryResult.columns.map(col => {
      const sampleValue = queryResult.rows[0]?.[col];
      let type = 'string';
      if (typeof sampleValue === 'number') type = 'numeric';
      else if (sampleValue && /^\d{4}-\d{2}-\d{2}/.test(String(sampleValue))) type = 'date';
      else if (sampleValue && /^\d{2}:\d{2}:\d{2}/.test(String(sampleValue))) type = 'time';
      return `${col} (${type})`;
    });

    // Generate comprehensive data analysis
    const dataAnalysis = analyzeDataForContext(queryResult);

    const prompt = `You are an expert data visualization and business intelligence analyst for KUDU's analytics platform. Your task is to analyze the FULL dataset and create an optimal, insightful visualization that highlights key patterns and insights.

USER QUERY: "${userQuery}"

SQL QUERY: ${sqlQuery}

DATA STRUCTURE:
- Columns: ${columnAnalysis.join(', ')}
- Total rows: ${queryResult.rowCount}
- Data size: ${dataSize} rows

COMPREHENSIVE DATA ANALYSIS:
${dataAnalysis}

FULL DATASET (ALL ${dataSize} ROWS):
${allData}

YOUR TASK:
1. FIRST: Check if this is a day-by-day month comparison (look for "day_of_month" column + multiple month columns)
2. Analyze the COMPLETE dataset to identify key insights, patterns, trends, and anomalies
3. Determine the BEST visualization type that will highlight these insights
4. Configure formatting (currency vs count vs percentage) based on column names and data patterns
5. Suggest data transformations (sorting, filtering) if they would improve insight clarity
6. Generate key findings and recommendations based on the data

VISUALIZATION TYPES:
- **line**: Time series, trends over time, continuous data progression, MoM trends, day-by-day comparisons
- **bar**: Comparisons across categories, rankings, discrete values, YoY comparisons
- **pie**: Proportions/percentages of a whole (max 10 categories, use for part-to-whole relationships)
- **area**: Cumulative trends over time, volume over time, running totals
- **scatter**: Correlation between two numeric variables
- **table**: Raw data view, detailed records, no clear visual pattern
- **none**: Data not suitable for visualization (single values, too many columns, etc.)

SPECIAL PATTERN 1: DAY-BY-DAY MONTH COMPARISON
If you see:
- A column named "day_of_month" or "day" with values 1-31
- Multiple columns with month/year names (e.g., "nov_2025_sales", "oct_2025_sales")
- User query mentions "day by day", "daily comparison", or "compare [month] with [month]"

Then use:
- chartType: "line"
- xAxis.column: "day_of_month" (or "day")
- xAxis.label: "Day of Month"
- xAxis.type: "category"
- xAxis.visual.angle: 0 (keep horizontal, these are just numbers 1-31)
- yAxis.columns: [all the month columns like "nov_2025_sales", "oct_2025_sales"]
- title: Should mention the comparison clearly (e.g., "November vs October 2025 - Daily Sales Comparison")
- reasoning: "Line chart with day of month on X-axis allows direct day-to-day comparison between months"

SPECIAL PATTERN 2: MONTH-OVER-MONTH (MoM) COMPARISON
If you see:
- Columns named "sales_this_month" and "sales_prev_month" (exact names from SQL)
- A "month" column with DATE_TRUNC month values
- User query mentions "month over month", "MoM", "compare months", or similar

Then use:
- chartType: "line"
- xAxis.column: "month"
- xAxis.label: "Month"
- xAxis.type: "time" or "category"
- xAxis.visual.angle: -45 (for readability)
- yAxis.columns: ["sales_this_month", "sales_prev_month"] (BOTH columns as separate lines)
- title: "Month-over-Month Sales Comparison"
- reasoning: "Line chart showing current month vs previous month allows trend analysis"
- styling.colors: Use two distinct colors for the two lines
- insights: Compare sales_this_month vs sales_prev_month, calculate growth rates

FORMATTING RULES (CRITICAL):
- Columns with "revenue", "sales", "price", "cost", "amount", "total_revenue", "total_sales" → format as CURRENCY ($)
- Columns with "count", "items", "quantity", "sold", "items_sold", "total_items" → format as COUNT (number, NO $)
- Columns with "percent", "percentage", "rate", "ratio" → format as PERCENTAGE (%)
- Date columns → format appropriately based on granularity
- Numbers without clear indicator → use "auto" and let formatter detect

INSIGHT GENERATION:
Look for:
- Trends (increasing/decreasing over time)
- Outliers (unusually high/low values)
- Patterns (seasonality, cycles)
- Comparisons (top performers, bottom performers)
- Proportions (market share, distribution)
- Correlations (relationships between variables)

For day-by-day month comparisons specifically:
- Which month has higher average daily values?
- On which days do the months differ most?
- Are there consistent patterns (e.g., both months peak on similar days)?
- Beginning vs end of month performance differences
- Percentage difference between months

OUTPUT FORMAT (JSON only):
{
  "chartType": "line|bar|pie|area|scatter|table|none",
  "xAxis": {
    "column": "column_name",
    "label": "Human readable label",
    "type": "category|time|numeric",
    "format": {
      "type": "currency|number|percentage|date|count|auto",
      "currency": "USD" (if currency),
      "decimals": 0-2,
      "dateFormat": "YYYY-MM-DD" (if date),
      "scale": "linear|log|sqrt"
    },
    "visual": {
      "angle": -45 (for long labels),
      "tickInterval": 1,
      "maxLength": 20
    }
  },
  "yAxis": {
    "columns": ["column_name"],
    "label": "Human readable label",
    "aggregation": "sum|avg|count|none",
    "format": {
      "type": "currency|number|percentage|date|count|auto",
      "currency": "USD" (if currency),
      "decimals": 0-2,
      "scale": "linear|log|sqrt",
      "min": null,
      "max": null
    }
  },
  "groupBy": "column_name or null",
  "title": "Descriptive chart title highlighting key insight",
  "reasoning": "2-3 sentence explanation of visualization choice and key insights",
  "shouldVisualize": true|false,
  "styling": {
    "colors": ["#98B1D3", "#4CB49C", "#F3C32B"] (optional custom palette),
    "theme": "auto",
    "gridLines": true,
    "legend": {
      "show": true,
      "position": "top|bottom|left|right"
    },
    "tooltip": {
      "format": "full|abbreviated",
      "showPercentages": false
    }
  },
  "dataTransform": {
    "sort": {
      "column": "column_name",
      "direction": "asc|desc"
    },
    "filter": null,
    "limit": 50
  },
  "insights": {
    "keyFindings": [
      "Finding 1: [specific insight from data]",
      "Finding 2: [another insight]",
      "Finding 3: [trend or pattern]"
    ],
    "annotations": [],
    "recommendations": [
      "Recommendation 1",
      "Recommendation 2"
    ]
  },
  "validation": {
    "requiredColumns": ["column1", "column2"],
    "minRows": 1,
    "maxRows": 1000,
    "warnings": []
  }
}

IMPORTANT GUIDELINES:
1. Analyze the FULL dataset, not just samples - look for patterns across all data
2. Format detection: Use column names AND data patterns to determine format type
3. For "total_items_sold" or similar COUNT columns → format.type MUST be "count" (NOT "currency")
4. Generate 2-4 specific, data-driven insights in keyFindings
5. If data has >50 rows, consider sorting/filtering to show most relevant subset
6. Consider user intent from query - what are they trying to understand?
7. Highlight outliers, trends, and comparisons in insights
8. Set appropriate limits for performance (max 50-100 data points for charts)

EXAMPLE FOR DAY-BY-DAY MONTH COMPARISON:
If the data has columns: [day_of_month, nov_2025_sales, oct_2025_sales]
{
  "chartType": "line",
  "xAxis": {
    "column": "day_of_month",
    "label": "Day of Month",
    "type": "category",
    "visual": {
      "angle": 0,
      "tickInterval": 1
    }
  },
  "yAxis": {
    "columns": ["nov_2025_sales", "oct_2025_sales"],
    "label": "Sales",
    "format": {
      "type": "currency",
      "currency": "USD",
      "decimals": 0
    }
  },
  "title": "November vs October 2025 - Daily Sales Comparison",
  "reasoning": "Line chart showing day-by-day comparison allows users to see which days of the month performed better in each period",
  "shouldVisualize": true,
  "styling": {
    "colors": ["#98B1D3", "#4CB49C"],
    "gridLines": true,
    "legend": {
      "show": true,
      "position": "top"
    }
  },
  "dataTransform": {
    "limit": 31
  },
  "insights": {
    "keyFindings": [
      "November shows [X]% higher average daily sales compared to October",
      "Peak sales day differs: November peaks on day [X], October on day [Y]",
      "Weekend patterns show [pattern description]"
    ]
  }
}

EXAMPLE FOR MONTH-OVER-MONTH (MoM) COMPARISON:
If the data has columns: [month, sales_this_month, sales_prev_month]
{
  "chartType": "line",
  "xAxis": {
    "column": "month",
    "label": "Month",
    "type": "time",
    "visual": {
      "angle": -45,
      "tickInterval": 1
    }
  },
  "yAxis": {
    "columns": ["sales_this_month", "sales_prev_month"],
    "label": "Sales",
    "format": {
      "type": "currency",
      "currency": "USD",
      "decimals": 0
    }
  },
  "title": "Month-over-Month Sales Comparison",
  "reasoning": "Line chart with two series (current month vs previous month) shows month-over-month trends and growth patterns",
  "shouldVisualize": true,
  "styling": {
    "colors": ["#98B1D3", "#4CB49C"],
    "gridLines": true,
    "legend": {
      "show": true,
      "position": "top"
    }
  },
  "insights": {
    "keyFindings": [
      "Average MoM growth: [X]%",
      "Strongest growth month: [month] with [X]% increase",
      "Trend analysis: [increasing/decreasing/stable] pattern"
    ]
  }
}

Respond ONLY with valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert data visualization analyst. Analyze the complete dataset and generate insights. Respond only with valid JSON matching the specified format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Slightly higher for more creative insights
      max_tokens: 2000, // Increased for detailed responses
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      throw new Error('Empty response from OpenAI');
    }

    const plan: VisualizationPlan = JSON.parse(response);
    
    // Validate and set defaults
    if (!plan.chartType) plan.chartType = 'table';
    if (plan.shouldVisualize === undefined) {
      plan.shouldVisualize = plan.chartType !== 'none' && plan.chartType !== 'table';
    }
    
    // Validate required columns exist
    if (plan.xAxis?.column && !queryResult.columns.includes(plan.xAxis.column)) {
      console.warn(`[VIZ PLAN] X-axis column "${plan.xAxis.column}" not found, using first column`);
      plan.xAxis.column = queryResult.columns[0];
    }
    
    if (plan.yAxis?.columns) {
      plan.yAxis.columns = plan.yAxis.columns.filter(col => queryResult.columns.includes(col));
      if (plan.yAxis.columns.length === 0) {
        plan.yAxis.columns = [queryResult.columns[1] || queryResult.columns[0]];
      }
    }
    
    // Set default formatting if not provided
    if (plan.yAxis && !plan.yAxis.format) {
      const colName = plan.yAxis.columns[0]?.toLowerCase() || '';
      if (colName.includes('items_sold') || colName.includes('count') || colName.includes('quantity')) {
        plan.yAxis.format = { type: 'count', decimals: 0 };
      } else if (colName.includes('revenue') || colName.includes('sales') || colName.includes('price')) {
        plan.yAxis.format = { type: 'currency', currency: 'USD', decimals: 0 };
      }
    }

    console.log('[VIZ PLAN]', JSON.stringify(plan, null, 2));
    return plan;

  } catch (error) {
    console.error('Visualization planning error:', error);
    // Fallback to table view
    return {
      chartType: 'table',
      reasoning: 'Could not generate visualization plan, defaulting to table view',
      shouldVisualize: false,
    };
  }
}

/**
 * Regenerates visualization plan based on user feedback
 */
export async function regenerateVisualizationWithFeedback(
  feedbackMessage: string,
  currentPlan: VisualizationPlan,
  queryResult: QueryResult,
  conversationHistory: any[] = []
): Promise<VisualizationPlan> {
  try {
    const availableColumns = queryResult.columns.map(col => {
      const sampleValue = queryResult.rows[0]?.[col];
      let type = 'string';
      if (typeof sampleValue === 'number') type = 'numeric';
      else if (sampleValue && /^\d{4}-\d{2}-\d{2}/.test(String(sampleValue))) type = 'date';
      return `${col} (${type})`;
    });

    const prompt = `You are a data visualization expert. The user wants to modify the current visualization.

USER FEEDBACK: "${feedbackMessage}"

CURRENT VISUALIZATION PLAN:
${JSON.stringify(currentPlan, null, 2)}

AVAILABLE COLUMNS IN DATA:
${availableColumns.join(', ')}

YOUR TASK:
Parse the user's feedback and update the visualization plan accordingly.

COMMON FEEDBACK PATTERNS:
- "make it a [type] chart" → change chartType
- "put [column] on x-axis" → update xAxis.column
- "show [column] on y-axis" → update yAxis.columns
- "change to [type]" → change chartType
- "use [column] for x" → update xAxis.column

RULES:
1. ONLY update fields explicitly mentioned by the user
2. Preserve other fields from current plan
3. Validate that requested columns exist in available columns
4. If requested column doesn't exist, suggest closest match and explain
5. Set shouldVisualize based on final chartType (false for "none" or "table")

OUTPUT FORMAT (JSON only):
Use the same enhanced VisualizationPlan format as the main generator, preserving all existing fields unless explicitly changed.

Respond ONLY with valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a data visualization expert. Respond only with valid JSON matching the specified format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      throw new Error('Empty response from OpenAI');
    }

    const updatedPlan: VisualizationPlan = JSON.parse(response);
    
    // Validate and set defaults
    if (!updatedPlan.chartType) updatedPlan.chartType = currentPlan.chartType;
    if (updatedPlan.shouldVisualize === undefined) {
      updatedPlan.shouldVisualize = updatedPlan.chartType !== 'none' && updatedPlan.chartType !== 'table';
    }
    
    // Validate columns exist
    if (updatedPlan.xAxis?.column && !queryResult.columns.includes(updatedPlan.xAxis.column)) {
      updatedPlan.xAxis.column = currentPlan.xAxis?.column || queryResult.columns[0];
    }
    
    if (updatedPlan.yAxis?.columns) {
      updatedPlan.yAxis.columns = updatedPlan.yAxis.columns.filter(col => queryResult.columns.includes(col));
      if (updatedPlan.yAxis.columns.length === 0) {
        updatedPlan.yAxis.columns = currentPlan.yAxis?.columns || [queryResult.columns[1] || queryResult.columns[0]];
      }
    }

    console.log('[VIZ PLAN UPDATED]', JSON.stringify(updatedPlan, null, 2));
    return updatedPlan;

  } catch (error) {
    console.error('Visualization feedback error:', error);
    // Return current plan if update fails
    return {
      ...currentPlan,
      reasoning: 'Could not process feedback, keeping current visualization',
    };
  }
}
