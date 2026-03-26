import { invoke } from '@tauri-apps/api/core'
import type { TimesheetSnapshot } from '../types/timesheet'

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function loadDesktopSnapshot(): Promise<TimesheetSnapshot | null> {
  if (!isDesktop()) {
    return null
  }

  try {
    const stateJson = await invoke<string | null>('load_state')
    if (!stateJson) {
      return null
    }
    return JSON.parse(stateJson) as TimesheetSnapshot
  } catch (error) {
    console.error('Failed to load desktop snapshot', error)
    return null
  }
}

export async function saveDesktopSnapshot(
  snapshot: TimesheetSnapshot,
): Promise<void> {
  if (!isDesktop()) {
    return
  }

  try {
    await invoke('save_state', { stateJson: JSON.stringify(snapshot) })
  } catch (error) {
    console.error('Failed to save desktop snapshot', error)
  }
}
