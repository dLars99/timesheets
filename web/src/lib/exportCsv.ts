import Papa from 'papaparse'
import type { ExportCsvRow } from './reportingIpc'
import type { Project, Task } from '../types/timesheet'
import { toDecimalHours } from './time'

function downloadCsv(rows: ExportCsvRow[], startDate: string, endDate: string): void {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `timesheets-${startDate}-to-${endDate}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function exportRowsToCsv(
  rows: ExportCsvRow[],
  startDate: string,
  endDate: string,
): void {
  downloadCsv(rows, startDate, endDate)
}

export function exportTasksToCsv(
  tasks: Task[],
  projects: Project[],
  startDate: string,
  endDate: string,
): void {
  const projectById = new Map(projects.map((project) => [project.id, project]))

  const inRange = tasks
    .filter((task) => task.taskDate >= startDate && task.taskDate <= endDate)
    .sort((a, b) => {
      if (a.taskDate === b.taskDate) {
        return a.updatedAt.localeCompare(b.updatedAt)
      }
      return a.taskDate.localeCompare(b.taskDate)
    })

  const detailRows: ExportCsvRow[] = inRange.map((task) => ({
    rowType: 'detail',
    date: task.taskDate,
    project: projectById.get(task.projectId)?.name ?? 'Unknown',
    description: task.description,
    ticketNumber: task.ticketNumber ?? '',
    hours: toDecimalHours(task.totalMs),
  }))

  const totalsByProject = new Map<string, number>()
  for (const task of inRange) {
    totalsByProject.set(task.projectId, (totalsByProject.get(task.projectId) ?? 0) + task.totalMs)
  }

  const summaryRows: ExportCsvRow[] = Array.from(totalsByProject.entries())
    .sort((a, b) => {
      const aName = projectById.get(a[0])?.name ?? ''
      const bName = projectById.get(b[0])?.name ?? ''
      return aName.localeCompare(bName)
    })
    .map(([projectId, totalMs]) => ({
      rowType: 'summary',
      date: '',
      project: projectById.get(projectId)?.name ?? 'Unknown',
      description: 'TOTAL',
      ticketNumber: '',
      hours: toDecimalHours(totalMs),
    }))

  downloadCsv([...detailRows, ...summaryRows], startDate, endDate)
}
