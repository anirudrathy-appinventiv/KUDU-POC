'use client';

import { useState } from 'react';
import { QueryResult, VisualizationPlan } from '@/app/types/database';
import ChartRenderer from './ChartRenderer';
import { addDashboardItem, isDuplicateQuery } from '@/app/lib/dashboard/storage';

interface QueryResultsProps {
  result: QueryResult | null;
  summary?: string;
  visualizationPlan?: VisualizationPlan;
  sqlQuery?: string;
  userQuery?: string;
}

export default function QueryResults({ result, summary, visualizationPlan, sqlQuery, userQuery }: QueryResultsProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!result) {
    return null;
  }

  const handleAddToDashboard = () => {
    // Generate default title from user query or summary
    const defaultTitle = userQuery 
      ? userQuery.slice(0, 50) + (userQuery.length > 50 ? '...' : '')
      : summary
      ? summary.slice(0, 50) + (summary.length > 50 ? '...' : '')
      : 'Untitled Analysis';
    
    setCustomTitle(defaultTitle);
    setShowAddModal(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    if (!sqlQuery || !visualizationPlan) {
      setSaveMessage({ type: 'error', text: 'Missing query or visualization data' });
      return;
    }

    // Check for duplicates
    if (isDuplicateQuery(sqlQuery)) {
      setSaveMessage({ type: 'error', text: 'This query is already in your dashboard' });
      return;
    }

    setIsSaving(true);

    try {
      const item = addDashboardItem({
        title: customTitle.trim() || 'Untitled Analysis',
        userQuery: userQuery || 'N/A',
        sqlQuery,
        visualizationPlan,
      });

      if (item) {
        setSaveMessage({ type: 'success', text: 'Added to dashboard!' });
        setTimeout(() => {
          setShowAddModal(false);
          setSaveMessage(null);
        }, 1500);
      } else {
        setSaveMessage({ type: 'error', text: 'Failed to save. Dashboard might be full.' });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save to dashboard' });
    } finally {
      setIsSaving(false);
    }
  };

  const canAddToDashboard = sqlQuery && visualizationPlan && visualizationPlan.shouldVisualize;

  return (
    <div className="space-y-6 text-[var(--color-card-dark-text)]">
      {/* Summary Section */}
      {summary && (
        <div className="rounded-2xl border border-[#F3C32B]/30 bg-[#393A46]/40 p-4 shadow-lg shadow-black/20">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#FCE457]">
            Summary
          </h3>
          <p className="text-sm text-[#F2F1F0]">{summary}</p>
        </div>
      )}

      {/* Chart Section */}
      {result.rows.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#4CB49C]/15 to-transparent p-4 shadow-lg shadow-black/25">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#F2F1F0]">
              Visualization
            </h3>
            {canAddToDashboard && (
              <button
                onClick={handleAddToDashboard}
                className="px-3 py-1.5 text-xs font-semibold bg-[#F3C32B] text-[#393A46] rounded-lg hover:bg-[#FCE457] transition shadow-md flex items-center gap-1.5"
              >
                <span>📌</span>
                Add to Dashboard
              </button>
            )}
          </div>
          <ChartRenderer data={result} plan={visualizationPlan} />
        </div>
      )}
      
      {/* Add to Dashboard Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#F2F1F0] rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-[#393A46] mb-4">Add to Dashboard</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#393A46] mb-2">
                Title
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3 py-2 border border-[#87776B]/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#98B1D3] text-[#393A46]"
                placeholder="Enter a title for this visualization"
                autoFocus
              />
            </div>
            
            {saveMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                saveMessage.type === 'success' 
                  ? 'bg-[#4CB49C]/20 text-[#4CB49C] border border-[#4CB49C]/30'
                  : 'bg-[#c73f32]/20 text-[#c73f32] border border-[#c73f32]/30'
              }`}>
                {saveMessage.text}
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-[#87776B]/30 text-[#393A46] rounded-lg hover:bg-[#87776B]/10 transition"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !customTitle.trim()}
                className="flex-1 px-4 py-2 bg-[#4CB49C] text-white rounded-lg hover:bg-[#45a088] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#2D2E37]/60 backdrop-blur">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-[#F2F1F0]">
            Results ({result.rowCount} rows)
          </h3>
        </div>
        
        {result.rows.length === 0 ? (
          <div className="p-8 text-center text-white/60">
            No results found.
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
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
        )}
      </div>
    </div>
  );
}

