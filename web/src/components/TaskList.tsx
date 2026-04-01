import { useState } from 'react'
import { CheckCircle, Pause, Pencil, Play, RotateCcw, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { formatDuration, toDecimalHours } from '../lib/time'
import { useViewportLimit } from '../lib/useViewportLimit'
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
  const projects = useTimesheetStore((state) => state.projects)
  const deleteTask = useTimesheetStore((state) => state.deleteTask)
  const startTimer = useTimesheetStore((state) => state.startTimer)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const finishTask = useTimesheetStore((state) => state.finishTask)
  const reopenTask = useTimesheetStore((state) => state.reopenTask)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)
  const getRecentTasks = useTimesheetStore((state) => state.getRecentTasks)
  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null)

  const limit = useViewportLimit()
  const recentTasks = getRecentTasks(limit, true)

  const projectById = new Map(projects.map((project) => [project.id, project]))

  if (recentTasks.length === 0) {
    return <p className="empty-state">No tasks yet. Add one to get started.</p>
  }

  return (
    <div className="task-list">
      {recentTasks.map((task) => {
        const project = projectById.get(task.projectId)
        const isActive = task.id === activeTimerTaskId
        const isEditing = task.id === editingTaskId
        const isCompleted = Boolean(task.completedAt)

        return (
          <article key={task.id} className={`task-card${isCompleted ? ' task-card-history' : ''}`}>
            {isEditing ? (
              <TaskForm task={task} onDone={() => setEditingTaskId(null)} />
            ) : (
              <>
                <div className="task-card-header">
                  <h3 title={task.description}>{task.description}</h3>
                  <span className={isActive ? 'status running' : 'status'}>
                    {isCompleted ? 'Finished' : isActive ? 'Running' : 'Paused'}
                  </span>
                </div>

                <p className="task-meta">
                  {task.taskDate} | {project?.name ?? 'Unknown project'}
                  {task.ticketNumber ? ` | ${task.ticketNumber}` : ''}
                </p>

                <p className="task-total">
                  {formatDuration(task.totalMs)} ({toDecimalHours(task.totalMs)} h)
                </p>

                {isCompleted && (
                  <p className="task-meta">Finished: {formatFinishedAt(task.completedAt)}</p>
                )}

                <div className="task-actions">
                  {!isCompleted && (
                    <button
                      className="icon-btn"
                      title="Edit"
                      aria-label="Edit task"
                      onClick={() => setEditingTaskId(task.id)}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {!isCompleted && (
                    <button
                      className="icon-btn"
                      title={isActive ? 'Pause' : 'Start'}
                      aria-label={isActive ? 'Pause timer' : 'Start timer'}
                      onClick={() => (isActive ? pauseActiveTimer() : startTimer(task.id))}
                    >
                      {isActive ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  )}
                  {!isCompleted && (
                    <button
                      className="icon-btn"
                      title="Finish"
                      aria-label="Finish task"
                      onClick={() => void finishTask(task.id)}
                    >
                      <CheckCircle size={16} />
                    </button>
                  )}
                  {isCompleted && (
                    <button
                      className="icon-btn"
                      title="Reopen"
                      aria-label="Reopen task"
                      onClick={() => void reopenTask(task.id)}
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    aria-label="Delete task"
                    onClick={async () => {
                      if (window.confirm('Delete this task?')) {
                        await deleteTask(task.id)
                      }
                    }}
                  >
                    <Trash2 size={16} />
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

