CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    type TEXT NOT NULL, -- 'video', 'image', 'audio'
    duration REAL,
    status TEXT DEFAULT 'raw', -- 'raw', 'processing', 'ready'
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timeline_clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    track_index INTEGER DEFAULT 0,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    timeline_start REAL NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clip_id INTEGER NOT NULL,
    feature_type TEXT NOT NULL, -- 'captions', 'jumpcut', 'noise_removal'
    json_data TEXT,
    status TEXT DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
    FOREIGN KEY(clip_id) REFERENCES timeline_clips(id) ON DELETE CASCADE
);

-- Insert a default project to get started
INSERT INTO projects (name) VALUES ('Default Project');
