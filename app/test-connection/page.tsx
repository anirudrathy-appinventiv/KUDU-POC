'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { QueryResult } from '@/app/types/database';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
});

export default function TestConnectionPage() {
    const [sqlQuery, setSqlQuery] = useState('SELECT 1 as test');
    const [result, setResult] = useState<QueryResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExecute = async () => {
        if (!sqlQuery.trim()) {
            setError('Please enter a SQL query');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await fetch('/api/test-query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: sqlQuery }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to execute query');
            }

            setResult(data.result);
        } catch (err: any) {
            setError(err.message || 'An error occurred');
            console.error('Query execution error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="relative min-h-screen overflow-hidden bg-[var(--color-bg, #F2F1F0)] text-[var(--color-foreground, #393A46)]"
            style={
                {
                    ['--color-card' as any]: '#FFFFFF',
                    ['--color-card-dark' as any]: '#393A46',
                    ['--color-card-dark-text' as any]: '#F2F1F0',
                } as React.CSSProperties
            }
        >
            <div
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(152,177,211,0.12)_0%25,transparent_60%25)]"
                aria-hidden
            />

            <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-6 py-12">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-semibold text-[#393A46] mb-2">Query Runner</h1>
                        <p className="text-[#87776B]">Execute SQL queries directly against your Redshift database</p>
                    </div>
                    <Link
                        href="/"
                        className="rounded-2xl bg-[#98B1D3] px-6 py-3 text-sm font-semibold text-[#393A46] shadow-lg shadow-[#98B1D36b] transition hover:bg-[#8aa5c6]"
                    >
                        Back to Chat
                    </Link>
                </div>

                {/* Query and Results Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
                    {/* Left: SQL Editor */}
                    <div className="rounded-[32px] border border-[#87776B]/30 bg-(--color-card) shadow-xl shadow-[#98b1d31f] flex flex-col">
                        <div className="px-6 py-4 border-b border-[#87776B]/20">
                            <h2 className="text-lg font-semibold text-[#393A46]">SQL Query</h2>
                        </div>
                        <div className="flex-1 flex flex-col p-6">
                            <div className="flex-1 rounded-2xl border border-[#87776B]/40 bg-white overflow-hidden">
                                <MonacoEditor
                                    height="100%"
                                    defaultLanguage="sql"
                                    theme="vs-dark"
                                    value={sqlQuery}
                                    onChange={(value) => setSqlQuery(value ?? '')}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        wordWrap: 'on',
                                        readOnly: isLoading,
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                    }}
                                />
                            </div>
                            {error && (
                                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
                                    <p className="text-sm text-red-800">{error}</p>
                                </div>
                            )}
                            <button
                                onClick={handleExecute}
                                disabled={isLoading || !sqlQuery.trim()}
                                className="mt-4 rounded-2xl bg-[#98B1D3] px-6 py-3 text-sm font-semibold text-[#393A46] shadow-lg shadow-[#98B1D36b] transition hover:bg-[#8aa5c6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isLoading ? 'Executing...' : 'Execute Query'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Results */}
                    <div className="rounded-[32px] border border-[#87776B]/30 bg-(--color-card-dark) shadow-2xl shadow-[#393a4626] flex flex-col overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/10">
                            <h2 className="text-lg font-semibold text-(--color-card-dark-text)">Results</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="flex space-x-2">
                                        <div className="h-2 w-2 animate-bounce rounded-full bg-[#98B1D3]"></div>
                                        <div
                                            className="h-2 w-2 animate-bounce rounded-full bg-[#4CB49C]"
                                            style={{ animationDelay: '0.2s' }}
                                        ></div>
                                        <div
                                            className="h-2 w-2 animate-bounce rounded-full bg-[#F3C32B]"
                                            style={{ animationDelay: '0.4s' }}
                                        ></div>
                                    </div>
                                </div>
                            ) : result ? (
                                <div className="space-y-4">
                                    <div className="rounded-lg bg-white/5 p-3 border border-white/10">
                                        <p className="text-sm text-[#98B1D3]">
                                            <span className="font-semibold">Rows:</span> {result.rowCount}
                                        </p>
                                        <p className="text-sm text-[#98B1D3] mt-1">
                                            <span className="font-semibold">Columns:</span> {result.columns.length}
                                        </p>
                                    </div>

                                    {result.rows.length > 0 ? (
                                        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#2D2E37]/60">
                                            <table className="w-full">
                                                <thead className="bg-white/5">
                                                    <tr>
                                                        {result.columns.map((column) => (
                                                            <th
                                                                key={column}
                                                                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#98B1D3]"
                                                            >
                                                                {column}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/10">
                                                    {result.rows.slice(0, 100).map((row, rowIndex) => (
                                                        <tr
                                                            key={rowIndex}
                                                            className="transition-colors hover:bg-white/5"
                                                        >
                                                            {result.columns.map((column) => (
                                                                <td
                                                                    key={column}
                                                                    className="px-4 py-3 text-sm text-[#F2F1F0]"
                                                                >
                                                                    {row[column] !== null && row[column] !== undefined
                                                                        ? String(row[column])
                                                                        : 'NULL'}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {result.rowCount > 100 && (
                                                <div className="border-t border-white/10 px-4 py-3 text-sm text-[#98B1D3]">
                                                    Showing first 100 of {result.rowCount} rows
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-white/60">
                                            No results found.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-2 text-[#F2F1F0]/70">
                                    <p className="text-lg font-medium text-(--color-card-dark-text)">
                                        No results yet
                                    </p>
                                    <p className="text-sm text-[#F2F1F0]/80 text-center">
                                        Enter a SQL query and click Execute to see results here.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

