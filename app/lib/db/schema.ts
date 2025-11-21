import { executeQuery } from './redshift';
import { SchemaMetadata, ColumnMetadata } from '@/app/types/database';

let schemaCache: SchemaMetadata[] | null = null;
let schemaCacheTimestamp: number = 0;
const SCHEMA_CACHE_TTL = 3600000; // 1 hour in milliseconds

// KUDU allowed views - these are the ONLY views that can be queried
export const ALLOWED_VIEWS = [
  // Sales data views
  'vw_dim_brand',
  'vw_dim_store',
  'vw_dim_item',
  'vw_dim_order_mode',
  'vw_mapping_grouped_categories',
  'vw_mapping_grouped_items',
  'vw_mapping_order_mode_sales_channel',
  'vw_rpt_actual_cost',
  'vw_mapping_store_types',
  'vw_rpt_sales_performance',
  'vw_rpt_sales_performance_summary',
  'vw_rpt_sales_performance_only_sales',
  // Payroll data views
  'vw_dim_branch',
  'vw_dim_account_segments',
  'vw_dim_gl_account_code_combinations',
  'vw_mapping_account_management_code',
  'vw_rpt_labor_summary',
  'vw_rpt_income_statement_store_level',
  'vw_rpt_income_statement',
  // Inventory data views
  'vw_dim_inventory_items',
  'vw_dim_locations',
  'vw_dim_organizations',
  'vw_rpt_inv_flow',
  'vw_rpt_inv_lot_details',
  'vw_rpt_inv_on_hand_and_consumption',
  'vw_rpt_inv_wastage',
  // Products data views (some overlap with sales)
  'vw_rpt_item_mix',
  'vw_rpt_product_mix',
] as const;

export async function getSchemaMetadata(forceRefresh: boolean = false): Promise<SchemaMetadata[]> {
  const now = Date.now();
  
  // Return cached schema if available and not expired
  if (!forceRefresh && schemaCache && (now - schemaCacheTimestamp) < SCHEMA_CACHE_TTL) {
    return schemaCache;
  }

  try {
    // Build list of allowed views for the WHERE clause
    const allowedViewsList = ALLOWED_VIEWS.map(v => `'${v}'`).join(', ');
    
    // Query to get only the allowed views and their columns
    const schemaQuery = `
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'gold'
        AND t.table_type = 'VIEW'
        AND t.table_name IN (${allowedViewsList})
      ORDER BY t.table_name, c.ordinal_position;
    `;

    const result = await executeQuery(schemaQuery);
    
    // Group columns by table
    const tableMap = new Map<string, ColumnMetadata[]>();
    
    result.rows.forEach((row: any) => {
      const tableName = row.table_name;
      if (!tableName) {
        return;
      }
      // Double-check: only include allowed views
      if (!ALLOWED_VIEWS.includes(tableName as any)) {
        return;
      }
      const column: ColumnMetadata = {
        columnName: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === 'YES',
      };

      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, []);
      }
      tableMap.get(tableName)!.push(column);
    });

    // Convert to array format, ensuring only allowed views are included
    const schema: SchemaMetadata[] = Array.from(tableMap.entries())
      .filter(([tableName]) => ALLOWED_VIEWS.includes(tableName as any))
      .map(([tableName, columns]) => ({
        tableName,
        columns,
      }));

    // Log schema info for debugging
    console.log('[SCHEMA FETCH] Found', schema.length, 'tables');
    if (schema.length > 0) {
      console.log('[SCHEMA FETCH] Sample tables:', schema.slice(0, 5).map(t => t.tableName).join(', '));
    }

    // Update cache
    schemaCache = schema;
    schemaCacheTimestamp = now;

    return schema;
  } catch (error) {
    console.error('Error fetching schema metadata:', error);
    // Return cached schema if available, even if expired
    if (schemaCache) {
      return schemaCache;
    }
    throw error;
  }
}

