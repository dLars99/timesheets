use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;

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

fn load_snapshot(app: &tauri::AppHandle) -> Result<Option<PersistedSnapshot>, String> {
  let path = state_file_path(app)?;
  if !path.exists() {
    return Ok(None);
  }

  let value = fs::read_to_string(path)
    .map_err(|err| format!("failed to read state file: {err}"))?;

  let snapshot: PersistedSnapshot = serde_json::from_str(&value)
    .map_err(|err| format!("failed to parse state file JSON: {err}"))?;

  Ok(Some(snapshot))
}

fn write_snapshot(app: &tauri::AppHandle, snapshot: &PersistedSnapshot) -> Result<(), String> {
  let path = state_file_path(app)?;
  let payload = serde_json::to_string(snapshot)
    .map_err(|err| format!("failed to serialize snapshot JSON: {err}"))?;

  fs::write(path, payload)
    .map_err(|err| format!("failed to write state file: {err}"))?;

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

fn state_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let app_dir = app
    .path()
    .app_data_dir()
    .map_err(|err| format!("failed to resolve app data dir: {err}"))?;

  fs::create_dir_all(&app_dir)
    .map_err(|err| format!("failed to create app data dir: {err}"))?;

  Ok(app_dir.join("timesheets-state.json"))
}

#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let path = state_file_path(&app)?;
  if !path.exists() {
    return Ok(None);
  }

  let value = fs::read_to_string(path)
    .map_err(|err| format!("failed to read state file: {err}"))?;

  Ok(Some(value))
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state_json: String) -> Result<(), String> {
  serde_json::from_str::<serde_json::Value>(&state_json)
    .map_err(|err| format!("state payload is not valid JSON: {err}"))?;

  let path = state_file_path(&app)?;
  fs::write(path, state_json)
    .map_err(|err| format!("failed to write state file: {err}"))?;

  Ok(())
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
) -> Result<PersistedSnapshot, String> {
  let mut snapshot = load_snapshot(&app)?.ok_or_else(|| "No state found on disk.".to_string())?;
  let safe_delta = delta_ms.max(0);

  for task in snapshot.tasks.iter_mut() {
    if task.id == task_id {
      task.total_ms += safe_delta;
      write_snapshot(&app, &snapshot)?;
      return Ok(snapshot);
    }
  }

  Err("Task not found.".to_string())
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
      get_project_totals,
      get_export_rows
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
