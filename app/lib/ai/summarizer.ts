import OpenAI from 'openai';
import { QueryResult, AnalyticalPattern } from '@/app/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateSummary(
  sqlQuery: string,
  queryResult: QueryResult,
  pattern?: AnalyticalPattern | null,
  calculatedMetrics?: Record<string, any>
): Promise<string> {
  try {
    // Prepare a sample of the data for summarization
    const sampleRows = queryResult.rows.slice(0, 10);
    const dataSample = JSON.stringify(sampleRows, null, 2);

    // Build analytical context if pattern is detected
    let analyticalContext = '';
    if (pattern) {
      analyticalContext = `\n\nAnalytical Pattern: ${pattern.replace(/_/g, ' ')}`;
      
      if (calculatedMetrics) {
        analyticalContext += '\n\nCalculated Metrics:';
        if (calculatedMetrics.averageGrowth !== undefined) {
          analyticalContext += `\n- Average Growth: ${calculatedMetrics.averageGrowth.toFixed(1)}%`;
        }
        if (calculatedMetrics.maxGrowth !== undefined) {
          analyticalContext += `\n- Best Performer: ${calculatedMetrics.maxGrowth.toFixed(1)}% growth`;
        }
        if (calculatedMetrics.minGrowth !== undefined) {
          analyticalContext += `\n- Worst Performer: ${calculatedMetrics.minGrowth.toFixed(1)}% growth`;
        }
        if (calculatedMetrics.positiveCount !== undefined) {
          analyticalContext += `\n- Growing entities: ${calculatedMetrics.positiveCount}`;
        }
        if (calculatedMetrics.negativeCount !== undefined) {
          analyticalContext += `\n- Declining entities: ${calculatedMetrics.negativeCount}`;
        }
      }
    }

    const prompt = `You are a data analyst for KUDU, a famous food chain company in Saudi Arabia. Analyze the following query results and provide a concise, business-focused summary (2-3 sentences).

SQL Query:
${sqlQuery}

Query Results:
- Total rows: ${queryResult.rowCount}
- Columns: ${queryResult.columns.join(', ')}
- Sample data (first ${sampleRows.length} rows):
${dataSample}
${analyticalContext}

${pattern ? `
ANALYTICAL SUMMARY REQUIREMENTS:
- This is a ${pattern.replace(/_/g, ' ').toLowerCase()} analysis
- Highlight key comparisons and trends
- Call out best and worst performers
- Mention growth/decline patterns
- Provide actionable insights for KUDU management
` : ''}

Provide a brief, insightful summary relevant to KUDU's business operations. Focus on key insights, trends, or notable findings that would help KUDU's management make data-driven decisions.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `You are a helpful data analyst for KUDU food chain company. You provide concise, insightful summaries of query results with a focus on business insights relevant to restaurant operations, sales, customer behavior, and store performance. ${pattern ? 'You specialize in analytical summaries for comparative and trend analysis.' : ''}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 250,
    });

    return completion.choices[0]?.message?.content?.trim() || 'No summary available.';
  } catch (error) {
    console.error('Error generating summary:', error);
    return 'Unable to generate summary at this time.';
  }
}

