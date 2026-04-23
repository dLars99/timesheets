import { create } from 'zustand'
import {
  loadDesktopSnapshot,
  saveDesktopSnapshot,
} from '../lib/desktopPersistence'
import {
  addProjectRemote,
  addTaskRemote,
  addTimeToTaskRemote,
  confirmRecoveryRemote,
  deleteTaskRemote,
  discardRecoveryRemote,
  isDesktopApp,
  pauseActiveTimerRemote,
  startTimerRemote,
  updateTaskRemote,
} from '../lib/taskIpc'
import type { ID, Project, Task, TimesheetSnapshot } from '../types/timesheet'

const STORAGE_KEY = 'timesheets:state:v1'

interface TaskInput {
  description: string
  projectId: ID
  taskDate: string
  ticketNumber?: string
  totalMs?: number
  completedAt?: string
}

interface TaskUpdate {
  description: string
  projectId: ID
  taskDate: string
  ticketNumber?: string
  totalMs: number
}

interface InterruptionInput {
  description: string
  projectId: ID
  taskDate: string
  ticketNumber?: string
  durationMs: number
  pauseActiveTimer: boolean
}

interface TimesheetState extends TimesheetSnapshot {
  recoveryMessage: string | null
  isHydrated: boolean
  hydrate: () => Promise<void>
  addProject: (name: string, requiresTicket: boolean) => Promise<string | null>
  addTask: (input: TaskInput) => Promise<string | null>
  logInterruption: (input: InterruptionInput) => Promise<string | null>
  addTimeToTask: (taskId: ID, deltaMs: number) => Promise<void>
  updateTask: (taskId: ID, update: TaskUpdate) => Promise<string | null>
  finishTask: (taskId: ID) => Promise<void>
  reopenTask: (taskId: ID) => Promise<void>
  deleteTask: (taskId: ID) => Promise<void>
  startTimer: (taskId: ID) => void
  pauseActiveTimer: () => Promise<void>
  adjustTaskTime: (taskId: ID, totalMs: number) => void
  confirmRecovery: () => Promise<void>
  discardRecovery: () => Promise<void>
  getRecentTasks: (limit?: number, includeCompleted?: boolean) => Task[]
}

function saveSnapshot(snapshot: TimesheetSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  void saveDesktopSnapshot(snapshot)
}

function recoveryMessageForSnapshot(snapshot: Pick<
  TimesheetSnapshot,
  'tasks' | 'recoveryTaskId' | 'recoveryElapsedMs'
>): string | null {
  if (!snapshot.recoveryTaskId || snapshot.recoveryElapsedMs === null) {
    return null
  }

  const taskName =
    snapshot.tasks.find((task) => task.id === snapshot.recoveryTaskId)?.description ??
    'a task'

  return `Recovered ${taskName} as paused from previous session.`
}

function extractErrorMessage(error: unknown): string | null {
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.trim()
    if (message) {
      return message
    }
  }

  return null
}

function friendlyErrorMessage(rawMessage: string, fallback: string): string {
  const normalized = rawMessage.toLowerCase()

  if (
    normalized.includes('invalid args') &&
    normalized.includes('expected i64')
  ) {
    return 'The time value could not be saved. Check Total Minutes and try again.'
  }

  if (
    normalized.includes('unique constraint failed') ||
    normalized.includes('tasks_project_date_description_unique')
  ) {
    return 'A matching task already exists for this project and date.'
  }

  if (normalized.includes('selected project no longer exists')) {
    return 'The selected project is no longer available. Choose another project and try again.'
  }

  if (normalized.includes('requires a ticket number')) {
    return rawMessage
  }

  if (
    normalized.includes('invalid type') ||
    normalized.includes('serde') ||
    normalized.includes('json')
  ) {
    return 'The app could not process this save request. Review the form values and try again.'
  }

  if (normalized.includes('database') || normalized.includes('sqlite')) {
    return 'The app could not save your changes right now. Please try again.'
  }

  return fallback
}

function toErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = extractErrorMessage(error)
  if (rawMessage) {
    console.error('Timesheets operation failed:', error)
    return friendlyErrorMessage(rawMessage, fallback)
  }

  return fallback
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

