use std::fs;
use std::path::PathBuf;
use tauri::Manager;

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
    .invoke_handler(tauri::generate_handler![load_state, save_state])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
