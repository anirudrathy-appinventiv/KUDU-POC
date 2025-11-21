import OpenAI from 'openai';
import { QueryResult } from '@/app/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface VisualizationPlan {
  chartType: 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'table' | 'none';
  xAxis?: {
    column: string;
    label: string;
    type: 'category' | 'time' | 'numeric';
  };
  yAxis?: {
    columns: string[];
    label: string;
    aggregation?: 'sum' | 'avg' | 'count' | 'none';
  };
  groupBy?: string;
  title?: string;
  reasoning: string;
  shouldVisualize: boolean;
}

/**
 * Generates an initial visualization plan based on user query and data structure
 */
export async function generateVisualizationPlan(
  userQuery: string,
  sqlQuery: string,
  queryResult: QueryResult
): Promise<VisualizationPlan> {
  try {
    // Don't visualize if no data or too many columns for effective viz
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

    // Prepare data sample
    const sampleRows = queryResult.rows.slice(0, 5);
    const dataSample = JSON.stringify(sampleRows, null, 2);

    // Analyze column types
    const columnAnalysis = queryResult.columns.map(col => {
      const sampleValue = queryResult.rows[0]?.[col];
      let type = 'string';
      if (typeof sampleValue === 'number') type = 'numeric';
      else if (sampleValue && /^\d{4}-\d{2}-\d{2}/.test(String(sampleValue))) type = 'date';
      else if (sampleValue && /^\d{2}:\d{2}:\d{2}/.test(String(sampleValue))) type = 'time';
      return `${col} (${type})`;
    });

    const prompt = `You are a data visualization expert for KUDU's business intelligence system. Analyze the following query and results to create an optimal visualization plan.

USER QUERY: "${userQuery}"

SQL QUERY: ${sqlQuery}

DATA STRUCTURE:
- Columns: ${columnAnalysis.join(', ')}
- Row count: ${queryResult.rowCount}
- Sample data (first 5 rows):
${dataSample}

YOUR TASK:
Analyze the data and user intent to determine the BEST visualization approach.

VISUALIZATION TYPES:
- **line**: Time series, trends over time, continuous data progression, MoM trends
- **bar**: Comparisons across categories, rankings, discrete values, YoY comparisons
- **pie**: Proportions/percentages of a whole (max 10 categories)
- **area**: Cumulative trends over time, volume over time, running totals
- **scatter**: Correlation between two numeric variables
- **table**: Raw data view, detailed records, no clear visual pattern
- **none**: Data not suitable for visualization (single values, too many columns, etc.)

DECISION CRITERIA:
1. **Time series data** (dates/timestamps) → line or area chart
2. **Category comparisons** (stores, products, regions) → bar chart
3. **Part-to-whole** (market share, composition, ≤10 items) → pie chart
4. **Rankings/Top N** → horizontal bar chart
5. **Detailed records** or **>8 columns** → table only
6. **Single metric** → no visualization needed
7. **Temporal breakdown** (by month, week) → line chart

ANALYTICAL PATTERNS (PRIORITY):
8. **Year-over-Year (YoY)** with multiple metrics (e.g., sales_2024, sales_2025) → **grouped bar chart**
9. **Month-over-Month (MoM)** with time column → **line chart** showing trend
10. **Rolling averages** with date + average column → **line chart** with smoothed data
11. **Cumulative sums** with date + cumulative column → **area chart**
12. **Growth rates** with percent columns → **bar chart** with color coding (green=positive, red=negative)

KUDU BUSINESS CONTEXT:
- Sales data, store performance, product analytics
- Common patterns: sales over time, store comparisons, product mix, YoY growth analysis
- Revenue, orders, customers are key metrics
- Analytical comparisons (YoY, MoM, QoQ) are frequent for performance tracking

OUTPUT FORMAT (JSON only):
{
  "chartType": "line|bar|pie|area|scatter|table|none",
  "xAxis": {
    "column": "column_name",
    "label": "Human readable label",
    "type": "category|time|numeric"
  },
  "yAxis": {
    "columns": ["column_name"],
    "label": "Human readable label",
    "aggregation": "sum|avg|count|none"
  },
  "groupBy": "column_name or null",
  "title": "Chart title",
  "reasoning": "1-2 sentence explanation of why this visualization is best",
  "shouldVisualize": true|false
}

IMPORTANT:
- If data has 1-2 columns with clear x/y relationship → visualize
- If data has >6 columns or is very tabular → table only (shouldVisualize: false)
- Consider user intent: "show me" = visualize, "list all details" = table
- For KUDU business: sales over time = line, store comparisons = bar, product mix = pie
- If temporal column exists (date, month, week), prefer line chart for trends
- Set shouldVisualize to false if chartType is "none" or "table"

Respond ONLY with valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
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
      max_tokens: 500,
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
{
  "chartType": "line|bar|pie|area|scatter|table|none",
  "xAxis": {
    "column": "column_name",
    "label": "Human readable label",
    "type": "category|time|numeric"
  },
  "yAxis": {
    "columns": ["column_name"],
    "label": "Human readable label",
    "aggregation": "sum|avg|count|none"
  },
  "groupBy": "column_name or null",
  "title": "Chart title",
  "reasoning": "Explanation of changes made based on user feedback",
  "shouldVisualize": true|false
}

Respond ONLY with valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
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
      max_tokens: 500,
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