function hasDuplicateTask(
  tasks: Task[],
  description: string,
  projectId: ID,
  taskDate: string,
  ignoreTaskId?: ID,
): boolean {
  const normalizedDescription = description.trim().toLowerCase()
  return tasks.some((task) => {
    if (ignoreTaskId && task.id === ignoreTaskId) {
      return false
    }

    return (
      task.projectId === projectId &&
      task.taskDate === taskDate &&
      task.description.trim().toLowerCase() === normalizedDescription
    )
  })
}

function persistCurrent(state: TimesheetState): void {
  saveSnapshot({
    projects: state.projects,
    tasks: state.tasks,
    activeTimerTaskId: state.activeTimerTaskId,
    activeTimerStartedAt: state.activeTimerStartedAt,
    recoveryTaskId: state.recoveryTaskId,
    recoveryElapsedMs: state.recoveryElapsedMs,
    recoveryBaseTotalMs: state.recoveryBaseTotalMs,
  })
}

function normalizeTotalMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.round(value))
}

function getLiveTaskTotalMs(
  state: Pick<TimesheetState, 'tasks' | 'activeTimerTaskId' | 'activeTimerStartedAt'>,
  taskId: ID,
  now: number,
): number {
  const task = state.tasks.find((candidate) => candidate.id === taskId)
  if (!task) {
    return 0
  }

  if (state.activeTimerTaskId !== taskId || state.activeTimerStartedAt === null) {
    return task.totalMs
  }

  return task.totalMs + Math.max(0, now - state.activeTimerStartedAt)
}

function applySnapshotState(snapshot: TimesheetSnapshot) {
  return {
    projects: snapshot.projects,
    tasks: snapshot.tasks,
    activeTimerTaskId: snapshot.activeTimerTaskId,
    activeTimerStartedAt: snapshot.activeTimerStartedAt,
    recoveryTaskId: snapshot.recoveryTaskId,
    recoveryElapsedMs: snapshot.recoveryElapsedMs,
    recoveryBaseTotalMs: snapshot.recoveryBaseTotalMs,
  }
}

function loadInitialState(): Pick<
  TimesheetState,
  | 'projects'
  | 'tasks'
  | 'activeTimerTaskId'
  | 'activeTimerStartedAt'
  | 'recoveryTaskId'
  | 'recoveryElapsedMs'
  | 'recoveryBaseTotalMs'
  | 'recoveryMessage'
  | 'isHydrated'
> {
  const fallback = {
    projects: [],
    tasks: [],
    activeTimerTaskId: null,
    activeTimerStartedAt: null,
    recoveryTaskId: null,
    recoveryElapsedMs: null,
    recoveryBaseTotalMs: null,
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

    if (parsed.recoveryTaskId && parsed.recoveryElapsedMs !== null) {
      return {
        projects: parsed.projects,
        tasks: parsed.tasks,
        activeTimerTaskId: null,
        activeTimerStartedAt: null,
        recoveryTaskId: parsed.recoveryTaskId,
        recoveryElapsedMs: parsed.recoveryElapsedMs,
        recoveryBaseTotalMs: parsed.recoveryBaseTotalMs ?? null,
        recoveryMessage: recoveryMessageForSnapshot(parsed),
        isHydrated: false,
      }
    }

    if (parsed.activeTimerTaskId && parsed.activeTimerStartedAt) {
      const now = Date.now()
      const elapsed = Math.max(0, now - parsed.activeTimerStartedAt)
      const recoveredTask = parsed.tasks.find(
        (task) => task.id === parsed.activeTimerTaskId,
      )

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
        recoveryTaskId: parsed.activeTimerTaskId,
        recoveryElapsedMs: elapsed,
        recoveryBaseTotalMs: recoveredTask?.totalMs ?? null,
        recoveryMessage: recoveryMessageForSnapshot({
          tasks: recoveredTasks,
          recoveryTaskId: parsed.activeTimerTaskId,
          recoveryElapsedMs: elapsed,
        }),
        isHydrated: false,
      }
    }

    return {
      projects: parsed.projects,
      tasks: parsed.tasks,
      activeTimerTaskId: null,
      activeTimerStartedAt: null,
      recoveryTaskId: null,
      recoveryElapsedMs: null,
      recoveryBaseTotalMs: null,
      recoveryMessage: null,
      isHydrated: false,
    }
  } catch {
    return fallback
  }
}

function applyRecovery(snapshot: TimesheetSnapshot): Pick<
  TimesheetState,
  | 'projects'
  | 'tasks'
  | 'activeTimerTaskId'
  | 'activeTimerStartedAt'
  | 'recoveryTaskId'
  | 'recoveryElapsedMs'
  | 'recoveryBaseTotalMs'
  | 'recoveryMessage'
