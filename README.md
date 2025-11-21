# Natural Language to SQL Chatbot

A Next.js application that converts natural language queries to SQL and executes them on AWS Redshift in real-time, displaying results with visualizations and summaries.

## Features

- Natural language to SQL conversion using OpenAI
- Real-time query execution on AWS Redshift
- Automatic chart generation based on query results
- Query result summarization
- Chat interface with conversation history
- Schema-aware SQL generation
- **Multi-layer security** to prevent destructive SQL operations (ALTER, DROP, DELETE, etc.)

## Getting Started

### Prerequisites

- Node.js 18+ 
- AWS Redshift cluster access
- OpenAI API key

### Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1

# AWS Redshift Configuration
REDSHIFT_HOST=your-redshift-cluster.xxxxx.us-east-1.redshift.amazonaws.com
REDSHIFT_PORT=5439
REDSHIFT_DATABASE=your_database_name
REDSHIFT_USER=your_username
REDSHIFT_PASSWORD=your_password
REDSHIFT_SSL=true

# Environment (set to 'production' for production deployment)
NODE_ENV=development
```

**⚠️ Security Recommendation**: Use a **read-only database user** for `REDSHIFT_USER` with only SELECT permissions. This provides an additional security layer at the database level.

### Installation

Install dependencies:

```bash
npm install
```

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Security

This application implements **multiple layers of security** to prevent destructive SQL operations:

1. **OpenAI Prompt Engineering**: Explicit instructions to only generate SELECT queries
2. **SQL Validation**: Comprehensive validation function that blocks dangerous keywords (ALTER, DROP, DELETE, UPDATE, INSERT, etc.)
3. **API Route Validation**: Double-checking before query execution
4. **Database Layer Validation**: Final safety check before database connection

**Key Security Features:**
- ✅ Only SELECT queries are allowed
- ✅ Dangerous keywords are blocked (ALTER, DROP, DELETE, UPDATE, INSERT, TRUNCATE, etc.)
- ✅ Multiple statements are prevented
- ✅ Production-specific strictness checks
- ✅ Query logging for security auditing

For detailed security documentation, see [SECURITY.md](./SECURITY.md).

**Best Practice**: Always use a **read-only database user** with only SELECT permissions on the required tables/schemas.
