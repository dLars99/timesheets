export type ID = string

export interface Project {
  id: ID
  name: string
  requiresTicket: boolean
  isUserDefined: boolean
  createdAt: string
}

export interface Task {
  id: ID
  description: string
  projectId: ID
  taskDate: string
  ticketNumber?: string
  totalMs: number
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TimesheetSnapshot {
  projects: Project[]
  tasks: Task[]
  activeTimerTaskId: ID | null
  activeTimerStartedAt: number | null
  recoveryTaskId: ID | null
  recoveryElapsedMs: number | null
  recoveryBaseTotalMs: number | null
}
