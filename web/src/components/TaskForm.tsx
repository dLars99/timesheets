import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import type { Task } from '../types/timesheet'

interface TaskFormProps {
  task?: Task
  onDone?: () => void
}

export function TaskForm({ task, onDone }: TaskFormProps) {
  const projects = useTimesheetStore((state) => state.projects)
  const addTask = useTimesheetStore((state) => state.addTask)
  const updateTask = useTimesheetStore((state) => state.updateTask)

  const [description, setDescription] = useState(task?.description ?? '')
  const [projectId, setProjectId] = useState(task?.projectId ?? projects[0]?.id ?? '')
  const [taskDate, setTaskDate] = useState(
    task?.taskDate ?? format(new Date(), 'yyyy-MM-dd'),
  )
  const [ticketNumber, setTicketNumber] = useState(task?.ticketNumber ?? '')
  const [totalHours, setTotalHours] = useState(
    task ? (task.totalMs / 3600000).toFixed(2) : '0.00',
  )
  const [error, setError] = useState<string | null>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projects, projectId],
  )

  const submitLabel = task ? 'Save Changes' : 'Create Task'

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (task) {
      const parsedHours = Number(totalHours)
      const result = updateTask(task.id, {
        description,
        projectId,
        taskDate,
        ticketNumber,
        totalMs: Number.isFinite(parsedHours) ? parsedHours * 3600000 : 0,
      })

      if (result) {
        setError(result)
        return
      }
    } else {
      const result = addTask({ description, projectId, taskDate, ticketNumber })
      if (result) {
        setError(result)
        return
      }
      setDescription('')
      setTicketNumber('')
    }

    onDone?.()
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <label>
        Description
        <input
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short task description"
        />
      </label>

      <label>
        Project
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
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
          required
          value={taskDate}
          onChange={(event) => setTaskDate(event.target.value)}
        />
      </label>

      <label>
        Ticket Number {selectedProject?.requiresTicket ? '(required)' : '(optional)'}
        <input
          value={ticketNumber}
          required={Boolean(selectedProject?.requiresTicket)}
          onChange={(event) => setTicketNumber(event.target.value)}
          placeholder="ABC-123"
        />
      </label>

      {task && (
        <label>
          Total Hours
          <input
            type="number"
            min="0"
            step="0.25"
            value={totalHours}
            onChange={(event) => setTotalHours(event.target.value)}
          />
        </label>
      )}

      {error && <p className="form-error">{error}</p>}
      <button type="submit">{submitLabel}</button>
    </form>
  )
}
