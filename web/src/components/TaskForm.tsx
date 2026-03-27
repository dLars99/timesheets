import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useTimesheetStore } from '../stores/useTimesheetStore'
import type { Task } from '../types/timesheet'

const OTHER_PROJECT_ID = '__other_project__'

interface TaskFormProps {
  task?: Task
  onDone?: () => void
}

export function TaskForm({ task, onDone }: TaskFormProps) {
  const projects = useTimesheetStore((state) => state.projects)
  const addTask = useTimesheetStore((state) => state.addTask)
  const updateTask = useTimesheetStore((state) => state.updateTask)
  const addProject = useTimesheetStore((state) => state.addProject)
  const startTimer = useTimesheetStore((state) => state.startTimer)

  const [description, setDescription] = useState(task?.description ?? '')
  const [projectId, setProjectId] = useState(task?.projectId ?? projects[0]?.id ?? '')
  const [newProjectName, setNewProjectName] = useState('')
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
  const isOtherProject = !task && projectId === OTHER_PROJECT_ID

  const submitLabel = task ? 'Save Changes' : 'Start Task'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (task) {
      const parsedHours = Number(totalHours)
      const result = await updateTask(task.id, {
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
      let resolvedProjectId = projectId

      if (isOtherProject) {
        const trimmedProjectName = newProjectName.trim()
        if (!trimmedProjectName) {
          setError('Project name is required when selecting Other.')
          return
        }

        const projectError = await addProject(trimmedProjectName, false)
        if (projectError) {
          setError(projectError)
          return
        }

        const createdProject = useTimesheetStore
          .getState()
          .projects.find(
            (project) =>
              project.name.trim().toLowerCase() ===
              trimmedProjectName.toLowerCase(),
          )

        if (!createdProject) {
          setError('Project was created but could not be selected. Try again.')
          return
        }

        resolvedProjectId = createdProject.id
      }

      const result = await addTask({
        description,
        projectId: resolvedProjectId,
        taskDate,
        ticketNumber,
      })
      if (result) {
        setError(result)
        return
      }

      // Task descriptions are unique per project/date, so this identifies
      // the task just created and starts timing immediately.
      const normalizedDescription = description.trim().toLowerCase()
      const createdTask = [...useTimesheetStore.getState().tasks]
        .filter((candidate) =>
          candidate.projectId === resolvedProjectId &&
          candidate.taskDate === taskDate &&
          candidate.description.trim().toLowerCase() === normalizedDescription,
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

      if (createdTask) {
        startTimer(createdTask.id)
      }

      setDescription('')
      setTicketNumber('')
      setNewProjectName('')
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
          {!task && <option value={OTHER_PROJECT_ID}>Other</option>}
        </select>
      </label>

      {isOtherProject && (
        <label>
          New Project Name
          <input
            required
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder="Project name"
          />
        </label>
      )}

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
          placeholder="123456"
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
