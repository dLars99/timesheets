import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { exportRowsToCsv, exportTasksToCsv } from '../lib/exportCsv'
import {
  fetchExportRows,
  fetchProjectTotals,
  type ProjectTotalRow,
} from '../lib/reportingIpc'
import { toDecimalHours } from '../lib/time'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import { DateInput } from './DateInput'

export function ReportPanel() {
  const tasks = useTimesheetStore((state) => state.tasks)
  const projects = useTimesheetStore((state) => state.projects)
  const defaultDate = format(new Date(), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(defaultDate)
  const [endDate, setEndDate] = useState(defaultDate)
  const [ipcTotals, setIpcTotals] = useState<ProjectTotalRow[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const isDateRangeValid = startDate <= endDate
  const loadingIpc = isDateRangeValid && ipcTotals === null

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => task.taskDate >= startDate && task.taskDate <= endDate),
    [tasks, startDate, endDate],
  )

  const totals = useMemo(() => {
    if (isDateRangeValid && ipcTotals) {
      return ipcTotals
    }

    const values = new Map<string, number>()
    for (const task of filteredTasks) {
      values.set(task.projectId, (values.get(task.projectId) ?? 0) + task.totalMs)
    }

    return Array.from(values.entries())
      .map(([projectId, totalMs]) => ({
        projectId,
        projectName:
          projects.find((project) => project.id === projectId)?.name ?? 'Unknown',
        totalMs,
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [filteredTasks, ipcTotals, isDateRangeValid, projects])

  useEffect(() => {
    if (!isDateRangeValid) {
      return
    }

    let cancelled = false

    void fetchProjectTotals(startDate, endDate)
      .then((rows) => {
        if (cancelled) {
          return
        }
        setIpcTotals(rows)
      })

    return () => {
      cancelled = true
    }
  }, [startDate, endDate, isDateRangeValid, tasks])

  const totalHours = useMemo(
    () => toDecimalHours(filteredTasks.reduce((sum, task) => sum + task.totalMs, 0)),
    [filteredTasks],
  )

  const handleExport = async () => {
    if (startDate > endDate) {
      return
    }

    setExporting(true)
    const rows = await fetchExportRows(startDate, endDate)
    if (rows) {
      exportRowsToCsv(rows, startDate, endDate)
      setExporting(false)
      return
    }

    exportTasksToCsv(tasks, projects, startDate, endDate)
    setExporting(false)
  }

  return (
    <section className="report-panel">
      <div className="report-controls">
        <label>
          Start
          <DateInput
            value={startDate}
            onChange={(value) => {
              setStartDate(value)
              setIpcTotals(null)
            }}
          />
        </label>
        <label>
          End
          <DateInput
            value={endDate}
            onChange={(value) => {
              setEndDate(value)
              setIpcTotals(null)
            }}
          />
        </label>
        <button
          onClick={handleExport}
          disabled={startDate > endDate}
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {!isDateRangeValid && (
        <p className="form-error">Start date must be before or equal to end date.</p>
      )}
      {loadingIpc && <p className="empty-state">Refreshing totals...</p>}

      <table className="report-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Total Hours</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((row) => (
            <tr key={row.projectId}>
              <td>{row.projectName}</td>
              <td>{toDecimalHours(row.totalMs)}</td>
            </tr>
          ))}
          <tr className="summary-row">
            <td>All Projects</td>
            <td>{totalHours}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
