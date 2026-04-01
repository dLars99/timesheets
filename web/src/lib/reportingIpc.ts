import { invoke } from '@tauri-apps/api/core'

export interface ProjectTotalRow {
  projectId: string
  projectName: string
  totalMs: number
}

export interface ExportCsvRow {
  rowType: 'detail' | 'summary'
  date: string
  project: string
  description: string
  ticketNumber: string
  hours: string
}

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function fetchProjectTotals(
  startDate: string,
  endDate: string,
): Promise<ProjectTotalRow[] | null> {
  if (!isDesktop()) {
    return null
  }

  try {
    const rows = await invoke<ProjectTotalRow[]>('get_project_totals', {
      startDate,
      endDate,
    })
    return rows
  } catch (error) {
    console.error('Failed to load project totals from desktop IPC', error)
    return null
  }
}

export async function fetchExportRows(
  startDate: string,
  endDate: string,
): Promise<ExportCsvRow[] | null> {
  if (!isDesktop()) {
    return null
  }

  try {
    const rows = await invoke<ExportCsvRow[]>('get_export_rows', {
      startDate,
      endDate,
    })
    return rows
  } catch (error) {
    console.error('Failed to load export rows from desktop IPC', error)
    return null
  }
}

export interface TaskSearchRow {
  id: string
  taskDate: string
  description: string
  projectId: string
  projectName: string
  ticketNumber: string | null
  totalMs: number
  completedAt: string | null
}

export async function fetchTasksForRange(
  startDate: string,
  endDate: string,
): Promise<TaskSearchRow[] | null> {
  if (!isDesktop()) {
    return null
  }

  try {
    const rows = await invoke<TaskSearchRow[]>('get_tasks_for_range', {
      startDate,
      endDate,
    })
    return rows
  } catch (error) {
    console.error('Failed to load task rows from desktop IPC', error)
    return null
  }
}
