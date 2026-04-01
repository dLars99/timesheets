import { and, between, desc, eq, sql } from 'drizzle-orm'
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
      completedAt: tasks.completedAt,
      projectId: tasks.projectId,
      projectName: projects.name,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(between(tasks.taskDate, startDate, endDate)))
    .orderBy(desc(tasks.taskDate), desc(tasks.updatedAt))
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
