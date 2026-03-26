import { create } from 'zustand'
import { DEFAULT_PROJECTS } from '../data/defaultProjects'
import {
  loadDesktopSnapshot,
  saveDesktopSnapshot,
} from '../lib/desktopPersistence'
import type { ID, Project, Task, TimesheetSnapshot } from '../types/timesheet'

const STORAGE_KEY = 'timesheets:state:v1'

interface TaskInput {
  description: string
  projectId: ID
  taskDate: string
  ticketNumber?: string
  totalMs?: number
}

interface TaskUpdate {
  description: string
  projectId: ID
  taskDate: string
  ticketNumber?: string
  totalMs: number
}

interface TimesheetState extends TimesheetSnapshot {
  recoveryMessage: string | null
  isHydrated: boolean
  hydrate: () => Promise<void>
  addProject: (name: string, requiresTicket: boolean) => string | null
  addTask: (input: TaskInput) => string | null
  addTimeToTask: (taskId: ID, deltaMs: number) => void
  updateTask: (taskId: ID, update: TaskUpdate) => string | null
  deleteTask: (taskId: ID) => void
  startTimer: (taskId: ID) => void
  pauseActiveTimer: () => void
  adjustTaskTime: (taskId: ID, totalMs: number) => void
  clearRecoveryMessage: () => void
  getRecentTasks: (limit?: number) => Task[]
}

function saveSnapshot(snapshot: TimesheetSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  void saveDesktopSnapshot(snapshot)
}

function withProjectValidation(
  projects: Project[],
  projectId: ID,
  ticketNumber?: string,
): string | null {
  const project = projects.find((candidate) => candidate.id === projectId)
  if (!project) {
    return 'Selected project no longer exists.'
  }

  if (project.requiresTicket && !ticketNumber?.trim()) {
    return `${project.name} requires a ticket number.`
  }

  return null
}

function persistCurrent(state: TimesheetState): void {
  saveSnapshot({
    projects: state.projects,
    tasks: state.tasks,
    activeTimerTaskId: state.activeTimerTaskId,
    activeTimerStartedAt: state.activeTimerStartedAt,
  })
}

function loadInitialState(): Pick<
  TimesheetState,
  | 'projects'
  | 'tasks'
  | 'activeTimerTaskId'
  | 'activeTimerStartedAt'
  | 'recoveryMessage'
  | 'isHydrated'
> {
  const fallback = {
    projects: DEFAULT_PROJECTS,
    tasks: [],
    activeTimerTaskId: null,
    activeTimerStartedAt: null,
    recoveryMessage: null,
    isHydrated: false,
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return fallback
  }

  try {
    const parsed = JSON.parse(raw) as TimesheetSnapshot
    if (!parsed.projects || !parsed.tasks) {
      return fallback
    }

    if (parsed.activeTimerTaskId && parsed.activeTimerStartedAt) {
      const now = Date.now()
      const elapsed = Math.max(0, now - parsed.activeTimerStartedAt)
      const taskName =
        parsed.tasks.find((task) => task.id === parsed.activeTimerTaskId)
          ?.description ?? 'a task'

      const recoveredTasks = parsed.tasks.map((task) => {
        if (task.id !== parsed.activeTimerTaskId) {
          return task
        }

        return {
          ...task,
          totalMs: task.totalMs + elapsed,
          updatedAt: new Date(now).toISOString(),
        }
      })

      return {
        projects: parsed.projects,
        tasks: recoveredTasks,
        activeTimerTaskId: null,
        activeTimerStartedAt: null,
        recoveryMessage: `Recovered ${taskName} as paused from previous session.`,
        isHydrated: false,
      }
    }

    return {
      projects: parsed.projects,
      tasks: parsed.tasks,
      activeTimerTaskId: null,
      activeTimerStartedAt: null,
      recoveryMessage: null,
      isHydrated: false,
    }
  } catch {
    return fallback
  }
}

function applyRecovery(snapshot: TimesheetSnapshot): Pick<
  TimesheetState,
  'projects' | 'tasks' | 'activeTimerTaskId' | 'activeTimerStartedAt' | 'recoveryMessage'
> {
  if (snapshot.activeTimerTaskId && snapshot.activeTimerStartedAt) {
    const now = Date.now()
    const elapsed = Math.max(0, now - snapshot.activeTimerStartedAt)
    const taskName =
      snapshot.tasks.find((task) => task.id === snapshot.activeTimerTaskId)
        ?.description ?? 'a task'

    return {
      projects: snapshot.projects,
      tasks: snapshot.tasks.map((task) => {
        if (task.id !== snapshot.activeTimerTaskId) {
          return task
        }
        return {
          ...task,
          totalMs: task.totalMs + elapsed,
          updatedAt: new Date(now).toISOString(),
        }
      }),
      activeTimerTaskId: null,
      activeTimerStartedAt: null,
      recoveryMessage: `Recovered ${taskName} as paused from previous session.`,
    }
  }

  return {
    projects: snapshot.projects,
    tasks: snapshot.tasks,
    activeTimerTaskId: null,
    activeTimerStartedAt: null,
    recoveryMessage: null,
  }
}

