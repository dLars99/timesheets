use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const INIT_SQL: &str = include_str!("../../src/db/migrations/0001_init.sql");
const SEED_PROJECTS_SQL: &str = include_str!("../../src/db/migrations/0002_seed_projects.sql");

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedProject {
  id: String,
  name: String,
  requires_ticket: bool,
  is_user_defined: bool,
  created_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedTask {
  id: String,
  project_id: String,
  description: String,
  task_date: String,
  total_ms: i64,
  ticket_number: Option<String>,
  created_at: String,
  updated_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSnapshot {
  projects: Vec<PersistedProject>,
  tasks: Vec<PersistedTask>,
  active_timer_task_id: Option<String>,
  active_timer_started_at: Option<i64>,
  recovery_task_id: Option<String>,
  recovery_elapsed_ms: Option<i64>,
  recovery_base_total_ms: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTotal {
  project_id: String,
  project_name: String,
  total_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRow {
  row_type: String,
  date: String,
  project: String,
  description: String,
  ticket_number: String,
  hours: String,
}

fn state_dir_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let app_dir = app
    .path()
    .app_data_dir()
    .map_err(|err| format!("failed to resolve app data dir: {err}"))?;

  fs::create_dir_all(&app_dir)
    .map_err(|err| format!("failed to create app data dir: {err}"))?;

  Ok(app_dir)
}

fn sqlite_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(state_dir_path(app)?.join("timesheets.db"))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
  let db_path = sqlite_file_path(app)?;
  let conn = Connection::open(db_path)
    .map_err(|err| format!("failed to open sqlite database: {err}"))?;
  init_db(&conn)?;
  Ok(conn)
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
  let exists: i64 = conn
    .query_row(
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
      [table_name],
      |row| row.get(0),
    )
    .map_err(|err| format!("failed to inspect sqlite schema: {err}"))?;

  Ok(exists > 0)
}

fn migrate_legacy_app_state(conn: &Connection) -> Result<(), String> {
  if !table_exists(conn, "app_state")? {
    return Ok(());
  }

  let legacy_state = conn
    .query_row(
      "SELECT active_timer_task_id, active_timer_started_at FROM app_state WHERE id = 1",
      [],
      |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<i64>>(1)?)),
    );

  if let Ok((Some(task_id), Some(started_at))) = legacy_state {
    let task_exists: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM tasks WHERE id = ?1",
        [&task_id],
        |row| row.get(0),
      )
      .map_err(|err| format!("failed to validate legacy active timer task: {err}"))?;

    if task_exists > 0 {
      let task_state: (i64, String) = conn
        .query_row(
          "SELECT total_ms, updated_at FROM tasks WHERE id = ?1",
          [&task_id],
          |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|err| format!("failed to read legacy task state: {err}"))?;

      conn
        .execute(
          "INSERT OR REPLACE INTO timers (task_id, started_at, paused_at, elapsed_ms)
           VALUES (?1, ?2, NULL, ?3)",
          params![task_id, started_at, task_state.0],
        )
        .map_err(|err| format!("failed to migrate legacy timer row: {err}"))?;

      conn
        .execute(
          "INSERT OR REPLACE INTO open_tasks (task_id, was_running, accumulated_time_ms, last_updated_at)
           VALUES (?1, 1, ?2, ?3)",
          params![task_id, task_state.0, task_state.1],
        )
        .map_err(|err| format!("failed to migrate legacy open task row: {err}"))?;
    }
  }

  conn
    .execute_batch("DROP TABLE IF EXISTS app_state;")
    .map_err(|err| format!("failed to remove legacy app_state table: {err}"))?;

  Ok(())
}

fn init_db(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch("PRAGMA foreign_keys = ON;")
    .map_err(|err| format!("failed to enable sqlite foreign keys: {err}"))?;

  conn
    .execute_batch(INIT_SQL)
    .map_err(|err| format!("failed to initialize sqlite schema: {err}"))?;

  migrate_legacy_app_state(conn)?;

  let count: i64 = conn
    .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
    .map_err(|err| format!("failed to count projects: {err}"))?;

  if count == 0 {
    conn
      .execute_batch(SEED_PROJECTS_SQL)
      .map_err(|err| format!("failed to seed default projects: {err}"))?;
  }

  Ok(())
}

