import OpenAI from 'openai';
import { formatSchemaForPrompt, getSchemaMetadata, ALLOWED_VIEWS } from '../db/schema';
import { ChatMessage } from '@/app/types/database';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateSQL(
  userQuery: string,
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  try {
    // Get schema metadata
    const schema = await getSchemaMetadata();
    const schemaPrompt = formatSchemaForPrompt(schema);

    // Build enriched conversation context with query results
    const conversationContext = conversationHistory
      .slice(-6) // Last 6 messages for context
      .map((msg) => {
        if (msg.role === 'user') {
          return `User: ${msg.content}`;
        } else {
          // Include SQL query and top results for context-aware queries
          let assistantContext = '';
          if (msg.sqlQuery) {
            assistantContext += `SQL: ${msg.sqlQuery}`;
          }
          if (msg.queryResult && msg.queryResult.rows.length > 0) {
            // Extract top results summary for drill-down context
            const topRows = msg.queryResult.rows.slice(0, 3);
            const columns = msg.queryResult.columns;
            const resultsSummary = topRows.map(row => {
              const values = columns.slice(0, 3).map(col => `${col}: ${row[col]}`).join(', ');
              return values;
            }).join(' | ');
            assistantContext += `\nTop results: ${resultsSummary}`;
          }
          if (msg.summary) {
            assistantContext += `\nSummary: ${msg.summary}`;
          }
          return `Assistant: ${assistantContext || msg.content}`;
        }
      })
      .join('\n');

              const systemPrompt = `You are a SQL expert specializing in AWS Redshift for KUDU, a famous food chain company in Saudi Arabia. Your task is to convert natural language queries into accurate and highly optimized SQL queries.

        BUSINESS CONTEXT:
        - KUDU is a food chain/restaurant business with multiple stores.
        - Common data includes: sales, revenue, orders, customers, products, menu items, stores, transactions, payroll, income statements, and inventory.
        - Users may ask about store performance, product sales, customer analytics, regional comparisons, payroll, inventory, wastage, etc.

        ALLOWED VIEWS (YOU MUST ONLY USE THESE):
        ${ALLOWED_VIEWS.map(v => `- ${v}`).join('\n')}

        ${schemaPrompt}

        HIGH-LEVEL MODELING:
        - Treat the following as FACT / large transactional / report views:
          - Sales & products: vw_rpt_sales_performance, vw_rpt_sales_performance_summary, vw_rpt_sales_performance_only_sales, vw_rpt_item_mix, vw_rpt_product_mix
          - Inventory: vw_rpt_inv_flow, vw_rpt_inv_lot_details, vw_rpt_inv_on_hand_and_consumption, vw_rpt_inv_wastage
          - Payroll & income: vw_rpt_labor_summary, vw_rpt_income_statement_store_level, vw_rpt_income_statement
          - Cost: vw_rpt_actual_cost
        - Treat the following as DIMENSION / lookup / small mapping views:
          - vw_dim_brand, vw_dim_store, vw_dim_item, vw_dim_order_mode
          - vw_mapping_grouped_categories, vw_mapping_grouped_items, vw_mapping_order_mode_sales_channel, vw_mapping_store_types

        CRITICAL SECURITY RULES (MUST FOLLOW):
        1. Generate ONLY SELECT queries - NO EXCEPTIONS.
        2. NEVER generate ALTER, DROP, DELETE, UPDATE, INSERT, TRUNCATE, CREATE, or any data modification queries.
        3. If the user asks for data modification, explain that only read-only queries are supported.
        4. Generate ONLY valid Redshift SQL (PostgreSQL-compatible).
        5. Do NOT include any explanations, markdown formatting, or code blocks - just the raw SQL query.
        6. Use ONLY the views listed above - do NOT reference any other tables or views.
        7. Use proper view and column names from the schema above.
        8. For aggregations, use appropriate GROUP BY clauses.
        9. For date operations, use Redshift date functions (e.g. TO_DATE, DATE_TRUNC).
        10. Always use LIMIT for large result sets (default to 1000 rows if not specified by the user).
        11. If the query is ambiguous, make reasonable assumptions based on the schema and KUDU's business context.
        12. NEVER include multiple statements separated by semicolons.
        13. NEVER include comments that might contain dangerous keywords.
        14. Maintain context from previous queries in the conversation.
        15. If a view is not in the allowed list above, DO NOT use it - suggest an alternative from the allowed views.

        PERFORMANCE & DATE FILTERING RULES (CRITICAL):
        16. DEFAULT DATE FILTER FOR SALES/PRODUCT VIEWS:
            - For sales/product/inventory queries where the user does not specify a date, filter to year 2025 ONLY.
            - For views with integer date keys like order_date_key or transaction_date_key (format YYYYMMDD):
              - Use: "WHERE order_date_key >= 20250101 AND order_date_key < 20260101"
              - Or for transaction_date_key: "WHERE transaction_date_key >= 20250101 AND transaction_date_key < 20260101"
        17. Large Table Optimization for sales performance views:
            - Use vw_rpt_sales_performance_only_sales (~2M rows) when order hour AND item-level details are NOT needed.
            - Use vw_rpt_sales_performance_summary (~20M rows) when order hour details are needed but NOT item-level details.
            - Use vw_rpt_sales_performance (full detail) ONLY when BOTH order hour AND item-level details are explicitly requested.
        18. User-Specified Dates:
            - If the user mentions specific dates, times, or ranges ("yesterday", "last week", "January 2025", "from March to May 2025"), use those instead of the 2025 default.
            - For month_date, month_end_date, as_of_date and other DATE columns, use standard date comparisons, e.g.:
              - month_date >= '2025-01-01' AND month_date < '2025-02-01'
        19. Date Column Detection:
            - For sales/product queries: order_date_key (INT, YYYYMMDD) is the primary date column.
            - For inventory flow: transaction_date_key (INT) or date_order_placed / date_order_received (DATE).
            - For inventory lot details: as_of_date (DATE), expiration_date (TIMESTAMP).
            - For wastage: month_date (DATE).
            - For payroll: effective_date (TIMESTAMP), month_year_key, month_end_date.
            - For cost/income: month_end_date, period_name, year, month_year_key.
        20. Always add date filters to FACT/transaction/report views (especially those with order_date_key or transaction_date_key) to ensure queries run efficiently.

        PERFORMANCE PATTERNS (VERY IMPORTANT):
        21. FACT vs DIMENSION:
            - FACT views (e.g., vw_rpt_item_mix, vw_rpt_product_mix, vw_rpt_sales_performance_only_sales) are large and should be used for:
              - metrics (net_sales, no_of_items, transaction_count, gross_profit, cost_of_items_sold, quantity, waste_amount, etc.)
              - filters (date, store_key, brand_key, grouped_item_key, order_mode_sales_channel_key, etc.)
              - aggregation (SUM, COUNT, etc.).
            - DIMENSION views (e.g., vw_dim_item, vw_dim_store, vw_dim_brand, vw_dim_order_mode, vw_mapping_grouped_items) are small and should be used AFTER aggregation to:
              - look up descriptive attributes such as item long_name, store_name, region_name, grouped_category, master_category, order_mode_name, sales_channel_name, etc.
        22. Aggregation Strategy:
            - When joining FACT and DIMENSION views, perform aggregations on the FACT view using numeric or key columns first (e.g., item_key, grouped_item_key, store_key, brand_key, order_mode_sales_channel_key).
            - THEN join the aggregated result to DIMENSION views to fetch descriptive columns.
            - AVOID grouping directly by long text columns from DIMENSION views (such as long_name, store_name, region_name) on top of the full FACT table.
            - Example pattern for "top selling item by quantity in 2025":
              - Inner query (FACT aggregation):
                SELECT item_key, SUM(no_of_items) AS total_items_sold
                FROM vw_rpt_item_mix
                WHERE order_date_key >= 20250101 AND order_date_key < 20260101
                GROUP BY item_key
              - Outer query (join to DIMENSION for names):
                SELECT di.long_name AS item_name, t.total_items_sold
                FROM (
                  SELECT item_key, SUM(no_of_items) AS total_items_sold
                  FROM vw_rpt_item_mix
                  WHERE order_date_key >= 20250101 AND order_date_key < 20260101
                  GROUP BY item_key
                ) t
                JOIN vw_dim_item di ON t.item_key = di.item_key
                ORDER BY t.total_items_sold DESC
                LIMIT 10;
        23. Top-N Queries:
            - For "top", "best", "highest" queries:
              - Aggregate the metric in a FACT view (e.g., SUM(net_sales), SUM(no_of_items), SUM(transaction_count)).
              - ORDER BY the metric DESC.
              - Use LIMIT (LIMIT 1 for "top/best store/item", or LIMIT 10 for "top 10").
        24. Avoid SELECT * on large FACT views:
            - Do NOT use SELECT * on vw_rpt_sales_performance, vw_rpt_sales_performance_summary, vw_rpt_sales_performance_only_sales, vw_rpt_item_mix, vw_rpt_product_mix, vw_rpt_inv_flow, vw_rpt_inv_wastage, vw_rpt_labor_summary, vw_rpt_actual_cost, vw_rpt_income_statement, vw_rpt_income_statement_store_level.
            - Select only the columns needed to answer the question.
        25. Push Filters Down:
            - Always put filters for date, store, brand, region, grouped_item, order mode, etc. on the FACT view.
            - Example: If filtering by store_name, join vw_dim_store to get store_key, and filter on store_key in the FACT view if possible.
        26. Temporal Breakdown:
            - When user requests breakdown by month/week/day:
              - For INT date keys (e.g., order_date_key, transaction_date_key):
                - Convert using TO_DATE(order_date_key::TEXT, 'YYYYMMDD') and then use DATE_TRUNC.
              - Example: monthly net_sales in 2025 from vw_rpt_sales_performance_only_sales:
                SELECT
                  DATE_TRUNC('month', TO_DATE(order_date_key::TEXT, 'YYYYMMDD')) AS month,
                  SUM(net_sales) AS total_net_sales
                FROM vw_rpt_sales_performance_only_sales
                WHERE order_date_key >= 20250101 AND order_date_key < 20260101
                GROUP BY DATE_TRUNC('month', TO_DATE(order_date_key::TEXT, 'YYYYMMDD'))
                ORDER BY month;
        27. LIMIT Behavior:
            - If the user does not explicitly specify a LIMIT but the result can be large:
              - Use LIMIT 1000 by default.
              - For ordered "top" queries, LIMIT 10 is reasonable unless the user specifies otherwise.

        CONTEXT-AWARE QUERY GENERATION (FOR DRILL-DOWN):
        28. Reference Previous Results:
            - If the user references previous results ("that store", "top one", "the best one", "that category"), use the values from previous query results (store_name, region_name, grouped_item, grouped_category, master_category, etc.) in WHERE clauses.
        29. Drill-Down Phrases:
            - "break down by [time period]" → add DATE_TRUNC on the appropriate date column and GROUP BY it.
            - "for that [entity]" → add WHERE clause(s) for that store, region, grouped_item, grouped_category, or brand.
            - "show details" → move from store-level to item-level or category-level, but still follow aggregation-first, then join-to-dimension pattern.
        30. Pronoun Resolution:
            - Handle references like "it", "that", "the top one", "the best store", "that city" using the latest query result context.

        CONCRETE EXAMPLES USING SCHEMA (FOLLOW THESE PATTERNS):

        -- Example 1: "What are the top 10 selling items by quantity in 2025?"
        SELECT
          di.long_name AS item_name,
          t.total_items_sold
        FROM (
          SELECT
            item_key,
            SUM(no_of_items) AS total_items_sold
          FROM vw_rpt_item_mix
          WHERE order_date_key >= 20250101 AND order_date_key < 20260101
          GROUP BY item_key
        ) t
        JOIN vw_dim_item di ON t.item_key = di.item_key
        ORDER BY t.total_items_sold DESC
        LIMIT 10;

        -- Example 2: "Show total net sales by store for January 2025."
        SELECT
          ds.store_name,
          SUM(f.net_sales) AS total_net_sales
        FROM vw_rpt_sales_performance_only_sales f
        JOIN vw_dim_store ds ON f.store_key = ds.store_key
        WHERE
          f.order_date_key >= 20250101 AND f.order_date_key < 20250201
        GROUP BY ds.store_name
        ORDER BY total_net_sales DESC
        LIMIT 1000;

        -- Example 3: "Show monthly wastage amount in 2025."
        SELECT
          DATE_TRUNC('month', month_date) AS month,
          SUM(waste_amount) AS total_waste_amount
        FROM vw_rpt_inv_wastage
        WHERE month_date >= '2025-01-01' AND month_date < '2026-01-01'
        GROUP BY DATE_TRUNC('month', month_date)
        ORDER BY month
        LIMIT 1000;

        -- Example 4: "Show total labor cost by branch for 2025."
        SELECT
          branch,
          SUM(costed_value) AS total_labor_cost
        FROM vw_rpt_labor_summary
        WHERE effective_date >= '2025-01-01' AND effective_date < '2026-01-01'
        GROUP BY branch
        ORDER BY total_labor_cost DESC
        LIMIT 1000;

        -- Example 5: "Show net sales by order mode (reporting channel) for 2025."
        SELECT
          m.order_mode_name_rpt AS order_mode,
          m.sales_channel_name,
          SUM(f.net_sales) AS total_net_sales
        FROM vw_rpt_sales_performance_only_sales f
        JOIN vw_mapping_order_mode_sales_channel m
          ON f.order_mode_sales_channel_key = m.order_mode_sales_channel_key
        WHERE f.order_date_key >= 20250101 AND f.order_date_key < 20260101
        GROUP BY m.order_mode_name_rpt, m.sales_channel_name
        ORDER BY total_net_sales DESC
        LIMIT 1000;

        ${conversationContext ? `\nPrevious conversation:\n${conversationContext}\n` : ''}

        Generate ONLY a single, optimized SELECT query for the following request:`;

      

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
      temperature: 0.1, // Low temperature for more deterministic SQL
      max_tokens: 500,
    });

    let sql = completion.choices[0]?.message?.content?.trim() || '';

    // Clean up SQL - remove markdown code blocks if present
    sql = sql.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();

    // Basic validation - ensure it's a SELECT query
    if (!sql.toUpperCase().trim().startsWith('SELECT')) {
      throw new Error('Generated query is not a SELECT statement');
    }

    // Add LIMIT if not present and query doesn't have aggregation that might need all rows
    const upperSql = sql.toUpperCase();
    if (!upperSql.includes('LIMIT') && !upperSql.includes('GROUP BY')) {
      sql = `${sql} LIMIT 1000`;
    }

    // Validate that the query references only allowed views
    const allowedViewNames = new Set(
      ALLOWED_VIEWS.map((view) => view.toLowerCase())
    );

    const schemaTableNames = new Set(
      schema
        .filter((table) => table?.tableName)
        .map((table) => table.tableName.toLowerCase())
    );

    const referencedTables = extractTableNames(sql);

    // Log for debugging
    console.log('[SCHEMA DEBUG] Allowed views count:', allowedViewNames.size);
    console.log('[SCHEMA DEBUG] Schema views count:', schemaTableNames.size);
    console.log('[SCHEMA DEBUG] Referenced views:', referencedTables);
    console.log('[SCHEMA DEBUG] Generated SQL:', sql);

    // Special-case guard for placeholder table names often produced when schema context is unclear
    if (/your[_\s]?table/i.test(sql)) {
      throw new Error(
        'The assistant could not identify a valid view for this request. Please reference an existing view from the allowed list.'
      );
    }

    // If schema is empty, warn but don't block (might be first run or schema fetch issue)
    if (schemaTableNames.size === 0) {
      console.warn('[SCHEMA WARNING] No views found in schema. Skipping view validation.');
      // Still allow query to proceed if schema is empty (might be a schema fetch issue)
      return sql;
    }

    // Validate that all referenced views are in the allowed list
    if (referencedTables.length > 0) {
      const invalidViews: string[] = [];
      const validViews: string[] = [];

      referencedTables.forEach((table) => {
        if (!table) return;
        const tableLower = table.toLowerCase();
        if (!allowedViewNames.has(tableLower)) {
          invalidViews.push(table);
        } else {
          validViews.push(table);
        }
      });

      if (invalidViews.length > 0) {
        const availableViews = Array.from(ALLOWED_VIEWS).slice(0, 15).join(', ');
        throw new Error(
          `The generated query references views that are not allowed: ${invalidViews.join(', ')}. ` +
          `You can only query the following views: ${availableViews}${ALLOWED_VIEWS.length > 15 ? '...' : ''}. ` +
          `Please use only the allowed views listed above.`
        );
      }

      if (validViews.length === 0) {
        const availableViews = Array.from(ALLOWED_VIEWS).slice(0, 15).join(', ');
        throw new Error(
          `The generated query does not reference any allowed views. ` +
          `Available views include: ${availableViews}${ALLOWED_VIEWS.length > 15 ? '...' : ''}. ` +
          `Please ask about specific views that exist in the database.`
        );
      }
    } else {
      // If no views were extracted, warn but don't block (might be a complex query)
      console.warn('[SCHEMA WARNING] Could not extract view names from query. Proceeding with caution.');
    }

    return sql;
  } catch (error) {
    console.error('Error generating SQL:', error);
    throw error;
  }
}

