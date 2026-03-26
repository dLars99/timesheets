import { useEffect, useMemo, useState } from 'react'
import { formatDuration } from '../lib/time'
import { useTimesheetStore } from '../stores/useTimesheetStore'

export function TimerPanel() {
  const tasks = useTimesheetStore((state) => state.tasks)
  const projects = useTimesheetStore((state) => state.projects)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)
  const activeTimerStartedAt = useTimesheetStore((state) => state.activeTimerStartedAt)
  const startTimer = useTimesheetStore((state) => state.startTimer)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const getRecentTasks = useTimesheetStore((state) => state.getRecentTasks)
  const addProject = useTimesheetStore((state) => state.addProject)

  const [tick, setTick] = useState(Date.now())
  const [projectName, setProjectName] = useState('')
  const [requiresTicket, setRequiresTicket] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTimerTaskId),
    [tasks, activeTimerTaskId],
  )

  const activeDuration = useMemo(() => {
    if (!activeTask) {
      return '00:00:00'
    }

    if (!activeTimerStartedAt) {
      return formatDuration(activeTask.totalMs)
    }

    return formatDuration(activeTask.totalMs + Math.max(0, tick - activeTimerStartedAt))
  }, [activeTask, activeTimerStartedAt, tick])

  const recentTasks = getRecentTasks(3)

  const handleAddProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProjectError(null)

    const error = addProject(projectName, requiresTicket)
    if (error) {
      setProjectError(error)
      return
    }

    setProjectName('')
    setRequiresTicket(false)
  }

  return (
    <div className="timer-panel">
      <div className="timer-current">
        <p className="label">Current Task</p>
        <h3>{activeTask?.description ?? 'No active timer'}</h3>
        <p className="timer-value">{activeDuration}</p>
        <button onClick={activeTask ? pauseActiveTimer : undefined} disabled={!activeTask}>
          Pause Active Timer
        </button>
      </div>

      <div>
        <p className="label">Recent Tasks</p>
        <div className="recent-grid">
          {recentTasks.map((task) => {
            const project = projects.find((item) => item.id === task.projectId)
            return (
              <button
                key={task.id}
                className="recent-task"
                onClick={() => startTimer(task.id)}
              >
                <strong>{task.description}</strong>
                <span>{project?.name ?? 'Unknown project'}</span>
              </button>
            )
          })}
          {recentTasks.length === 0 && <p className="empty-state">No recent tasks yet.</p>}
        </div>
      </div>

      <form className="inline-form" onSubmit={handleAddProject}>
        <p className="label">Add User Project</p>
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project name"
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={requiresTicket}
            onChange={(event) => setRequiresTicket(event.target.checked)}
          />
          Requires ticket number
        </label>
        <button type="submit">Add Project</button>
        {projectError && <p className="form-error">{projectError}</p>}
      </form>
    </div>
  )
}
