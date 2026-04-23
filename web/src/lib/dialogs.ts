import { isDesktopApp } from './taskIpc'

export async function confirmDelete(): Promise<boolean> {
  if (isDesktopApp()) {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    return confirm('Delete this task?', { title: 'Delete Task', kind: 'warning' })
  }
  return window.confirm('Delete this task?')
}
