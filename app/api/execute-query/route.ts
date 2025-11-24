import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/app/lib/db/redshift';
import { validateSQL } from '@/app/lib/ai/sql-generator';
import { z } from 'zod';

const requestSchema = z.object({
  sqlQuery: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sqlQuery } = requestSchema.parse(body);

    // Validate SQL for security
    const isValid = validateSQL(sqlQuery);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid SQL query' },
        { status: 400 }
      );
    }

    // Execute the query
    const result = await executeQuery(sqlQuery);

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('[EXECUTE-QUERY] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to execute query' },
      { status: 500 }
    );
  }
}