fn current_timestamp_ms() -> i64 {
  use std::time::{SystemTime, UNIX_EPOCH};

  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

fn current_timestamp_iso(conn: &Connection) -> Result<String, String> {
  conn
    .query_row(
      "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
      [],
      |row| row.get(0),
    )
    .map_err(|err| format!("failed to generate sqlite timestamp: {err}"))
}

fn recover_interrupted_timer(conn: &Connection) -> Result<(), String> {
  let active_timer = conn.query_row(
    "SELECT task_id, started_at, elapsed_ms FROM timers WHERE paused_at IS NULL LIMIT 1",
    [],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, i64>(1)?,
        row.get::<_, i64>(2)?,
      ))
    },
  );

  let (task_id, started_at, elapsed_ms) = match active_timer {
    Ok(row) => row,
    Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
    Err(err) => return Err(format!("failed to inspect active timer for recovery: {err}")),
  };

  let task_state: (i64, String) = conn
    .query_row(
      "SELECT total_ms, updated_at FROM tasks WHERE id = ?1",
      [&task_id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|err| format!("failed to read task state for recovery: {err}"))?;

  let base_total_ms = conn
    .query_row(
      "SELECT accumulated_time_ms FROM open_tasks WHERE task_id = ?1",
      [&task_id],
      |row| row.get::<_, i64>(0),
    )
    .unwrap_or(elapsed_ms.max(task_state.0));

  let recovered_elapsed_ms = (current_timestamp_ms() - started_at).max(0);
  let recovered_total_ms = base_total_ms + recovered_elapsed_ms;
  let recovered_at = current_timestamp_iso(conn)?;

  conn
    .execute(
      "UPDATE tasks SET total_ms = ?2, updated_at = ?3 WHERE id = ?1",
      params![task_id, recovered_total_ms, recovered_at],
    )
    .map_err(|err| format!("failed to update recovered task total: {err}"))?;

  conn
    .execute("DELETE FROM timers WHERE task_id = ?1", [&task_id])
    .map_err(|err| format!("failed to clear recovered timer row: {err}"))?;

  conn
    .execute(
      "INSERT INTO open_tasks (task_id, was_running, accumulated_time_ms, last_updated_at)
       VALUES (?1, 1, ?2, ?3)
       ON CONFLICT(task_id) DO UPDATE SET
         was_running = 1,
         accumulated_time_ms = excluded.accumulated_time_ms,
         last_updated_at = excluded.last_updated_at",
      params![task_id, base_total_ms, task_state.1],
    )
    .map_err(|err| format!("failed to persist recovery marker: {err}"))?;

  Ok(())
}

fn load_pending_recovery(conn: &Connection) -> Result<(Option<String>, Option<i64>, Option<i64>), String> {
  let pending = conn.query_row(
    "SELECT ot.task_id, ot.accumulated_time_ms, t.total_ms
     FROM open_tasks ot
     JOIN tasks t ON t.id = ot.task_id
     WHERE ot.was_running != 0
     LIMIT 1",
    [],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, i64>(1)?,
        row.get::<_, i64>(2)?,
      ))
    },
  );

  match pending {
    Ok((task_id, base_total_ms, total_ms)) => Ok((
      Some(task_id),
      Some((total_ms - base_total_ms).max(0)),
      Some(base_total_ms),
    )),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok((None, None, None)),
    Err(err) => Err(format!("failed to load pending recovery row: {err}")),
  }
}

