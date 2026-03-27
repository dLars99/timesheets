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
  const finishTask = useTimesheetStore((state) => state.finishTask)
  const getRecentTasks = useTimesheetStore((state) => state.getRecentTasks)
  const addTask = useTimesheetStore((state) => state.addTask)

  const [tick, setTick] = useState(Date.now())
  const [interruptMinutes, setInterruptMinutes] = useState('5')
  const [interruptDate, setInterruptDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [interruptDescription, setInterruptDescription] = useState('Unexpected interruption')
  const [interruptProjectId, setInterruptProjectId] = useState('')
  const [interruptTicket, setInterruptTicket] = useState('')
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
  }, [projects, interruptProjectId])

  const interruptProject = useMemo(
    () => projects.find((project) => project.id === interruptProjectId),
    [projects, interruptProjectId],
  )

  const handleLogInterruption = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInterruptError(null)

    const minutes = Number(interruptMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setInterruptError('Interruption minutes must be greater than zero.')
      return
    }

    const durationMs = minutes * 60000

    if (activeTask) {
      await pauseActiveTimer()
    }

    const result = await addTask({
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

    // New interruption tasks are immediately moved to history after logging.
    const normalizedDescription = interruptDescription.trim().toLowerCase()
    const createdTask = [...useTimesheetStore.getState().tasks]
      .filter((task) =>
        task.projectId === interruptProjectId &&
        task.taskDate === interruptDate &&
        task.description.trim().toLowerCase() === normalizedDescription,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

    if (createdTask) {
      await finishTask(createdTask.id)
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
        <div className="timer-actions">
          <button
            className="secondary-button"
            onClick={activeTask ? pauseActiveTimer : undefined}
            disabled={!activeTask}
          >
            Pause Active Timer
          </button>
          <button
            onClick={() => (activeTask ? void finishTask(activeTask.id) : undefined)}
            disabled={!activeTask}
          >
            Finish Active Task
          </button>
        </div>
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
            placeholder="123456"
          />
        </label>

        <button type="submit">Pause + Log Interruption</button>
        {interruptError && <p className="form-error">{interruptError}</p>}
      </form>
    </div>
  )
}
