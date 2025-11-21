import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { executeQuery } from '@/app/lib/db/redshift';
import { validateSQL } from '@/app/lib/ai/sql-generator';

const requestSchema = z.object({
  query: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = requestSchema.parse(body);

    // Validate SQL for safety
    if (!validateSQL(query)) {
      return NextResponse.json(
        {
          error: 'Query contains unsafe operations. Only SELECT queries are allowed.',
        },
        { status: 400 }
      );
    }

    // Execute query
    let queryResult;
    try {
      queryResult = await executeQuery(query, 30000); // 30 second timeout
    } catch (error: any) {
      return NextResponse.json(
        {
          error: `Query execution failed: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      result: queryResult,
    });
  } catch (error: any) {
    console.error('Test query API error:', error);
    
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