fn load_snapshot(app: &tauri::AppHandle) -> Result<Option<PersistedSnapshot>, String> {
  let conn = open_db(app)?;
  recover_interrupted_timer(&conn)?;

  let mut project_stmt = conn
    .prepare(
      "SELECT id, name, requires_ticket, is_user_defined, created_at
       FROM projects ORDER BY name",
    )
    .map_err(|err| format!("failed to prepare project query: {err}"))?;

  let projects_iter = project_stmt
    .query_map([], |row| {
      Ok(PersistedProject {
        id: row.get(0)?,
        name: row.get(1)?,
        requires_ticket: row.get::<_, i64>(2)? != 0,
        is_user_defined: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
      })
    })
    .map_err(|err| format!("failed to load projects: {err}"))?;

  let mut projects = Vec::new();
  for project in projects_iter {
    projects.push(project.map_err(|err| format!("failed to read project row: {err}"))?);
  }

  let mut task_stmt = conn
    .prepare(
      "SELECT id, project_id, description, task_date, total_ms, ticket_number, created_at, updated_at
       FROM tasks ORDER BY task_date, updated_at",
    )
    .map_err(|err| format!("failed to prepare task query: {err}"))?;

  let tasks_iter = task_stmt
    .query_map([], |row| {
      Ok(PersistedTask {
        id: row.get(0)?,
        project_id: row.get(1)?,
        description: row.get(2)?,
        task_date: row.get(3)?,
        total_ms: row.get(4)?,
        ticket_number: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
      })
    })
    .map_err(|err| format!("failed to load tasks: {err}"))?;

  let mut tasks = Vec::new();
  for task in tasks_iter {
    tasks.push(task.map_err(|err| format!("failed to read task row: {err}"))?);
  }

  let active_timer = conn
    .query_row(
      "SELECT task_id, started_at FROM timers WHERE paused_at IS NULL LIMIT 1",
      [],
      |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    );

  let (active_timer_task_id, active_timer_started_at) = match active_timer {
    Ok((task_id, started_at)) => (Some(task_id), Some(started_at)),
    Err(rusqlite::Error::QueryReturnedNoRows) => (None, None),
    Err(err) => return Err(format!("failed to load active timer row: {err}")),
  };

  let (recovery_task_id, recovery_elapsed_ms, recovery_base_total_ms) =
    load_pending_recovery(&conn)?;

  Ok(Some(PersistedSnapshot {
    projects,
    tasks,
    active_timer_task_id,
    active_timer_started_at,
    recovery_task_id,
    recovery_elapsed_ms,
    recovery_base_total_ms,
  }))
}

fn write_snapshot(app: &tauri::AppHandle, snapshot: &PersistedSnapshot) -> Result<(), String> {
  let mut conn = open_db(app)?;
  let tx = conn
    .transaction()
    .map_err(|err| format!("failed to open sqlite transaction: {err}"))?;

  tx
    .execute("DELETE FROM open_tasks", [])
    .map_err(|err| format!("failed to clear open tasks: {err}"))?;
  tx
    .execute("DELETE FROM timers", [])
    .map_err(|err| format!("failed to clear timers: {err}"))?;
  tx
    .execute("DELETE FROM tasks", [])
    .map_err(|err| format!("failed to clear tasks: {err}"))?;
  tx
    .execute("DELETE FROM projects", [])
    .map_err(|err| format!("failed to clear projects: {err}"))?;

  for project in snapshot.projects.iter() {
    tx
      .execute(
        "INSERT INTO projects (id, name, requires_ticket, is_user_defined, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
          project.id,
          project.name,
          if project.requires_ticket { 1_i64 } else { 0_i64 },
          if project.is_user_defined { 1_i64 } else { 0_i64 },
          project.created_at,
        ],
      )
      .map_err(|err| format!("failed to insert project in transaction: {err}"))?;
  }

  for task in snapshot.tasks.iter() {
    tx
      .execute(
        "INSERT INTO tasks (id, project_id, description, task_date, total_ms, ticket_number, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
          task.id,
          task.project_id,
          task.description,
          task.task_date,
          task.total_ms,
          task.ticket_number,
          task.created_at,
          task.updated_at,
        ],
      )
      .map_err(|err| format!("failed to insert task in transaction: {err}"))?;
  }

  if let (Some(task_id), Some(started_at)) = (
    snapshot.active_timer_task_id.as_ref(),
    snapshot.active_timer_started_at,
  ) {
    let active_task = snapshot
      .tasks
      .iter()
      .find(|task| task.id == *task_id)
      .ok_or_else(|| "Active timer task not found in snapshot.".to_string())?;

    tx
      .execute(
        "INSERT INTO timers (task_id, started_at, paused_at, elapsed_ms)
         VALUES (?1, ?2, NULL, ?3)",
        params![task_id, started_at, active_task.total_ms],
      )
      .map_err(|err| format!("failed to insert active timer row: {err}"))?;

    tx
      .execute(
        "INSERT INTO open_tasks (task_id, was_running, accumulated_time_ms, last_updated_at)
         VALUES (?1, 1, ?2, ?3)",
        params![task_id, active_task.total_ms, active_task.updated_at],
      )
      .map_err(|err| format!("failed to insert open task row: {err}"))?;
  } else if let (Some(task_id), Some(base_total_ms)) = (
    snapshot.recovery_task_id.as_ref(),
    snapshot.recovery_base_total_ms,
  ) {
    let recovered_task = snapshot
      .tasks
      .iter()
      .find(|task| task.id == *task_id)
      .ok_or_else(|| "Recovery task not found in snapshot.".to_string())?;

    tx
      .execute(
        "INSERT INTO open_tasks (task_id, was_running, accumulated_time_ms, last_updated_at)
         VALUES (?1, 1, ?2, ?3)",
        params![task_id, base_total_ms, recovered_task.updated_at],
      )
      .map_err(|err| format!("failed to persist pending recovery row: {err}"))?;
  }

  tx
    .commit()
    .map_err(|err| format!("failed to commit sqlite transaction: {err}"))?;

  Ok(())
}

