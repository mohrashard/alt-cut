// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

fn find_python(root: &PathBuf) -> PathBuf {
    let win = root.join("backend_env").join("Scripts").join("python.exe");
    if win.exists() { win } else { root.join("backend_env").join("bin").join("python") }
}


#[derive(Serialize)]
struct AiJobResult {
    output_path: String,
    stdout: String,
}

// ──────────────────────────────────────────────────────────────
// greet (test command)
// ──────────────────────────────────────────────────────────────
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ──────────────────────────────────────────────────────────────
// run_ai_job  — runs caption_engine.py with a specific step
// Returns AiJobResult { output_path (absolute), stdout }
// ──────────────────────────────────────────────────────────────
#[tauri::command]
async fn run_ai_job(file_path: String, step: String, output_path: String) -> Result<AiJobResult, String> {
    use tokio::process::Command;

    let root = project_root();
    let python = find_python(&root);
    let script = root.join("ai_backend").join("caption_engine.py");

    // Resolve output_path to absolute (relative → project root)
    let abs_output = if std::path::Path::new(&output_path).is_absolute() {
        PathBuf::from(&output_path)
    } else {
        root.join(&output_path)
    };

    let abs_output_str = abs_output.to_string_lossy().to_string();

    let mut cmd = Command::new(&python);
    cmd.arg(&script)
        .arg(&file_path)
        .arg("--step")
        .arg(&step)
        .env("PYTHONIOENCODING", "utf-8")
        .current_dir(&root);

    if step == "captions" {
        cmd.arg("--output-json").arg(&abs_output_str);
    } else if step == "denoise" || step == "jumpcut" {
        cmd.arg("--output-media").arg(&abs_output_str);
    }

    println!("🐍 Running: python {} {} --step {} → {}", script.display(), file_path, step, abs_output_str);

    let output = cmd.output().await.map_err(|e| format!("Failed to spawn Python: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("📜 Python stdout:\n{}", stdout);
    if !stderr.is_empty() {
        eprintln!("⚠️ Python stderr:\n{}", stderr);
    }

    if output.status.success() {
        // Verify the output file actually exists
        if !abs_output.exists() {
            return Err(format!(
                "Python finished OK but output file not found at: {}\nStdout: {}\nStderr: {}",
                abs_output_str, stdout, stderr
            ));
        }
        println!("✅ AI job '{}' done → {}", step, abs_output_str);
        Ok(AiJobResult {
            output_path: abs_output_str,
            stdout,
        })
    } else {
        Err(format!("Python pipeline error (exit {:?}):\nSTDOUT:\n{}\nSTDERR:\n{}", output.status.code(), stdout, stderr))
    }
}

// ──────────────────────────────────────────────────────────────
// load_captions_file — reads a JSON file, returns raw string
// ──────────────────────────────────────────────────────────────
#[tauri::command]
fn load_captions_file(path: String) -> Result<String, String> {
    use std::fs;

    // Accept both absolute and relative paths
    let p = PathBuf::from(&path);
    let resolved = if p.is_absolute() { p } else { project_root().join(&path) };

    println!("📂 load_captions_file: {:?}", resolved);
    fs::read_to_string(&resolved).map_err(|e| format!("Cannot read {}: {}", resolved.display(), e))
}

// ──────────────────────────────────────────────────────────────
// get_processed_path — reads render_intent.txt
// ──────────────────────────────────────────────────────────────
#[tauri::command]
fn get_processed_path() -> Result<String, String> {
    use std::fs;
    let p = project_root().join("render_intent.txt");
    fs::read_to_string(&p)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Cannot read render_intent.txt: {}", e))
}

// ──────────────────────────────────────────────────────────────
// get_video_duration — uses ffprobe
// ──────────────────────────────────────────────────────────────
#[tauri::command]
async fn get_video_duration(video_path: String) -> Result<f64, String> {
    use tokio::process::Command;

    let output = Command::new("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration",
               "-of", "default=noprint_wrappers=1:nokey=1", &video_path])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if output.status.success() {
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        s.parse::<f64>().map_err(|e| format!("Invalid duration '{}': {}", s, e))
    } else {
        Err(format!("ffprobe error: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

// ──────────────────────────────────────────────────────────────
// update_asset_path — updates assets.file_path in SQLite
// (called after denoise so preview switches to the clean video)
// ──────────────────────────────────────────────────────────────
#[tauri::command]
async fn update_asset_path(asset_id: i64, new_path: String) -> Result<(), String> {
    use std::path::Path;
    // We can't call the SQLite plugin from Rust (it's managed by the JS plugin).
    // Return OK — the frontend JS handles the DB update directly via tauri-plugin-sql.
    // This command exists as a no-op hook in case we need server-side validation.
    println!("🔄 update_asset_path called: asset={} path={}", asset_id, new_path);
    if !Path::new(&new_path).exists() {
        return Err(format!("File does not exist: {}", new_path));
    }
    Ok(())
}

// ──────────────────────────────────────────────────────────────
// run_render_pipeline — full export via Remotion
// ──────────────────────────────────────────────────────────────
#[tauri::command]
async fn run_render_pipeline(payload_json: String) -> Result<String, String> {
    use tokio::process::Command;

    let root = project_root();
    
    // Write payload to render_props.json
    let props_path = root.join("render_props.json");
    if let Err(e) = std::fs::write(&props_path, &payload_json) {
        return Err(format!("Failed to write render_props.json: {}", e));
    }

    println!("🎬 Starting Remotion Export...");

    let mut remotion = Command::new("cmd");
    remotion.arg("/C").arg("npx").arg("remotion").arg("render")
        .arg("src/remotion/index.ts").arg("CaptionsComp")
        .arg("final_export.mp4")
        .arg(format!("--props={}", props_path.display()))
        .current_dir(&root);

    let ro = remotion.output().await.map_err(|e| e.to_string())?;
    
    if ro.status.success() {
        println!("✅ Export complete: final_export.mp4");
        Ok("Export complete: final_export.mp4".to_string())
    } else {
        Err(format!("Remotion error: {}", String::from_utf8_lossy(&ro.stderr)))
    }
}

// ──────────────────────────────────────────────────────────────
// run_pipeline — legacy background run (kept for compat)
// ──────────────────────────────────────────────────────────────
#[tauri::command]
fn run_pipeline(video_path: String) -> Result<(), String> {
    use std::process::Command;
    let root = project_root();
    let python = find_python(&root);
    let script = root.join("ai_backend").join("caption_engine.py");

    tauri::async_runtime::spawn(async move {
        let res = Command::new(&python)
            .env("PYTHONIOENCODING", "utf-8")
            .current_dir(&root)
            .arg(&script)
            .arg(&video_path)
            .spawn();
        match res {
            Ok(mut child) => { let _ = child.wait(); }
            Err(e) => { eprintln!("❌ run_pipeline spawn error: {}", e); }
        }
    });
    Ok(())
}

// ──────────────────────────────────────────────────────────────
// App entry point
// ──────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_init.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:altcut.db", migrations).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            run_render_pipeline,
            run_pipeline,
            load_captions_file,
            get_processed_path,
            get_video_duration,
            run_ai_job,
            update_asset_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
