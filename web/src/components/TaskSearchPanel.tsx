import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, Pause, Pencil, Play, RotateCcw, Trash2 } from 'lucide-react'
import { confirmDelete } from '../lib/dialogs'
import { fetchTasksForRange, type TaskSearchRow } from '../lib/reportingIpc'
import { formatDuration, toDecimalHours } from '../lib/time'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import { DateInput } from './DateInput'
import { TaskForm } from './TaskForm'
import type { ID } from '../types/timesheet'

export function TaskSearchPanel() {
  const tasks = useTimesheetStore((state) => state.tasks)
  const projects = useTimesheetStore((state) => state.projects)
  const deleteTask = useTimesheetStore((state) => state.deleteTask)
  const startTimer = useTimesheetStore((state) => state.startTimer)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const finishTask = useTimesheetStore((state) => state.finishTask)
  const reopenTask = useTimesheetStore((state) => state.reopenTask)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)

  const defaultDate = format(new Date(), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(defaultDate)
  const [endDate, setEndDate] = useState(defaultDate)
  const [ipcRows, setIpcRows] = useState<TaskSearchRow[] | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null)

  const isDateRangeValid = startDate <= endDate
  const loadingIpc = isDateRangeValid && ipcRows === null

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  // Client-side fallback rows derived from Zustand store
  const fallbackRows = useMemo((): TaskSearchRow[] => {
    return [...tasks]
      .filter((task) => task.taskDate >= startDate && task.taskDate <= endDate)
      .sort((a, b) => {
        const byDate = b.taskDate.localeCompare(a.taskDate)
        if (byDate !== 0) return byDate
        return b.updatedAt.localeCompare(a.updatedAt)
      })
      .map((task) => ({
        id: task.id,
        taskDate: task.taskDate,
        description: task.description,
        projectId: task.projectId,
        projectName: projectById.get(task.projectId)?.name ?? 'Unknown project',
        ticketNumber: task.ticketNumber ?? null,
        totalMs: task.totalMs,
        completedAt: task.completedAt ?? null,
      }))
  }, [tasks, startDate, endDate, projectById])

  const rows = ipcRows ?? fallbackRows

  useEffect(() => {
    if (!isDateRangeValid) return

    let cancelled = false

    void fetchTasksForRange(startDate, endDate).then((result) => {
      if (cancelled) return
      setIpcRows(result)
    })

    return () => {
      cancelled = true
    }
  }, [startDate, endDate, isDateRangeValid, tasks])

  const handleStartChange = (value: string) => {
    setStartDate(value)
    setIpcRows(null)
  }

  const handleEndChange = (value: string) => {
    setEndDate(value)
    setIpcRows(null)
  }

  return (
    <section className="task-search-panel">
      <div className="report-controls">
        <label>
          Start
          <DateInput
            value={startDate}
            onChange={handleStartChange}
          />
        </label>
        <label>
          End
          <DateInput
            value={endDate}
            onChange={handleEndChange}
          />
        </label>
      </div>

      {!isDateRangeValid && (
        <p className="form-error">Start date must be before or equal to end date.</p>
      )}
      {isDateRangeValid && loadingIpc && (
        <p className="empty-state">Loading...</p>
      )}

      {isDateRangeValid && !loadingIpc && rows.length === 0 && (
        <p className="empty-state">No tasks found for this date range.</p>
      )}

      {isDateRangeValid && !loadingIpc && rows.length > 0 && (
        <ul className="task-row-list">
          {rows.map((row) => {
            const isActive = row.id === activeTimerTaskId
            const isCompleted = Boolean(row.completedAt)
            const isEditing = row.id === editingTaskId

            if (isEditing) {
              const fullTask = tasks.find((t) => t.id === row.id)
              return (
                <li key={row.id} className="task-row-edit">
                  {fullTask ? (
                    <TaskForm task={fullTask} onDone={() => setEditingTaskId(null)} />
                  ) : (
                    <p className="empty-state">Task not found.</p>
                  )}
                </li>
              )
            }

            return (
              <li key={row.id} className="task-row">
                <span className="task-row-date">{row.taskDate}</span>
                <span className="task-row-project">{row.projectName}</span>
                <span className="task-row-description" title={row.description}>
                  {row.description}
                </span>
                {row.ticketNumber && (
                  <span className="task-row-ticket">{row.ticketNumber}</span>
                )}
                <span className="task-row-duration">
                  {formatDuration(row.totalMs)} ({toDecimalHours(row.totalMs)} h)
                </span>
                <span className={isActive ? 'status running' : 'status'}>
                  {isCompleted ? 'Finished' : isActive ? 'Running' : 'Paused'}
                </span>
                <div className="task-actions">
                  <button
                    className="icon-btn"
                    title="Edit"
                    aria-label="Edit task"
                    onClick={() => setEditingTaskId(row.id)}
                  >
                    <Pencil size={15} />
                  </button>
                  {!isCompleted && (
                    <button
                      className="icon-btn"
                      title={isActive ? 'Pause' : 'Start'}
                      aria-label={isActive ? 'Pause timer' : 'Start timer'}
                      onClick={() => (isActive ? pauseActiveTimer() : startTimer(row.id))}
                    >
                      {isActive ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                  )}
                  {!isCompleted && (
                    <button
                      className="icon-btn"
                      title="Finish"
                      aria-label="Finish task"
                      onClick={() => void finishTask(row.id)}
                    >
                      <CheckCircle size={15} />
                    </button>
                  )}
                  {isCompleted && (
                    <button
                      className="icon-btn"
                      title="Reopen"
                      aria-label="Reopen task"
                      onClick={() => void reopenTask(row.id)}
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    aria-label="Delete task"
                    onClick={async () => {
                      if (await confirmDelete()) {
                        await deleteTask(row.id)
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