fn validate_task_against_snapshot(
  snapshot: &PersistedSnapshot,
  task: &PersistedTask,
  ignore_task_id: Option<&str>,
) -> Result<(), String> {
  let project = snapshot
    .projects
    .iter()
    .find(|project| project.id == task.project_id)
    .ok_or_else(|| "Selected project no longer exists.".to_string())?;

  if project.requires_ticket {
    let ticket = task.ticket_number.as_deref().unwrap_or("").trim();
    if ticket.is_empty() {
      return Err(format!("{} requires a ticket number.", project.name));
    }
  }

  let normalized = task.description.trim().to_lowercase();
  if normalized.is_empty() {
    return Err("Task description is required.".to_string());
  }

  let has_duplicate = snapshot.tasks.iter().any(|existing| {
    if let Some(ignore_id) = ignore_task_id {
      if existing.id == ignore_id {
        return false;
      }
    }

    existing.project_id == task.project_id
      && existing.task_date == task.task_date
      && existing.description.trim().to_lowercase() == normalized
  });

  if has_duplicate {
    return Err("A matching task already exists for this project and date.".to_string());
  }

  Ok(())
}

#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  let value = serde_json::to_string(&snapshot)
    .map_err(|err| format!("failed to serialize state JSON: {err}"))?;

  Ok(Some(value))
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state_json: String) -> Result<(), String> {
  let snapshot = serde_json::from_str::<PersistedSnapshot>(&state_json)
    .map_err(|err| format!("state payload is not valid JSON: {err}"))?;

  write_snapshot(&app, &snapshot)
}

#[tauri::command]
fn add_project(
  app: tauri::AppHandle,
  project: PersistedProject,
) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  let name = project.name.trim().to_lowercase();
  if name.is_empty() {
    return Err("Project name is required.".to_string());
  }

  if snapshot
    .projects
    .iter()
    .any(|existing| existing.name.trim().to_lowercase() == name)
  {
    return Err("Project already exists.".to_string());
  }

  snapshot.projects.push(project);
  write_snapshot(&app, &snapshot)?;
  Ok(snapshot)
}

#[tauri::command]
fn add_task(app: tauri::AppHandle, task: PersistedTask) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  validate_task_against_snapshot(&snapshot, &task, None)?;

  snapshot.tasks.push(task);
  write_snapshot(&app, &snapshot)?;
  Ok(snapshot)
}

#[tauri::command]
fn update_task(app: tauri::AppHandle, task: PersistedTask) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  if !snapshot.tasks.iter().any(|current| current.id == task.id) {
    return Err("Task not found.".to_string());
  }

  validate_task_against_snapshot(&snapshot, &task, Some(task.id.as_str()))?;

  snapshot.tasks = snapshot
    .tasks
    .into_iter()
    .map(|current| {
      if current.id == task.id {
        task.clone()
      } else {
        current
      }
    })
    .collect();

  write_snapshot(&app, &snapshot)?;
  Ok(snapshot)
}

