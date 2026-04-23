import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { formatDuration } from '../lib/time'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import { DateInput } from './DateInput'

export function TimerPanel() {
  const tasks = useTimesheetStore((state) => state.tasks)
  const projects = useTimesheetStore((state) => state.projects)
  const activeTimerTaskId = useTimesheetStore((state) => state.activeTimerTaskId)
  const activeTimerStartedAt = useTimesheetStore((state) => state.activeTimerStartedAt)
  const startTimer = useTimesheetStore((state) => state.startTimer)
  const pauseActiveTimer = useTimesheetStore((state) => state.pauseActiveTimer)
  const finishTask = useTimesheetStore((state) => state.finishTask)
  const getRecentTasks = useTimesheetStore((state) => state.getRecentTasks)
  const logInterruption = useTimesheetStore((state) => state.logInterruption)

  const [tick, setTick] = useState(() => Date.now())
  const [interruptMinutes, setInterruptMinutes] = useState('5')
  const [interruptDate, setInterruptDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
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

  const activeDurationMs = useMemo(() => {
    if (!activeTask) {
      return 0
    }

    if (!activeTimerStartedAt) {
      return activeTask.totalMs
    }

    return activeTask.totalMs + Math.max(0, tick - activeTimerStartedAt)
  }, [activeTask, activeTimerStartedAt, tick])

  const activeDuration = useMemo(
    () => formatDuration(activeDurationMs),
    [activeDurationMs],
  )

  const recentTasks = getRecentTasks(3)

  const effectiveInterruptProjectId = interruptProjectId || projects[0]?.id || ''

  const submitInterruption = async (shouldPauseActiveTimer: boolean) => {
    setInterruptError(null)

    const minutes = Number(interruptMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setInterruptError('Interruption minutes must be greater than zero.')
      return
    }

    if (!activeTask) {
      setInterruptError('An active task is required to log an interruption.')
      return
    }

    const durationMs = Math.round(minutes * 60000)
    if (durationMs > activeDurationMs) {
      setInterruptError('Interruption minutes cannot exceed the current task time.')
      return
    }

    const result = await logInterruption({
      description: interruptDescription,
      projectId: effectiveInterruptProjectId,
      taskDate: interruptDate,
      ticketNumber: interruptTicket,
      durationMs,
      pauseActiveTimer: shouldPauseActiveTimer,
    })

    if (result) {
      setInterruptError(result)
      return
    }

    setInterruptDescription('Unexpected interruption')
    setInterruptTicket('')
  }

  const handlePauseAndLogInterruption = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await submitInterruption(true)
  }

  const handleLogInterruption = async () => {
    await submitInterruption(false)
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
        <p className="label">Recent Tasks<span>- Click a Task to Resume</span></p>
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

      <form className="inline-form" onSubmit={handlePauseAndLogInterruption}>
        <p className="label">Log Interruption</p>

        <label>
          Minutes
          <input
            type="number"
            min="1"
            step="1"
            value={interruptMinutes}
            aria-invalid={Boolean(interruptError)}
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
            value={effectiveInterruptProjectId}
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
          <DateInput
            value={interruptDate}
            onChange={setInterruptDate}
          />
        </label>

        <label>
          Ticket Number (optional)
          <input
            value={interruptTicket}
            onChange={(event) => setInterruptTicket(event.target.value)}
            placeholder="123456"
          />
        </label>

        <div className="interruption-actions">
          <button type="button" onClick={() => void handleLogInterruption()}>
            Log Interruption
          </button>
          <button type="submit" className="secondary-button">
            Pause + Log Interruption
          </button>
        </div>
        {interruptError && <p className="form-error">{interruptError}</p>}
      </form>
    </div>
  )
}
