import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    requiresTicket: integer('requires_ticket', { mode: 'boolean' }).notNull(),
    isUserDefined: integer('is_user_defined', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('projects_name_unique').on(table.name)],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    taskDate: text('task_date').notNull(),
    totalMs: integer('total_ms').notNull().default(0),
    completedAt: text('completed_at'),
    ticketNumber: text('ticket_number'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('tasks_project_date_description_unique').on(
      table.projectId,
      table.taskDate,
      table.description,
    ),
  ],
)

export const timers = sqliteTable('timers', {
  taskId: text('task_id')
    .primaryKey()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  pausedAt: integer('paused_at'),
  elapsedMs: integer('elapsed_ms').notNull().default(0),
})

export const openTasks = sqliteTable('open_tasks', {
  taskId: text('task_id')
    .primaryKey()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  wasRunning: integer('was_running', { mode: 'boolean' }).notNull(),
  accumulatedTimeMs: integer('accumulated_time_ms').notNull().default(0),
  lastUpdatedAt: text('last_updated_at').notNull(),
})