#[tauri::command]
fn delete_task(app: tauri::AppHandle, task_id: String) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  snapshot.tasks.retain(|task| task.id != task_id);
  if snapshot.active_timer_task_id.as_deref() == Some(task_id.as_str()) {
    snapshot.active_timer_task_id = None;
    snapshot.active_timer_started_at = None;
  }

  write_snapshot(&app, &snapshot)?;
  Ok(snapshot)
}

#[tauri::command]
fn add_time_to_task(
  app: tauri::AppHandle,
  task_id: String,
  delta_ms: i64,
  updated_at: String,
) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;
  let safe_delta = delta_ms.max(0);

  for task in snapshot.tasks.iter_mut() {
    if task.id == task_id {
      task.total_ms += safe_delta;
      task.updated_at = updated_at.clone();
      write_snapshot(&app, &snapshot)?;
      return Ok(snapshot);
    }
  }

  Err("Task not found.".to_string())
}

#[tauri::command]
fn start_timer(
  app: tauri::AppHandle,
  task_id: String,
  started_at: i64,
  updated_at: String,
) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  if !snapshot.tasks.iter().any(|task| task.id == task_id) {
    return Err("Task not found.".to_string());
  }

  if snapshot.active_timer_task_id.as_deref() == Some(task_id.as_str()) {
    return Ok(snapshot);
  }

  if let (Some(active_task_id), Some(active_started_at)) = (
    snapshot.active_timer_task_id.clone(),
    snapshot.active_timer_started_at,
  ) {
    let elapsed = (started_at - active_started_at).max(0);
    for task in snapshot.tasks.iter_mut() {
      if task.id == active_task_id {
        task.total_ms += elapsed;
        task.updated_at = updated_at.clone();
        break;
      }
    }
  }

  snapshot.active_timer_task_id = Some(task_id.clone());
  snapshot.active_timer_started_at = Some(started_at);

  for task in snapshot.tasks.iter_mut() {
    if task.id == task_id {
      task.updated_at = updated_at.clone();
      break;
    }
  }

  write_snapshot(&app, &snapshot)?;
  Ok(snapshot)
}

#[tauri::command]
fn pause_active_timer(
  app: tauri::AppHandle,
  paused_at: i64,
  updated_at: String,
) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;

  if let (Some(active_task_id), Some(active_started_at)) = (
    snapshot.active_timer_task_id.clone(),
    snapshot.active_timer_started_at,
  ) {
    let elapsed = (paused_at - active_started_at).max(0);
    for task in snapshot.tasks.iter_mut() {
      if task.id == active_task_id {
        task.total_ms += elapsed;
        task.updated_at = updated_at.clone();
        break;
      }
    }
  }

  snapshot.active_timer_task_id = None;
  snapshot.active_timer_started_at = None;

  write_snapshot(&app, &snapshot)?;
  Ok(snapshot)
}

#[tauri::command]
fn confirm_recovery(
  app: tauri::AppHandle,
  task_id: String,
) -> Result<PersistedSnapshot, String> {
  let conn = open_db(&app)?;

  conn
    .execute("DELETE FROM open_tasks WHERE task_id = ?1", [&task_id])
    .map_err(|err| format!("failed to clear recovery marker: {err}"))?;

  load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())
}

#[tauri::command]
fn discard_recovery(
  app: tauri::AppHandle,
  task_id: String,
) -> Result<PersistedSnapshot, String> {
  let mut conn = open_db(&app)?;
  let tx = conn
    .transaction()
    .map_err(|err| format!("failed to open sqlite transaction: {err}"))?;

  let base_total_ms = tx
    .query_row(
      "SELECT accumulated_time_ms FROM open_tasks WHERE task_id = ?1 AND was_running != 0",
      [&task_id],
      |row| row.get::<_, i64>(0),
    )
    .map_err(|_| "Recovery task not found.".to_string())?;

  let updated_at = current_timestamp_iso(&tx)?;

  tx
    .execute(
      "UPDATE tasks SET total_ms = ?2, updated_at = ?3 WHERE id = ?1",
      params![task_id, base_total_ms, updated_at],
    )
    .map_err(|err| format!("failed to revert recovered task total: {err}"))?;

  tx
    .execute("DELETE FROM open_tasks WHERE task_id = ?1", [&task_id])
    .map_err(|err| format!("failed to delete recovery marker: {err}"))?;

  tx
    .commit()
    .map_err(|err| format!("failed to commit recovery rollback: {err}"))?;

  load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())
}

