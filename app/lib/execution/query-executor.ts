import { executeQuery } from '../db/redshift';
import { validateSQL } from '../ai/sql-generator';
import { QueryResult, ExecutionResult, SQLPlan } from '@/app/types/database';

/**
 * Executes a single SQL query with validation
 */
async function executeSingleQuery(sql: string, timeoutMs: number = 30000): Promise<QueryResult> {
  // Validate SQL for safety
  if (!validateSQL(sql)) {
    throw new Error('Generated query failed security validation');
  }

  // Execute query
  return await executeQuery(sql, timeoutMs);
}

/**
 * Executes multiple queries sequentially
 */
async function executeMultipleQueries(queries: string[], timeoutMs: number = 30000): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  
  for (const query of queries) {
    console.log(`[MULTI-QUERY] Executing query ${results.length + 1}/${queries.length}`);
    const result = await executeSingleQuery(query, timeoutMs);
    results.push(result);
  }
  
  return results;
}

/**
 * Main function: Executes query plan and returns combined results
 */
export async function executeQueryPlan(plan: SQLPlan, timeoutMs: number = 30000): Promise<ExecutionResult> {
  const startTime = Date.now();
  
  if (plan.queries.length === 0) {
    throw new Error('Query plan contains no queries');
  }

  let intermediateResults: QueryResult[] = [];
  let combinedResult: QueryResult;

  if (plan.strategy === 'single' || plan.queries.length === 1) {
    // Single query execution
    combinedResult = await executeSingleQuery(plan.queries[0], timeoutMs);
  } else {
    // Multi-query execution
    intermediateResults = await executeMultipleQueries(plan.queries, timeoutMs);
    
    // For now, return the first result as combined
    // The result-combiner will handle actual combination
    combinedResult = intermediateResults[0];
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    combinedResult,
    intermediateResults: intermediateResults.length > 0 ? intermediateResults : undefined,
    executionTimeMs,
    queriesExecuted: plan.queries.length,
  };
}

