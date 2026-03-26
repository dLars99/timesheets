import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
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
  const addTask = useTimesheetStore((state) => state.addTask)
  const addTimeToTask = useTimesheetStore((state) => state.addTimeToTask)

  const [tick, setTick] = useState(Date.now())
  const [projectName, setProjectName] = useState('')
  const [requiresTicket, setRequiresTicket] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [interruptMode, setInterruptMode] = useState<'new' | 'existing'>('new')
  const [interruptMinutes, setInterruptMinutes] = useState('5')
  const [interruptDate, setInterruptDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [interruptDescription, setInterruptDescription] = useState('Unexpected interruption')
  const [interruptProjectId, setInterruptProjectId] = useState('')
  const [interruptTicket, setInterruptTicket] = useState('')
  const [targetTaskId, setTargetTaskId] = useState('')
  const [interruptError, setInterruptError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!interruptProjectId && projects[0]) {
      setInterruptProjectId(projects[0].id)
    }

    if (!targetTaskId && tasks[0]) {
      setTargetTaskId(tasks[0].id)
    }
  }, [projects, tasks, interruptProjectId, targetTaskId])

  const interruptProject = useMemo(
    () => projects.find((project) => project.id === interruptProjectId),
    [projects, interruptProjectId],
  )

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

  const handleLogInterruption = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInterruptError(null)

    const minutes = Number(interruptMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setInterruptError('Interruption minutes must be greater than zero.')
      return
    }

    const durationMs = minutes * 60000

    if (activeTask) {
      pauseActiveTimer()
    }

    if (interruptMode === 'existing') {
      if (!targetTaskId) {
        setInterruptError('Select a task to log interruption time.')
        return
      }
      addTimeToTask(targetTaskId, durationMs)
      return
    }

    const result = addTask({
      description: interruptDescription,
      projectId: interruptProjectId,
      taskDate: interruptDate,
      ticketNumber: interruptTicket,
      totalMs: durationMs,
    })

    if (result) {
      setInterruptError(result)
      return
    }

    setInterruptDescription('Unexpected interruption')
    setInterruptTicket('')
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

      <form className="inline-form" onSubmit={handleLogInterruption}>
        <p className="label">Log Interruption</p>

        <div className="toggle-row">
          <label className="checkbox-row">
            <input
              type="radio"
              name="interrupt-mode"
              checked={interruptMode === 'new'}
              onChange={() => setInterruptMode('new')}
            />
            New task
          </label>
          <label className="checkbox-row">
            <input
              type="radio"
              name="interrupt-mode"
              checked={interruptMode === 'existing'}
              onChange={() => setInterruptMode('existing')}
            />
            Existing task
          </label>
        </div>

        <label>
          Minutes
          <input
            type="number"
            min="1"
            step="1"
            value={interruptMinutes}
            onChange={(event) => setInterruptMinutes(event.target.value)}
          />
        </label>

        {interruptMode === 'existing' ? (
          <label>
            Target Task
            <select
              value={targetTaskId}
              onChange={(event) => setTargetTaskId(event.target.value)}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.description}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Description
              <input
                value={interruptDescription}
                onChange={(event) => setInterruptDescription(event.target.value)}
              />
            </label>

            <label>
              Project
              <select
                value={interruptProjectId}
                onChange={(event) => setInterruptProjectId(event.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Date
              <input
                type="date"
                value={interruptDate}
                onChange={(event) => setInterruptDate(event.target.value)}
              />
            </label>

            <label>
              Ticket Number {interruptProject?.requiresTicket ? '(required)' : '(optional)'}
              <input
                value={interruptTicket}
                required={Boolean(interruptProject?.requiresTicket)}
                onChange={(event) => setInterruptTicket(event.target.value)}
                placeholder="ABC-123"
              />
            </label>
          </>
        )}

        <button type="submit">Pause + Log Interruption</button>
        {interruptError && <p className="form-error">{interruptError}</p>}
      </form>

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
