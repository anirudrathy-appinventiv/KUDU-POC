import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateSQL, validateSQL } from '@/app/lib/ai/sql-generator';
import { executeQuery } from '@/app/lib/db/redshift';
import { generateSummary } from '@/app/lib/ai/summarizer';
import { classifyIntent, generateGeneralResponse } from '@/app/lib/ai/intent-classifier';
import { generateVisualizationPlan, regenerateVisualizationWithFeedback } from '@/app/lib/ai/visualization-planner';
import { analyzeQuery } from '@/app/lib/ai/query-analyzer';
import { generateAnalyticalSQL } from '@/app/lib/ai/advanced-sql-generator';
import { executeQueryPlan } from '@/app/lib/execution/query-executor';
import { combineResults, calculateMetrics } from '@/app/lib/execution/result-combiner';
import { ChatMessage, ChatResponse } from '@/app/types/database';

const requestSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z.array(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory = [] } = requestSchema.parse(body);

    // Classify user intent first (with conversation history for context)
    const intent = await classifyIntent(message, conversationHistory as ChatMessage[]);
    console.log('[INTENT]', intent.intent, 'confidence:', intent.confidence);

    // Handle general conversation
    if (intent.intent === 'general_conversation') {
      const generalResponse = await generateGeneralResponse(message, conversationHistory as ChatMessage[]);
      
      return NextResponse.json({
        message: generalResponse,
        sqlQuery: undefined,
        result: null,
        summary: undefined,
      } as ChatResponse);
    }

    // Handle visualization feedback (change chart type, axes, etc.)
    if (intent.intent === 'visualization_feedback') {
      // Get the last assistant message with query result
      const lastAssistantMessage = conversationHistory
        .slice()
        .reverse()
        .find((msg: any) => msg.role === 'assistant' && msg.queryResult);

      if (!lastAssistantMessage || !(lastAssistantMessage as any).queryResult) {
        return NextResponse.json({
          message: "I don't have any recent data to visualize. Please ask a data query first.",
          error: 'No previous query result found for visualization',
        } as ChatResponse, { status: 400 });
      }

      const currentPlan = (lastAssistantMessage as any).visualizationPlan;
      const queryResult = (lastAssistantMessage as any).queryResult;

      try {
        const updatedPlan = await regenerateVisualizationWithFeedback(
          message,
          currentPlan,
          queryResult,
          conversationHistory as ChatMessage[]
        );

        return NextResponse.json({
          message: 'Updated visualization based on your feedback.',
          result: queryResult,
          summary: (lastAssistantMessage as any).summary,
          visualizationPlan: updatedPlan,
        } as ChatResponse);
      } catch (error: any) {
        console.error('Visualization feedback error:', error);
        return NextResponse.json({
          message: 'Could not update visualization. Please try rephrasing your request.',
          error: error.message,
        } as ChatResponse, { status: 400 });
      }
    }

    // Proceed with SQL generation for data queries
    // Step 1: Analyze query for analytical patterns
    let queryAnalysis;
    try {
      queryAnalysis = await analyzeQuery(message, conversationHistory as ChatMessage[]);
      console.log('[QUERY ANALYSIS]', queryAnalysis);
    } catch (error: any) {
      console.error('Query analysis failed:', error);
      // Fall back to simple analysis
      queryAnalysis = {
        pattern: null,
        complexity: 'simple' as const,
        strategy: 'single' as const,
        estimatedRows: 1000000,
        timeoutRisk: 'low' as const,
        reasoning: 'Query analysis failed, using simple strategy',
      };
    }

    // Step 2: Generate SQL (analytical or simple)
    let sqlQuery: string;
    let sqlPlan;
    let calculatedMetrics;
    
    try {
      if (queryAnalysis.pattern && queryAnalysis.strategy !== 'single') {
        // Complex analytical query - use advanced generator
        console.log('[ANALYTICAL MODE] Using advanced SQL generation');
        sqlPlan = await generateAnalyticalSQL(message, queryAnalysis, conversationHistory as ChatMessage[]);
        
        if (sqlPlan.queries.length === 0) {
          // Fallback to simple generator
          console.log('[FALLBACK] Advanced generator returned no queries, using simple generator');
          sqlQuery = await generateSQL(message, conversationHistory as ChatMessage[]);
        } else {
          // For display purposes, show the first query or combined description
          sqlQuery = sqlPlan.queries.length === 1 
            ? sqlPlan.queries[0] 
            : `-- ${sqlPlan.description}\n\n${sqlPlan.queries[0]}`;
        }
      } else {
        // Simple query - use existing generator
        console.log('[SIMPLE MODE] Using standard SQL generation');
        sqlQuery = await generateSQL(message, conversationHistory as ChatMessage[]);
      }
      
      console.log('[SQL QUERY]', sqlQuery.substring(0, 200));
      
      // CRITICAL: Validate SQL for safety BEFORE execution
      const queryToValidate = sqlPlan?.queries[0] || sqlQuery;
      if (!validateSQL(queryToValidate)) {
        console.error('[SECURITY] Blocked unsafe SQL query:', {
          sql: queryToValidate.substring(0, 200),
          timestamp: new Date().toISOString(),
          userMessage: message.substring(0, 100),
        });
        
        return NextResponse.json(
          {
            error: 'Generated query contains unsafe operations. Only SELECT queries are allowed.',
            sqlQuery: process.env.NODE_ENV === 'development' ? sqlQuery : undefined,
          },
          { status: 400 }
        );
      }
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Failed to generate SQL: ${error.message}`,
        },
        { status: 400 }
      );
    }

    // Step 3: Execute query (single or multi-query plan)
    let queryResult;
    try {
      if (sqlPlan && sqlPlan.queries.length > 0) {
        // Execute query plan (may include multiple queries)
        console.log('[EXECUTION] Executing query plan with', sqlPlan.queries.length, 'queries');
        const executionResult = await executeQueryPlan(sqlPlan, 30000);
        
        // Combine results if multiple queries
        if (executionResult.intermediateResults && executionResult.intermediateResults.length > 1) {
          console.log('[COMBINE] Combining', executionResult.intermediateResults.length, 'result sets');
          queryResult = combineResults(executionResult.intermediateResults, sqlPlan.pattern);
          
          // Calculate additional metrics
          calculatedMetrics = calculateMetrics(queryResult, sqlPlan.pattern);
          console.log('[METRICS]', calculatedMetrics);
        } else {
          queryResult = executionResult.combinedResult;
        }
        
        console.log('[EXECUTION] Completed in', executionResult.executionTimeMs, 'ms');
      } else {
        // Simple single query execution
        queryResult = await executeQuery(sqlQuery, 30000);
      }
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Query execution failed: ${error.message}`,
          sqlQuery,
        },
        { status: 500 }
      );
    }

    // Step 4: Generate summary (with analytical context if available)
    let summary: string;
    try {
      summary = await generateSummary(sqlQuery, queryResult, queryAnalysis?.pattern, calculatedMetrics);
    } catch (error) {
      console.error('Summary generation failed:', error);
      summary = 'Summary generation failed, but query executed successfully.';
    }

    // Generate visualization plan
    let visualizationPlan;
    try {
      visualizationPlan = await generateVisualizationPlan(message, sqlQuery, queryResult);
    } catch (error) {
      console.error('Visualization planning failed:', error);
      // Continue without visualization plan
    }

    // Extract top results for drill-down context
    const topResults: string[] = [];
    if (queryResult.rows.length > 0 && queryResult.columns.length > 0) {
      const topRows = queryResult.rows.slice(0, 3);
      const firstColumn = queryResult.columns[0];
      topResults.push(...topRows.map(row => String(row[firstColumn] || '')).filter(Boolean));
    }

    // Prepare response
    const response: ChatResponse = {
      message: `Query executed successfully. Found ${queryResult.rowCount} rows.`,
      sqlQuery,
      result: queryResult,
      summary,
      visualizationPlan,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Chat API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format', details: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