export const useTimesheetStore = create<TimesheetState>((set, get) => {
  const initial = loadInitialState()

  const initialState: TimesheetState = {
    ...initial,
    hydrate: async () => {
      const remote = await loadDesktopSnapshot()
      if (!remote) {
        set({ isHydrated: true })
        return
      }

      const recovered = applyRecovery(remote)
      set({ ...recovered, isHydrated: true })
      saveSnapshot({
        projects: recovered.projects,
        tasks: recovered.tasks,
        activeTimerTaskId: recovered.activeTimerTaskId,
        activeTimerStartedAt: recovered.activeTimerStartedAt,
      })
    },

    addProject: (name, requiresTicket) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return 'Project name is required.'
      }

      const duplicate = get().projects.some(
        (project) => project.name.toLowerCase() === trimmedName.toLowerCase(),
      )

      if (duplicate) {
        return 'Project already exists.'
      }

      const now = new Date().toISOString()
      const project: Project = {
        id: `project-${crypto.randomUUID()}`,
        name: trimmedName,
        requiresTicket,
        isUserDefined: true,
        createdAt: now,
      }

      set((state) => ({ projects: [...state.projects, project] }))
      persistCurrent(get())
      return null
    },

    addTask: (input) => {
      const description = input.description.trim()
      if (!description) {
        return 'Task description is required.'
      }

      const validationError = withProjectValidation(
        get().projects,
        input.projectId,
        input.ticketNumber,
      )
      if (validationError) {
        return validationError
      }

      const now = new Date().toISOString()
      const task: Task = {
        id: `task-${crypto.randomUUID()}`,
        description,
        projectId: input.projectId,
        taskDate: input.taskDate,
        ticketNumber: input.ticketNumber?.trim() || undefined,
        totalMs: Math.max(0, input.totalMs ?? 0),
        createdAt: now,
        updatedAt: now,
      }

      set((state) => ({ tasks: [...state.tasks, task] }))
      persistCurrent(get())
      return null
    },

    addTimeToTask: (taskId, deltaMs) => {
      const safeDelta = Math.max(0, deltaMs)
      if (safeDelta <= 0) {
        return
      }

      const now = new Date().toISOString()
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
              ...task,
              totalMs: task.totalMs + safeDelta,
              updatedAt: now,
            }
            : task,
        ),
      }))
      persistCurrent(get())
    },

    updateTask: (taskId, update) => {
      const description = update.description.trim()
      if (!description) {
        return 'Task description is required.'
      }

      const validationError = withProjectValidation(
        get().projects,
        update.projectId,
        update.ticketNumber,
      )
      if (validationError) {
        return validationError
      }

      const now = new Date().toISOString()
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId) {
            return task
          }

          return {
            ...task,
            description,
            projectId: update.projectId,
            taskDate: update.taskDate,
            ticketNumber: update.ticketNumber?.trim() || undefined,
            totalMs: Math.max(0, update.totalMs),
            updatedAt: now,
          }
        }),
      }))

      persistCurrent(get())
      return null
    },

    deleteTask: (taskId) => {
      const current = get()
      const removingActive = current.activeTimerTaskId === taskId

      set((state) => ({
        tasks: state.tasks.filter((task) => task.id !== taskId),
        activeTimerTaskId: removingActive ? null : state.activeTimerTaskId,
        activeTimerStartedAt: removingActive ? null : state.activeTimerStartedAt,
      }))

      persistCurrent(get())
    },

    startTimer: (taskId) => {
      const state = get()
      if (state.activeTimerTaskId === taskId) {
        return
      }

      state.pauseActiveTimer()
      const now = Date.now()
      const nowIso = new Date(now).toISOString()

      set((current) => ({
        activeTimerTaskId: taskId,
        activeTimerStartedAt: now,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, updatedAt: nowIso } : task,
        ),
      }))

      persistCurrent(get())
    },

    pauseActiveTimer: () => {
      const state = get()
      if (!state.activeTimerTaskId || !state.activeTimerStartedAt) {
        return
      }

      const now = Date.now()
      const elapsed = Math.max(0, now - state.activeTimerStartedAt)
      const nowIso = new Date(now).toISOString()

      set((current) => ({
        activeTimerTaskId: null,
        activeTimerStartedAt: null,
        tasks: current.tasks.map((task) => {
          if (task.id !== state.activeTimerTaskId) {
            return task
          }
          return {
            ...task,
            totalMs: task.totalMs + elapsed,
            updatedAt: nowIso,
          }
        }),
      }))

      persistCurrent(get())
    },

    adjustTaskTime: (taskId, totalMs) => {
      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
              ...task,
              totalMs: Math.max(0, totalMs),
              updatedAt: new Date().toISOString(),
            }
            : task,
        ),
      }))
      persistCurrent(get())
    },

    clearRecoveryMessage: () => {
      set({ recoveryMessage: null })
    },

    getRecentTasks: (limit = 3) => {
      return [...get().tasks]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
    },
  }

  saveSnapshot({
    projects: initialState.projects,
    tasks: initialState.tasks,
    activeTimerTaskId: initialState.activeTimerTaskId,
    activeTimerStartedAt: initialState.activeTimerStartedAt,
  })

  return initialState
})
