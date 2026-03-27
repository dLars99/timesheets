import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { formatDuration, toDecimalHours } from '../lib/time'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import type { ID } from '../types/timesheet'
import { TaskForm } from './TaskForm'

function formatFinishedAt(iso?: string): string {
  if (!iso) {
    return 'Unknown'
  }

  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) {
    return iso
  }

  return format(value, 'yyyy-MM-dd HH:mm')
}

export function TaskList() {
  const tasks = useTimesheetStore((state) => state.tasks)
  const projects = useTimesheetStore((state) => state.projects)
  const deleteTask = useTimesheetStore((state) => state.deleteTask)
  const startTimer = useTimesheetStore((state) => state.startTimer)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const finishTask = useTimesheetStore((state) => state.finishTask)
  const reopenTask = useTimesheetStore((state) => state.reopenTask)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)
  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null)

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.taskDate === b.taskDate) {
      return b.updatedAt.localeCompare(a.updatedAt)
    }
    return b.taskDate.localeCompare(a.taskDate)
  })

  const openTasks = sortedTasks.filter((task) => !task.completedAt)
  const historyTasks = sortedTasks.filter((task) => Boolean(task.completedAt))

  if (sortedTasks.length === 0) {
    return <p className="empty-state">No tasks yet. Add one to get started.</p>
  }

  return (
    <div className="task-list">
      {openTasks.map((task) => {
        const project = projectById.get(task.projectId)
        const isActive = task.id === activeTimerTaskId
        const isEditing = task.id === editingTaskId

        return (
          <article key={task.id} className="task-card">
            {isEditing ? (
              <TaskForm task={task} onDone={() => setEditingTaskId(null)} />
            ) : (
              <>
                <div className="task-card-header">
                  <h3>{task.description}</h3>
                  <span className={isActive ? 'status running' : 'status'}>
                    {isActive ? 'Running' : 'Paused'}
                  </span>
                </div>

                <p className="task-meta">
                  {task.taskDate} | {project?.name ?? 'Unknown project'}
                  {task.ticketNumber ? ` | Ticket: ${task.ticketNumber}` : ''}
                </p>

                <p className="task-total">
                  {formatDuration(task.totalMs)} ({toDecimalHours(task.totalMs)} h)
                </p>

                <div className="task-actions">
                  <button onClick={() => setEditingTaskId(task.id)}>Edit</button>
                  <button onClick={() => (isActive ? pauseActiveTimer() : startTimer(task.id))}>
                    {isActive ? 'Pause' : 'Start'}
                  </button>
                  <button onClick={() => void finishTask(task.id)}>Finish</button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (window.confirm('Delete this task?')) {
                        await deleteTask(task.id)
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </article>
        )
      })}

      {historyTasks.length > 0 && <h3 className="history-heading">History</h3>}

      {historyTasks.map((task) => {
        const project = projectById.get(task.projectId)

        return (
          <article key={task.id} className="task-card task-card-history">
            <div className="task-card-header">
              <h3>{task.description}</h3>
              <span className="status">Finished</span>
            </div>

            <p className="task-meta">
              {task.taskDate} | {project?.name ?? 'Unknown project'}
              {task.ticketNumber ? ` | Ticket: ${task.ticketNumber}` : ''}
            </p>

            <p className="task-total">
              {formatDuration(task.totalMs)} ({toDecimalHours(task.totalMs)} h)
            </p>

            <p className="task-meta">Finished: {formatFinishedAt(task.completedAt)}</p>

            <div className="task-actions">
              <button onClick={() => void reopenTask(task.id)}>Reopen</button>
              <button
                className="danger"
                onClick={async () => {
                  if (window.confirm('Delete this task?')) {
                    await deleteTask(task.id)
                  }
                }}
              >
                Delete
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