export function formatSchemaForPrompt(schema: SchemaMetadata[]): string {
  let prompt = 'AVAILABLE DATABASE VIEWS (These are the ONLY views you can query):\n\n';
  
  // Group views by category for better organization
  const salesViews = ['vw_dim_brand', 'vw_dim_store', 'vw_dim_item', 'vw_dim_order_mode', 
    'vw_mapping_grouped_categories', 'vw_mapping_grouped_items', 'vw_mapping_order_mode_sales_channel',
    'vw_rpt_actual_cost', 'vw_mapping_store_types', 'vw_rpt_sales_performance', 
    'vw_rpt_sales_performance_summary', 'vw_rpt_sales_performance_only_sales'];
  const payrollViews = ['vw_dim_branch', 'vw_dim_account_segments', 'vw_dim_gl_account_code_combinations',
    'vw_mapping_account_management_code', 'vw_rpt_labor_summary', 'vw_rpt_income_statement_store_level',
    'vw_rpt_income_statement'];
  const inventoryViews = ['vw_dim_inventory_items', 'vw_dim_locations', 'vw_dim_organizations',
    'vw_rpt_inv_flow', 'vw_rpt_inv_lot_details', 'vw_rpt_inv_on_hand_and_consumption', 'vw_rpt_inv_wastage'];
  const productViews = ['vw_rpt_item_mix', 'vw_rpt_product_mix'];
  
  const schemaMap = new Map(schema.map(t => [t.tableName, t]));
  
  prompt += '=== SALES DATA VIEWS ===\n';
  salesViews.forEach(viewName => {
    const table = schemaMap.get(viewName);
    if (table) {
      prompt += `\nView: ${table.tableName}\n`;
      prompt += 'Columns:\n';
      table.columns.forEach((col) => {
        prompt += `  - ${col.columnName} (${col.dataType}${col.isNullable ? ', nullable' : ', not null'})\n`;
      });
    }
  });
  
  prompt += '\n=== PAYROLL DATA VIEWS ===\n';
  payrollViews.forEach(viewName => {
    const table = schemaMap.get(viewName);
    if (table) {
      prompt += `\nView: ${table.tableName}\n`;
      prompt += 'Columns:\n';
      table.columns.forEach((col) => {
        prompt += `  - ${col.columnName} (${col.dataType}${col.isNullable ? ', nullable' : ', not null'})\n`;
      });
    }
  });
  
  prompt += '\n=== INVENTORY DATA VIEWS ===\n';
  inventoryViews.forEach(viewName => {
    const table = schemaMap.get(viewName);
    if (table) {
      prompt += `\nView: ${table.tableName}\n`;
      prompt += 'Columns:\n';
      table.columns.forEach((col) => {
        prompt += `  - ${col.columnName} (${col.dataType}${col.isNullable ? ', nullable' : ', not null'})\n`;
      });
    }
  });
  
  prompt += '\n=== PRODUCTS DATA VIEWS ===\n';
  productViews.forEach(viewName => {
    const table = schemaMap.get(viewName);
    if (table) {
      prompt += `\nView: ${table.tableName}\n`;
      prompt += 'Columns:\n';
      table.columns.forEach((col) => {
        prompt += `  - ${col.columnName} (${col.dataType}${col.isNullable ? ', nullable' : ', not null'})\n`;
      });
    }
  });
  
  prompt += '\n\nIMPORTANT NOTES:\n';
  prompt += '- vw_rpt_sales_performance: Complete data with order hour and item level details\n';
  prompt += '- vw_rpt_sales_performance_summary: Data with order hour details (~20M rows)\n';
  prompt += '- vw_rpt_sales_performance_only_sales: Data without order hour and item level details (~2M rows)\n';
  prompt += '- You MUST only use these views listed above. Do NOT reference any other tables or views.\n';

  
  return prompt;
}

export function clearSchemaCache(): void {
  schemaCache = null;
  schemaCacheTimestamp = 0;
}


