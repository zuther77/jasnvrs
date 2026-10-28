import type { ReactNode } from 'react'

const cellClass = 'border-b border-border/40 px-3 py-2 align-top text-muted'
const headClass =
  'border-b border-border/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted'

export interface TableColumn {
  label: string
  numeric?: boolean
}

interface ChartTableProps {
  caption: string
  columns: TableColumn[]
  rows: Array<Array<string | number>>
  testId?: string
  note?: string
  children?: ReactNode
}

/**
 * Text alternative for a chart: a real table inside a disclosure. `rows` are
 * already formatted strings so no chart-only value leaks into the table.
 */
export function ChartTable({
  caption,
  columns,
  rows,
  testId,
  note,
  children,
}: ChartTableProps) {
  return (
    <details className="group mt-3 rounded-lg border border-border/40 bg-bg/30">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card">
        View data table
      </summary>
      <div className="max-h-80 overflow-auto border-t border-border/40">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs" data-testid={testId}>
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-card">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={`${headClass} ${column.numeric ? 'text-right' : 'text-left'}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-card/40">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className={`${cellClass} ${
                      columns[cellIndex]?.numeric ? 'num text-right text-fg' : 'text-left'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {note ? (
          <p className="border-t border-border/40 px-3 py-2 text-xs text-muted">{note}</p>
        ) : null}
        {children}
      </div>
    </details>
  )
}