#[tauri::command]
fn get_project_totals(
  app: tauri::AppHandle,
  start_date: String,
  end_date: String,
) -> Result<Vec<ProjectTotal>, String> {
  if start_date > end_date {
    return Err("start date must be before or equal to end date".to_string());
  }

  let Some(snapshot) = load_snapshot(&app)? else {
    return Ok(Vec::new());
  };

  let names_by_id: HashMap<String, String> = snapshot
    .projects
    .iter()
    .map(|project| (project.id.clone(), project.name.clone()))
    .collect();

  let mut totals_by_project: HashMap<String, i64> = HashMap::new();
  for task in snapshot.tasks.iter() {
    if task.task_date >= start_date && task.task_date <= end_date {
      let entry = totals_by_project.entry(task.project_id.clone()).or_insert(0);
      *entry += task.total_ms.max(0);
    }
  }

  let mut result: Vec<ProjectTotal> = totals_by_project
    .into_iter()
    .map(|(project_id, total_ms)| {
      let project_name = names_by_id
        .get(&project_id)
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string());

      ProjectTotal {
        project_id,
        project_name,
        total_ms,
      }
    })
    .collect();

  result.sort_by(|a, b| a.project_name.cmp(&b.project_name));
  Ok(result)
}

#[tauri::command]
fn get_export_rows(
  app: tauri::AppHandle,
  start_date: String,
  end_date: String,
) -> Result<Vec<ExportRow>, String> {
  if start_date > end_date {
    return Err("start date must be before or equal to end date".to_string());
  }

  let Some(snapshot) = load_snapshot(&app)? else {
    return Ok(Vec::new());
  };

  let names_by_id: HashMap<String, String> = snapshot
    .projects
    .iter()
    .map(|project| (project.id.clone(), project.name.clone()))
    .collect();

  let mut in_range: Vec<&PersistedTask> = snapshot
    .tasks
    .iter()
    .filter(|task| task.task_date >= start_date && task.task_date <= end_date)
    .collect();

  in_range.sort_by(|a, b| {
    a.task_date
      .cmp(&b.task_date)
      .then(a.updated_at.cmp(&b.updated_at))
  });

  let mut rows: Vec<ExportRow> = in_range
    .iter()
    .map(|task| ExportRow {
      row_type: "detail".to_string(),
      date: task.task_date.clone(),
      project: names_by_id
        .get(&task.project_id)
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string()),
      description: task.description.clone(),
      ticket_number: task.ticket_number.clone().unwrap_or_default(),
      hours: format!("{:.2}", (task.total_ms.max(0) as f64) / 3_600_000.0),
    })
    .collect();

  let mut totals_by_project: HashMap<String, i64> = HashMap::new();
  for task in in_range.iter() {
    let entry = totals_by_project.entry(task.project_id.clone()).or_insert(0);
    *entry += task.total_ms.max(0);
  }

  let mut summary: Vec<ExportRow> = totals_by_project
    .into_iter()
    .map(|(project_id, total_ms)| ExportRow {
      row_type: "summary".to_string(),
      date: "".to_string(),
      project: names_by_id
        .get(&project_id)
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string()),
      description: "TOTAL".to_string(),
      ticket_number: "".to_string(),
      hours: format!("{:.2}", (total_ms.max(0) as f64) / 3_600_000.0),
    })
    .collect();

  summary.sort_by(|a, b| a.project.cmp(&b.project));
  rows.extend(summary);

  Ok(rows)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      load_state,
      save_state,
      add_project,
      add_task,
      update_task,
      delete_task,
      add_time_to_task,
      start_timer,
      pause_active_timer,
      confirm_recovery,
      discard_recovery,
      get_project_totals,
      get_export_rows
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
