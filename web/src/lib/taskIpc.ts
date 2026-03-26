import { invoke } from '@tauri-apps/api/core'
import type { ID, Project, Task, TimesheetSnapshot } from '../types/timesheet'

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function addProjectRemote(
  project: Project,
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('add_project', { project })
}

export async function addTaskRemote(task: Task): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('add_task', { task })
}

export async function updateTaskRemote(task: Task): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('update_task', { task })
}

export async function deleteTaskRemote(taskId: ID): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('delete_task', { taskId })
}

export async function addTimeToTaskRemote(
  taskId: ID,
  deltaMs: number,
  updatedAt: string,
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('add_time_to_task', {
    taskId,
    deltaMs,
    updatedAt,
  })
}

export async function startTimerRemote(
  taskId: ID,
  startedAt: number,
  updatedAt: string,
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('start_timer', { taskId, startedAt, updatedAt })
}

export async function pauseActiveTimerRemote(
  pausedAt: number,
  updatedAt: string,
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('pause_active_timer', { pausedAt, updatedAt })
}

export async function confirmRecoveryRemote(
  taskId: ID,
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('confirm_recovery', { taskId })
}

export async function discardRecoveryRemote(
  taskId: ID,
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('discard_recovery', { taskId })
}
