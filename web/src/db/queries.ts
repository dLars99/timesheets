import { and, between, eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { projects, tasks } from './schema'

export function selectTasksForRange(
  db: BetterSQLite3Database,
  startDate: string,
  endDate: string,
) {
  return db
    .select({
      id: tasks.id,
      taskDate: tasks.taskDate,
      description: tasks.description,
      ticketNumber: tasks.ticketNumber,
      totalMs: tasks.totalMs,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(between(tasks.taskDate, startDate, endDate)))
    .orderBy(tasks.taskDate)
}

export function selectProjectTotalsForRange(
  db: BetterSQLite3Database,
  startDate: string,
  endDate: string,
) {
  return db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      totalMs: sql<number>`sum(${tasks.totalMs})`,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(between(tasks.taskDate, startDate, endDate)))
    .groupBy(projects.id, projects.name)
    .orderBy(projects.name)
}
