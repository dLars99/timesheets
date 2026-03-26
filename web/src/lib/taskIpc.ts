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
): Promise<TimesheetSnapshot> {
  return invoke<TimesheetSnapshot>('add_time_to_task', { taskId, deltaMs })
}
