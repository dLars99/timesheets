import { useMemo, useState } from 'react'
import { formatDuration, toDecimalHours } from '../lib/time'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import type { ID } from '../types/timesheet'
import { TaskForm } from './TaskForm'

export function TaskList() {
  const tasks = useTimesheetStore((state) => state.tasks)
  const projects = useTimesheetStore((state) => state.projects)
  const deleteTask = useTimesheetStore((state) => state.deleteTask)
  const startTimer = useTimesheetStore((state) => state.startTimer)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
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

  if (sortedTasks.length === 0) {
    return <p className="empty-state">No tasks yet. Add one to get started.</p>
  }

  return (
    <div className="task-list">
      {sortedTasks.map((task) => {
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
                  <button
                    className="danger"
                    onClick={() => {
                      if (window.confirm('Delete this task?')) {
                        deleteTask(task.id)
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
    </div>
  )
}