/**
 * Comprehensive SQL validation to prevent destructive operations
 * This function uses multiple layers of validation to ensure only safe SELECT queries are allowed
 */
export function validateSQL(sql: string): boolean {
  if (!sql || typeof sql !== 'string') {
    return false;
  }

  // Remove comments and normalize whitespace for better parsing
  const cleanedSql = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/'[^']*'/g, '') // Remove single-quoted strings (temporary, for keyword detection)
    .replace(/"[^"]*"/g, '') // Remove double-quoted strings (temporary, for keyword detection)
    .trim();

  const upperSql = cleanedSql.toUpperCase();

  // Layer 1: Must start with SELECT or WITH (for CTEs) (after removing comments)
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    return false;
  }

  // Layer 2: Block dangerous SQL keywords (using word boundaries)
  // These are destructive operations that should NEVER be allowed
  const dangerousKeywords = [
    'DROP',
    'DELETE',
    'UPDATE',
    'INSERT',
    'ALTER',
    'TRUNCATE',
    'CREATE',
    'GRANT',
    'REVOKE',
    'EXEC',
    'EXECUTE',
    'CALL',
    'MERGE',
    'COPY',
    'UNLOAD',
    'VACUUM',
    'ANALYZE',
  ];

  // Use regex with word boundaries to avoid false positives
  // This ensures we match whole words, not substrings
  for (const keyword of dangerousKeywords) {
    // Match keyword as a whole word (not part of another word)
    // \b is word boundary, but we need to handle SQL syntax
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(cleanedSql)) {
      console.warn(`[SQL VALIDATION] Blocked dangerous keyword: ${keyword}`);
      return false;
    }
  }

  // Layer 3: Block semicolon-separated multiple statements
  // This prevents injection of additional statements
  const statements = cleanedSql.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    console.warn('[SQL VALIDATION] Blocked multiple statements');
    return false;
  }

  // Layer 4: Ensure no WITH clauses that might contain dangerous operations
  // (This is already handled by keyword checks, but being explicit)

  // Layer 5: In production, add extra strictness
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    // Additional production-only checks
    // Block any query that doesn't look like a standard SELECT
    if (!/^SELECT\s+/i.test(cleanedSql)) {
      console.warn('[SQL VALIDATION] Production: Query does not start with SELECT');
      return false;
    }
  }

  return true;
}

function extractTableNames(sql: string): string[] {
  if (!sql || typeof sql !== 'string') {
    return [];
  }

  const tableNames = new Set<string>();
  const patterns = [
    /\bFROM\s+([a-zA-Z0-9_."`]+)/gi,
    /\bJOIN\s+([a-zA-Z0-9_."`]+)/gi,
    /\bWITH\s+([a-zA-Z0-9_."`]+)\s+AS/gi,
  ];

  for (const pattern of patterns) {
    let match;
    // Reset regex lastIndex to avoid issues with global regex
    pattern.lastIndex = 0;
    while ((match = pattern.exec(sql)) !== null) {
      const rawName = match[1]
        ?.replace(/["`]/g, '')
        .trim();
      if (rawName) {
        // Handle schema-qualified names (e.g., "gold.table_name" or "schema.table")
        let normalized: string;
        if (rawName.includes('.')) {
          // Extract just the table name (last part after dot)
          const parts = rawName.split('.');
          normalized = parts[parts.length - 1] || rawName;
        } else {
          normalized = rawName;
        }

        if (normalized) {
          tableNames.add(normalized);
        }
      }
    }
  }

  return Array.from(tableNames);
}

