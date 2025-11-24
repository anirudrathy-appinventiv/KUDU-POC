import { Pool, QueryResult as PGQueryResult } from 'pg';
import { QueryResult } from '@/app/types/database';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.REDSHIFT_HOST,
      port: parseInt(process.env.REDSHIFT_PORT || '5439'),
      database: process.env.REDSHIFT_DATABASE,
      user: process.env.REDSHIFT_USER,
      password: process.env.REDSHIFT_PASSWORD,
      ssl: process.env.REDSHIFT_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 5, // Maximum number of clients in the pool
      idleTimeoutMillis: 300000,
      connectionTimeoutMillis: 100000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  return pool;
}

export async function executeQuery(sql: string, timeoutMs: number = 60000): Promise<QueryResult> {
  // FINAL SAFETY CHECK: Never execute non-SELECT queries
  // This is the last line of defense before database execution
  const upperSql = sql.trim().toUpperCase();
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    throw new Error('Only SELECT queries (including CTEs with WITH) are allowed. Query execution blocked for safety.');
  }

  // Additional check for dangerous keywords (redundant but critical)
  const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE'];
  for (const keyword of dangerousKeywords) {
    if (upperSql.includes(keyword)) {
      throw new Error(`Query execution blocked: Dangerous operation detected (${keyword}). Only SELECT queries are allowed.`);
    }
  }

  const client = await getPool().connect();
  
  try {
    // Set query timeout
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    await client.query(`SET search_path TO gold`);
    
    // Log query execution for auditing (in production, use proper logging service)
    if (process.env.NODE_ENV === 'production') {
      console.log('[QUERY EXECUTION]', {
        timestamp: new Date().toISOString(),
        queryPreview: sql.substring(0, 100),
        timeout: timeoutMs,
      });
    }
    
    const result: PGQueryResult = await client.query(sql);
    
    // PostgreSQL pg library returns rows as objects by default
    // Each row is already an object keyed by column name
    const columns = result.fields.map(field => field.name);
    
    // result.rows is already an array of objects like:
    // [{ column1: value1, column2: value2 }, ...]
    // No conversion needed!
    const rows = result.rows;

    return {
      columns,
      rows,
      rowCount: result.rowCount || rows.length,
    };
  } catch (error) {
    console.error('Query execution error:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await executeQuery('SELECT 1 as test');
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

