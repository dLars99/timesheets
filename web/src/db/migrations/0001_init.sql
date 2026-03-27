CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  requires_ticket INTEGER NOT NULL,
  is_user_defined INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  description TEXT NOT NULL,
  task_date TEXT NOT NULL,
  total_ms INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  ticket_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tasks_project_date_description_unique
  ON tasks(project_id, task_date, description);

CREATE TABLE timers (
  task_id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  paused_at INTEGER,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE open_tasks (
  task_id TEXT PRIMARY KEY NOT NULL,
  was_running INTEGER NOT NULL,
  accumulated_time_ms INTEGER NOT NULL DEFAULT 0,
  last_updated_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
