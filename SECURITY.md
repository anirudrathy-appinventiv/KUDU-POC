# Security Measures for SQL Query Execution

This document outlines the multiple layers of security implemented to prevent destructive SQL operations (ALTER, DROP, DELETE, UPDATE, INSERT, etc.) from being executed in production.

## Multi-Layer Security Architecture

### Layer 1: OpenAI Prompt Engineering
- **Location**: `app/lib/ai/sql-generator.ts`
- **Protection**: Explicit instructions in the system prompt that prohibit generating any non-SELECT queries
- **Rules**: The AI is explicitly told to NEVER generate ALTER, DROP, DELETE, UPDATE, INSERT, or any destructive operations

### Layer 2: SQL Validation Function
- **Location**: `app/lib/ai/sql-generator.ts` - `validateSQL()`
- **Protection**: Comprehensive validation that:
  - Removes comments and string literals before checking
  - Uses word boundary regex to detect dangerous keywords
  - Blocks multiple statements (prevents SQL injection)
  - Ensures query starts with SELECT
  - Has production-specific strictness checks
- **Blocked Keywords**: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, EXEC, EXECUTE, CALL, MERGE, COPY, UNLOAD, VACUUM, ANALYZE

### Layer 3: API Route Validation
- **Location**: `app/api/chat/route.ts`
- **Protection**: 
  - Validates SQL immediately after generation
  - Double-checks that query starts with SELECT
  - Logs blocked queries for security auditing
  - Hides SQL details in production error responses

### Layer 4: Database Execution Layer
- **Location**: `app/lib/db/redshift.ts` - `executeQuery()`
- **Protection**: 
  - Final safety check before database connection
  - Validates SELECT-only queries
  - Additional keyword check as last line of defense
  - Query execution logging in production

## Security Features

### 1. Query Validation
- All queries are validated at multiple points before execution
- Uses regex with word boundaries to avoid false positives
- Removes comments and string literals before keyword detection

### 2. Production Mode Enhancements
- Additional strictness checks in production environment
- SQL details hidden in error responses
- Enhanced logging for security auditing

### 3. Query Logging
- All blocked queries are logged with timestamps
- Query execution is logged in production
- Helps with security auditing and incident response

### 4. Error Handling
- Clear error messages for blocked queries
- No sensitive information exposed in production
- Graceful failure without exposing system internals

## Testing Security

To verify the security measures work:

1. **Test ALTER query**: Try asking "ALTER TABLE users ADD COLUMN test VARCHAR(10)"
   - Expected: Query should be blocked at validation layer

2. **Test DROP query**: Try asking "DROP TABLE users"
   - Expected: Query should be blocked at validation layer

3. **Test multiple statements**: Try asking something that might generate multiple statements
   - Expected: Multiple statements should be blocked

4. **Test SELECT query**: Try asking "SELECT * FROM users LIMIT 10"
   - Expected: Query should execute successfully

## Recommendations

1. **Database User Permissions**: 
   - Use a read-only database user for the application
   - Grant only SELECT permissions on required tables/schemas
   - This provides an additional layer at the database level

2. **Network Security**:
   - Use VPC endpoints for Redshift connections
   - Implement IP whitelisting if possible
   - Use SSL/TLS for all connections

3. **Monitoring**:
   - Set up alerts for blocked queries
   - Monitor query execution logs
   - Track unusual query patterns

4. **Regular Audits**:
   - Review blocked query logs regularly
   - Check for patterns that might indicate attacks
   - Update validation rules as needed

## Environment Variables

Ensure these are set correctly:
- `NODE_ENV=production` - Enables production-specific security checks
- `REDSHIFT_USER` - Should be a read-only database user
- `REDSHIFT_PASSWORD` - Secure password management

## Additional Security Considerations

1. **Rate Limiting**: Consider implementing rate limiting on the API route
2. **Authentication**: Add user authentication if not already present
3. **Query Timeout**: Already implemented (30 seconds default)
4. **Result Size Limits**: Already implemented (1000 rows default)
5. **Input Sanitization**: User input is validated via Zod schema