> {
  if (snapshot.recoveryTaskId && snapshot.recoveryElapsedMs !== null) {
    return {
      projects: snapshot.projects,
      tasks: snapshot.tasks,
      activeTimerTaskId: null,
      activeTimerStartedAt: null,
      recoveryTaskId: snapshot.recoveryTaskId,
      recoveryElapsedMs: snapshot.recoveryElapsedMs,
      recoveryBaseTotalMs: snapshot.recoveryBaseTotalMs,
      recoveryMessage: recoveryMessageForSnapshot(snapshot),
    }
  }

  if (snapshot.activeTimerTaskId && snapshot.activeTimerStartedAt) {
    const now = Date.now()
    const elapsed = Math.max(0, now - snapshot.activeTimerStartedAt)
    const recoveredTask = snapshot.tasks.find(
      (task) => task.id === snapshot.activeTimerTaskId,
    )

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
      recoveryTaskId: snapshot.activeTimerTaskId,
      recoveryElapsedMs: elapsed,
      recoveryBaseTotalMs: recoveredTask?.totalMs ?? null,
      recoveryMessage: recoveryMessageForSnapshot({
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
        recoveryTaskId: snapshot.activeTimerTaskId,
        recoveryElapsedMs: elapsed,
      }),
    }
  }

  return {
    projects: snapshot.projects,
    tasks: snapshot.tasks,
    activeTimerTaskId: null,
    activeTimerStartedAt: null,
    recoveryTaskId: null,
    recoveryElapsedMs: null,
    recoveryBaseTotalMs: null,
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
        recoveryTaskId: recovered.recoveryTaskId,
        recoveryElapsedMs: recovered.recoveryElapsedMs,
        recoveryBaseTotalMs: recovered.recoveryBaseTotalMs,
      })
    },

    addProject: async (name, requiresTicket) => {
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

      if (isDesktopApp()) {
        try {
          const snapshot = await addProjectRemote(project)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
          return null
        } catch (error) {
          return toErrorMessage(error, 'Failed to add project.')
        }
      }

      set((state) => ({ projects: [...state.projects, project] }))
      persistCurrent(get())
      return null
    },

    addTask: async (input) => {
      const description = input.description.trim()
      if (!description) {
        return 'Task description is required.'
      }

      if (
        hasDuplicateTask(get().tasks, description, input.projectId, input.taskDate)
      ) {
        return 'A matching task already exists for this project and date.'
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
        totalMs: normalizeTotalMs(input.totalMs),
        completedAt: input.completedAt,
        createdAt: now,
        updatedAt: now,
      }

      if (isDesktopApp()) {
        try {
          const snapshot = await addTaskRemote(task)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
          return null
        } catch (error) {
          return toErrorMessage(error, 'Failed to add task.')
        }
      }

      set((state) => ({ tasks: [...state.tasks, task] }))
      persistCurrent(get())
      return null
    },

    logInterruption: async (input) => {
      const state = get()
      const activeTaskId = state.activeTimerTaskId

      if (!activeTaskId) {
        return 'An active task is required to log an interruption.'
      }

      const activeTask = state.tasks.find((task) => task.id === activeTaskId)
      if (!activeTask) {
        return 'An active task is required to log an interruption.'
      }

      const description = input.description.trim()
      if (!description) {
        return 'Task description is required.'
      }

      if (
        hasDuplicateTask(state.tasks, description, input.projectId, input.taskDate)
      ) {
        return 'A matching task already exists for this project and date.'
      }

      const validationError = withProjectValidation(
        state.projects,
        input.projectId,
        input.ticketNumber,
      )
      if (validationError) {
        return validationError
      }

      const durationMs = normalizeTotalMs(input.durationMs)
      if (durationMs <= 0) {
        return 'Interruption minutes must be greater than zero.'
      }

      const now = Date.now()
      const currentActiveTotalMs = getLiveTaskTotalMs(state, activeTaskId, now)
      if (durationMs > currentActiveTotalMs) {
        return 'Interruption minutes cannot exceed the current task time.'
      }

      const nowIso = new Date(now).toISOString()
      const interruptionTask: Task = {
        id: `task-${crypto.randomUUID()}`,
        description,
        projectId: input.projectId,
        taskDate: input.taskDate,
        ticketNumber: input.ticketNumber?.trim() || undefined,
        totalMs: durationMs,
        completedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      }

      const nextTasks = state.tasks.map((task) => {
        if (task.id !== activeTaskId) {
          return task
        }

        return {
          ...task,
          totalMs: currentActiveTotalMs - durationMs,
          updatedAt: nowIso,
        }
      })

      const nextSnapshot: TimesheetSnapshot = {
        projects: state.projects,
        tasks: [...nextTasks, interruptionTask],
        activeTimerTaskId: input.pauseActiveTimer ? null : activeTaskId,
        activeTimerStartedAt: input.pauseActiveTimer ? null : now,
        recoveryTaskId: null,
        recoveryElapsedMs: null,
        recoveryBaseTotalMs: null,
      }

      set(() => ({
        ...applySnapshotState(nextSnapshot),
        recoveryMessage: null,
      }))
      saveSnapshot(nextSnapshot)

      return null
    },

    addTimeToTask: async (taskId, deltaMs) => {
      const safeDelta = Math.max(0, deltaMs)
      if (safeDelta <= 0) {
        return
      }

      const nowIso = new Date().toISOString()

      if (isDesktopApp()) {
        try {
          const snapshot = await addTimeToTaskRemote(taskId, safeDelta, nowIso)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
          return
        } catch {
          return
        }
      }

      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
              ...task,
              totalMs: task.totalMs + safeDelta,
              updatedAt: nowIso,
            }
            : task,
        ),
      }))
      persistCurrent(get())
    },

    updateTask: async (taskId, update) => {
      const description = update.description.trim()
      if (!description) {
        return 'Task description is required.'
      }

      if (
        hasDuplicateTask(
          get().tasks,
          description,
          update.projectId,
          update.taskDate,
          taskId,
        )
      ) {
        return 'A matching task already exists for this project and date.'
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
      const normalizedTotalMs = normalizeTotalMs(update.totalMs)

      if (isDesktopApp()) {
        const currentTask = get().tasks.find((task) => task.id === taskId)
        if (!currentTask) {
          return 'Task not found.'
        }

        const nextTask: Task = {
          ...currentTask,
          description,
          projectId: update.projectId,
          taskDate: update.taskDate,
          ticketNumber: update.ticketNumber?.trim() || undefined,
          totalMs: normalizedTotalMs,
          completedAt: currentTask.completedAt,
          updatedAt: now,
        }

        try {
          const snapshot = await updateTaskRemote(nextTask)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
          return null
        } catch (error) {
          return toErrorMessage(error, 'Failed to update task.')
        }
      }

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
            totalMs: normalizedTotalMs,
            updatedAt: now,
          }
        }),
      }))

      persistCurrent(get())
      return null
    },

    finishTask: async (taskId) => {
      const current = get()
      const task = current.tasks.find((candidate) => candidate.id === taskId)
      if (!task) {
        return
      }

      const now = Date.now()
      const nowIso = new Date(now).toISOString()

      if (isDesktopApp()) {
        const shouldPause = current.activeTimerTaskId === taskId

        try {
          let snapshot: TimesheetSnapshot | null = null

          if (shouldPause) {
            snapshot = await pauseActiveTimerRemote(now, nowIso)
          }

          const sourceTask =
            snapshot?.tasks.find((candidate) => candidate.id === taskId) ?? task

          const finishedTask: Task = {
            ...sourceTask,
            completedAt: nowIso,
            updatedAt: nowIso,
          }

          const updatedSnapshot = await updateTaskRemote(finishedTask)
          set(() => ({
            ...applySnapshotState(updatedSnapshot),
            recoveryMessage: recoveryMessageForSnapshot(updatedSnapshot),
          }))
          saveSnapshot(updatedSnapshot)
        } catch {
          return
        }

        return
      }

      set((state) => ({
        activeTimerTaskId:
          state.activeTimerTaskId === taskId ? null : state.activeTimerTaskId,
        activeTimerStartedAt:
          state.activeTimerTaskId === taskId ? null : state.activeTimerStartedAt,
        tasks: state.tasks.map((candidate) => {
          if (candidate.id !== taskId) {
            return candidate
          }

          const elapsed =
            state.activeTimerTaskId === taskId && state.activeTimerStartedAt
              ? Math.max(0, now - state.activeTimerStartedAt)
              : 0

          return {
            ...candidate,
            totalMs: candidate.totalMs + elapsed,
            completedAt: nowIso,
            updatedAt: nowIso,
          }
        }),
      }))

      persistCurrent(get())
    },

    reopenTask: async (taskId) => {
      const task = get().tasks.find((candidate) => candidate.id === taskId)
      if (!task || !task.completedAt) {
        return
      }

      const nowIso = new Date().toISOString()

      if (isDesktopApp()) {
        try {
          const reopenedTask: Task = {
            ...task,
            completedAt: undefined,
            updatedAt: nowIso,
          }

          const snapshot = await updateTaskRemote(reopenedTask)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
        } catch {
          return
        }

        return
      }

      set((state) => ({
        tasks: state.tasks.map((candidate) =>
          candidate.id === taskId
            ? {
              ...candidate,
              completedAt: undefined,
              updatedAt: nowIso,
            }
            : candidate,
        ),
      }))

      persistCurrent(get())
    },

    deleteTask: async (taskId) => {
      if (isDesktopApp()) {
        try {
          const snapshot = await deleteTaskRemote(taskId)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
          return
        } catch {
          return
        }
      }

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
      if (isDesktopApp()) {
        const now = Date.now()
        const nowIso = new Date(now).toISOString()

        void startTimerRemote(taskId, now, nowIso)
          .then((snapshot) => {
            set(() => ({
              ...applySnapshotState(snapshot),
              recoveryMessage: recoveryMessageForSnapshot(snapshot),
            }))
            saveSnapshot(snapshot)
          })
          .catch(() => undefined)
        return
      }

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

    pauseActiveTimer: async () => {
      if (isDesktopApp()) {
        const now = Date.now()
        const nowIso = new Date(now).toISOString()

        try {
          const snapshot = await pauseActiveTimerRemote(now, nowIso)
          set(() => ({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          }))
          saveSnapshot(snapshot)
        } catch {
          // Silently fail for consistency with original behavior
        }
        return
      }

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

    confirmRecovery: async () => {
      const { recoveryTaskId } = get()
      if (!recoveryTaskId) {
        return
      }

      if (isDesktopApp()) {
        try {
          const snapshot = await confirmRecoveryRemote(recoveryTaskId)
          set({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          })
          saveSnapshot(snapshot)
          return
        } catch {
          return
        }
      }

      set({
        recoveryTaskId: null,
        recoveryElapsedMs: null,
        recoveryBaseTotalMs: null,
        recoveryMessage: null,
      })
      persistCurrent(get())
    },

    discardRecovery: async () => {
      const { recoveryTaskId, recoveryElapsedMs } = get()
      if (!recoveryTaskId || recoveryElapsedMs === null) {
        return
      }

      if (isDesktopApp()) {
        try {
          const snapshot = await discardRecoveryRemote(recoveryTaskId)
          set({
            ...applySnapshotState(snapshot),
            recoveryMessage: recoveryMessageForSnapshot(snapshot),
          })
          saveSnapshot(snapshot)
          return
        } catch {
          return
        }
      }

      set((state) => ({
        tasks: state.tasks.map((task) =>
          task.id === recoveryTaskId
            ? {
              ...task,
              totalMs: Math.max(0, task.totalMs - recoveryElapsedMs),
              updatedAt: new Date().toISOString(),
            }
            : task,
        ),
        recoveryTaskId: null,
        recoveryElapsedMs: null,
        recoveryBaseTotalMs: null,
        recoveryMessage: null,
      }))
      persistCurrent(get())
    },

    getRecentTasks: (limit = 3, includeCompleted = false) => {
      const safeLimit = Math.min(limit, 100)
      return [...get().tasks]
        .filter((task) => includeCompleted || !task.completedAt)
        .sort((a, b) => {
          const byUpdated = b.updatedAt.localeCompare(a.updatedAt)
          if (byUpdated !== 0) return byUpdated
          return b.taskDate.localeCompare(a.taskDate)
        })
        .slice(0, safeLimit)
    },
  }

  saveSnapshot({
    projects: initialState.projects,
    tasks: initialState.tasks,
    activeTimerTaskId: initialState.activeTimerTaskId,
    activeTimerStartedAt: initialState.activeTimerStartedAt,
    recoveryTaskId: initialState.recoveryTaskId,
    recoveryElapsedMs: initialState.recoveryElapsedMs,
    recoveryBaseTotalMs: initialState.recoveryBaseTotalMs,
  })

  return initialState
})
