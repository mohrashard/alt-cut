import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;
const DB_PATH = 'sqlite:altcut.db';

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load(DB_PATH);
  }
  return dbInstance;
}

export interface ClipEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  sharpen: number;
}

export interface CaptionStyle {
  preset: string;          // e.g. 'hormozi', 'karaoke', 'custom'
  fontFamily: string;
  fontSize: number;
  color: string;           // active/highlight word color
  strokeColor: string;
  strokeWidth: number;
  glowColor: string;
  glowSize: number;        // 0 = off
  bgColor: string;         // 'transparent' or a CSS color
  bgOpacity: number;       // 0–1
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  highlightColor: string;  // color applied to the currently-spoken word
  animation: 'pop' | 'fade' | 'none';
}

export interface Transition {
  id: number;
  track_id: number;
  clip_a_id: number;
  clip_b_id: number;
  type: "ink" | "wipe" | "shutter";
  duration_frames: number;
  created_at: string;
}

// ─── Interfaces ───────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: number;
  project_id: number;
  file_path: string;
  type: string;
  duration: number;
  status: string;
}

export interface AiMetadata {
  id: number;
  clip_id: number;
  feature_type: string;
  json_data: string | null;
  status: string;
}

export interface Marker {
  id: number;
  project_id: number;
  time_seconds: number;
  label: string;
  color: string;
}

export interface TimelineClip {
  id: number;
  project_id: number;
  asset_id: number;
  track_index: number;
  track_type: 'video' | 'audio' | 'text';
  track_lane: number;
  start_time: number;
  end_time: number;
  timeline_start: number;
  audio_enabled: number;                     // 0 for muted, 1 for enabled
  audio_volume: number;                      // 1.0 is default, 0.0 is silent, >1.0 is gain
  hidden: number;                            // 0 for visible, 1 for hidden
  audio_separated?: number;
  paired_audio_clip_id?: number | null;
  effects?: string;
  caption_style?: string | null;     // JSON-serialised CaptionStyle; null = use preset default
  // joined from assets
  file_path?: string;
  type?: string;
  ai_metadata?: Record<string, AiMetadata>;
}

// ─── Projects ─────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const db = await getDb();
  return db.select('SELECT * FROM projects ORDER BY updated_at DESC');
}

export async function ensureDefaultProject(): Promise<Project> {
  const projects = await getProjects();
  if (projects.length > 0) return projects[0];

  const db = await getDb();
  const { lastInsertId } = await db.execute(
    'INSERT INTO projects (name) VALUES ($1)', ['Default Project']
  );
  const rows = await db.select<Project[]>('SELECT * FROM projects WHERE id = $1', [lastInsertId]);
  return rows[0];
}

// ─── Assets ───────────────────────────────────────────────────

export async function addAsset(
  projectId: number, filePath: string, type: string, duration = 0
): Promise<Asset> {
  const db = await getDb();
  const existing = await db.select<Asset[]>(
    'SELECT * FROM assets WHERE project_id = $1 AND file_path = $2', [projectId, filePath]
  );

  if (existing.length > 0) {
    const asset = existing[0];
    if ((!asset.duration || asset.duration <= 0) && duration > 0) {
      await db.execute('UPDATE assets SET duration = $1 WHERE id = $2', [duration, asset.id]);
      asset.duration = duration;
    }
    return asset;
  }

  const { lastInsertId } = await db.execute(
    'INSERT INTO assets (project_id, file_path, type, duration) VALUES ($1, $2, $3, $4)',
    [projectId, filePath, type, duration]
  );

  let assets = await db.select<Asset[]>('SELECT * FROM assets WHERE id = $1', [lastInsertId]);
  if (assets.length === 0) {
    assets = await db.select<Asset[]>(
      'SELECT * FROM assets WHERE project_id = $1 AND file_path = $2 ORDER BY id DESC LIMIT 1',
      [projectId, filePath]
    );
  }
  return assets[0];
}

export async function getProjectAssets(projectId: number): Promise<Asset[]> {
  const db = await getDb();
  return db.select('SELECT * FROM assets WHERE project_id = $1 ORDER BY id DESC', [projectId]);
}

export async function updateAssetFilePath(assetId: number, newPath: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE assets SET file_path = $1 WHERE id = $2', [newPath, assetId]);
}

export async function replaceClipAsset(clipId: number, newAssetId: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE timeline_clips SET asset_id = $1 WHERE id = $2', [newAssetId, clipId]);
}

// ─── Schema Migration ─────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  const db = await getDb();
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN track_type TEXT DEFAULT 'video'`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN track_lane INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN audio_enabled INTEGER DEFAULT 1`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN hidden INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN audio_volume REAL DEFAULT 1.0`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN audio_separated INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN paired_audio_clip_id INTEGER`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN effects TEXT DEFAULT '{}'`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN caption_style TEXT DEFAULT '{}'`);
  } catch { /* column already exists */ }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      clip_a_id INTEGER NOT NULL,
      clip_b_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      duration_frames INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Markers table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS markers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      time_seconds REAL NOT NULL,
      label TEXT DEFAULT '',
      color TEXT DEFAULT '#7c5cfc',
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);
}

// ─── Timeline Clips ───────────────────────────────────────────

export async function getTimelineClips(projectId: number): Promise<TimelineClip[]> {
  const db = await getDb();
  const query = `
    SELECT c.*, a.file_path, a.type
    FROM timeline_clips c
    JOIN assets a ON c.asset_id = a.id
    WHERE c.project_id = $1
    ORDER BY c.track_type ASC, c.track_lane ASC, c.timeline_start ASC
  `;
  const clips = await db.select<TimelineClip[]>(query, [projectId]);

  for (const clip of clips) {
    const metas = await db.select<AiMetadata[]>(
      'SELECT * FROM ai_metadata WHERE clip_id = $1', [clip.id]
    );
    clip.ai_metadata = {};
    for (const m of metas) clip.ai_metadata[m.feature_type] = m;

    // Default fallbacks for old rows
    if (!clip.track_type) clip.track_type = 'video';
    if (clip.track_lane == null) clip.track_lane = 0;
    if (clip.audio_enabled == null) clip.audio_enabled = 1;
    if (clip.audio_volume == null) clip.audio_volume = 1.0;
    if (clip.hidden == null) clip.hidden = 0;
  }

  return clips;
}

export async function addClipToTimeline(
  projectId: number,
  assetId: number,
  duration: number,
  trackType: 'video' | 'audio' | 'text' = 'video',
  trackLane = 0,
  audioEnabled = 1,
  audioVolume = 1.0,
  hidden = 0
): Promise<TimelineClip> {
  const db = await getDb();

  const existing = await getTimelineClips(projectId);
  const sameLane = existing.filter(c => c.track_type === trackType && c.track_lane === trackLane);
  let newTimelineStart = 0;
  let newTrackIndex = sameLane.length;

  if (sameLane.length > 0) {
    const last = sameLane[sameLane.length - 1];
    newTimelineStart = last.timeline_start + (last.end_time - last.start_time);
    newTrackIndex = last.track_index + 1;
  } else {
    newTrackIndex = existing.length;
  }

  const { lastInsertId } = await db.execute(
    `INSERT INTO timeline_clips
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start, audio_enabled, audio_volume, hidden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [projectId, assetId, newTrackIndex, trackType, trackLane, 0, duration, newTimelineStart, audioEnabled, audioVolume, hidden]
  );

  const query = `
    SELECT c.*, a.file_path, a.type
    FROM timeline_clips c
    JOIN assets a ON c.asset_id = a.id
    WHERE c.id = $1
  `;
  const clips = await db.select<TimelineClip[]>(query, [lastInsertId]);
  const clip = clips[0];
  clip.ai_metadata = {};
  if (!clip.track_type) clip.track_type = trackType;
  if (clip.track_lane == null) clip.track_lane = trackLane;
  return clip;
}

export async function addClipToTimelineSpecific(
  projectId: number,
  assetId: number,
  duration: number,
  trackType: 'video' | 'audio' | 'text',
  trackLane: number,
  timelineStart: number,
  audioEnabled = 1,
  audioVolume = 1.0,
  hidden = 0
): Promise<TimelineClip> {
  const db = await getDb();

  const existing = await getTimelineClips(projectId);
  const newTrackIndex = existing.length;

  const { lastInsertId } = await db.execute(
    `INSERT INTO timeline_clips
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start, audio_enabled, audio_volume, hidden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [projectId, assetId, newTrackIndex, trackType, trackLane, 0, duration, timelineStart, audioEnabled, audioVolume, hidden]
  );

  const query = `
    SELECT c.*, a.file_path, a.type
    FROM timeline_clips c
    JOIN assets a ON c.asset_id = a.id
    WHERE c.id = $1
  `;
  const clips = await db.select<TimelineClip[]>(query, [lastInsertId]);
  const clip = clips[0];
  clip.ai_metadata = {};
  if (!clip.track_type) clip.track_type = trackType;
  if (clip.track_lane == null) clip.track_lane = trackLane;
  return clip;
}

export async function updateClipTime(
  clipId: number,
  startTime: number,
  endTime: number,
  timelineStart: number
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE timeline_clips SET start_time=$1, end_time=$2, timeline_start=$3 WHERE id=$4',
    [startTime, endTime, timelineStart, clipId]
  );
}

export async function setClipHidden(clipId: number, hidden: boolean): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE timeline_clips SET hidden=$1 WHERE id=$2', [hidden ? 1 : 0, clipId]);
}

export async function updateClipEffects(clipId: number, effects: ClipEffects): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE timeline_clips SET effects=$1 WHERE id=$2', [JSON.stringify(effects), clipId]);
}

export async function updateCaptionStyle(clipId: number, style: CaptionStyle): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE timeline_clips SET caption_style=$1 WHERE id=$2', [JSON.stringify(style), clipId]);
}

export async function setAudioVolume(clipId: number, volume: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE timeline_clips SET audio_volume=$1 WHERE id=$2', [volume, clipId]);
}

export async function splitClip(
  clipId: number,
  splitAtSeconds: number
): Promise<void> {
  const db = await getDb();

  const rows = await db.select<TimelineClip[]>(
    `SELECT c.*, a.file_path, a.type
     FROM timeline_clips c JOIN assets a ON c.asset_id = a.id
     WHERE c.id = $1`, [clipId]
  );
  if (!rows.length) throw new Error('Clip not found');
  const clip = rows[0];

  const clipDuration = clip.end_time - clip.start_time;
  const splitLocalTime = splitAtSeconds - clip.timeline_start;

  if (splitLocalTime <= 0 || splitLocalTime >= clipDuration) {
    throw new Error('Split point is outside clip bounds');
  }

  const absStartTime = clip.start_time + splitLocalTime;

  // Shrink the original clip (Part A)
  await db.execute(
    'UPDATE timeline_clips SET end_time=$1 WHERE id=$2',
    [absStartTime, clipId]
  );

  // Insert Part B immediately after Part A
  await db.execute(
    `INSERT INTO timeline_clips
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start, audio_enabled, audio_volume, hidden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      clip.project_id,
      clip.asset_id,
      clip.track_index + 1,
      (clip as any).track_type || 'video',
      (clip as any).track_lane || 0,
      absStartTime,
      clip.end_time,
      clip.timeline_start + splitLocalTime,
      clip.audio_enabled ?? 1,
      clip.audio_volume ?? 1.0,
      clip.hidden ?? 0,
    ]
  );
}

export async function deleteTimelineClip(clipId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM timeline_clips WHERE id = $1', [clipId]);
}

export async function clearTimelineClips(projectId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM timeline_clips WHERE project_id = $1', [projectId]);
}

export async function clearTextClips(projectId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM timeline_clips WHERE project_id = $1 AND track_type = $2', [projectId, 'text']);
}

export async function updateTimelineOrder(clips: TimelineClip[]): Promise<void> {
  const db = await getDb();
  let currentStart = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const duration = clip.end_time - clip.start_time;
    await db.execute(
      'UPDATE timeline_clips SET track_index=$1, timeline_start=$2 WHERE id=$3',
      [i, currentStart, clip.id]
    );
    currentStart += duration;
  }
}

// ─── AI Metadata ──────────────────────────────────────────────

export async function upsertAiMetadata(
  clipId: number, featureType: string, status: string, jsonData: string | null = null
): Promise<void> {
  const db = await getDb();
  const existing = await db.select<AiMetadata[]>(
    'SELECT * FROM ai_metadata WHERE clip_id=$1 AND feature_type=$2', [clipId, featureType]
  );
  if (existing.length > 0) {
    await db.execute(
      'UPDATE ai_metadata SET status=$1, json_data=$2 WHERE id=$3',
      [status, jsonData, existing[0].id]
    );
  } else {
    await db.execute(
      'INSERT INTO ai_metadata (clip_id, feature_type, status, json_data) VALUES ($1,$2,$3,$4)',
      [clipId, featureType, status, jsonData]
    );
  }
}

// ─── Undo / Redo ──────────────────────────────────────────────
export async function restoreTimelineClips(
  projectId: number,
  clips: TimelineClip[]
): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM timeline_clips WHERE project_id = $1', [projectId]);
  for (const clip of clips) {
    await db.execute(
      `INSERT OR REPLACE INTO timeline_clips
         (id, project_id, asset_id, track_index, track_type, track_lane,
          start_time, end_time, timeline_start, audio_enabled, audio_volume, hidden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        clip.id, clip.project_id, clip.asset_id, clip.track_index,
        clip.track_type || 'video', clip.track_lane ?? 0,
        clip.start_time, clip.end_time, clip.timeline_start,
        clip.audio_enabled ?? 1, clip.audio_volume ?? 1.0, clip.hidden ?? 0,
      ]
    );
  }
}

export async function extractAudio(clipId: number): Promise<void> {
  const db = await getDb();
  const clips = await db.select<TimelineClip[]>(
    'SELECT * FROM timeline_clips WHERE id = $1', [clipId]
  );
  if (!clips.length) return;
  const clip = clips[0];

  // Mute original video
  await db.execute('UPDATE timeline_clips SET audio_enabled = 0 WHERE id = $1', [clipId]);

  // Create detached audio clip
  await db.execute(
    `INSERT INTO timeline_clips 
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start, audio_enabled, audio_volume, hidden)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      clip.project_id, clip.asset_id, clip.track_index, 'audio', 0,
      clip.start_time, clip.end_time, clip.timeline_start, 1, 1.0, 0
    ]
  );
}

export async function setAudioEnabled(clipId: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE timeline_clips SET audio_enabled = $1 WHERE id = $2', [enabled ? 1 : 0, clipId]);
}

// ─── Markers ──────────────────────────────────────────────────

export async function addMarker(
  projectId: number,
  timeSeconds: number,
  label = '',
  color = '#7c5cfc'
): Promise<Marker> {
  const db = await getDb();
  const { lastInsertId } = await db.execute(
    'INSERT INTO markers (project_id, time_seconds, label, color) VALUES ($1,$2,$3,$4)',
    [projectId, timeSeconds, label, color]
  );
  const rows = await db.select<Marker[]>('SELECT * FROM markers WHERE id = $1', [lastInsertId]);
  if (!rows.length) throw new Error(`addMarker: inserted row not found (id=${lastInsertId})`);
  return rows[0];
}

export async function getMarkers(projectId: number): Promise<Marker[]> {
  const db = await getDb();
  return db.select<Marker[]>(
    'SELECT * FROM markers WHERE project_id = $1 ORDER BY time_seconds ASC',
    [projectId]
  );
}

export async function updateMarkerTime(markerId: number, timeSeconds: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE markers SET time_seconds = $1 WHERE id = $2', [timeSeconds, markerId]);
}

export async function deleteMarker(markerId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM markers WHERE id = $1', [markerId]);
}

export async function clearMarkers(projectId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM markers WHERE project_id = $1', [projectId]);
}

export async function setAudioSeparated(
  clipId: number,
  separated: boolean,
  pairedAudioClipId: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE timeline_clips
        SET audio_separated      = $1,
            paired_audio_clip_id = $2
      WHERE id = $3`,
    [separated ? 1 : 0, pairedAudioClipId, clipId],
  );
}

// ─── Transitions ──────────────────────────────────────────────

export async function getAllTransitions(): Promise<Transition[]> {
  const db = await getDb();
  return db.select<Transition[]>('SELECT * FROM transitions');
}

export async function upsertTransition(transition: Omit<Transition, 'id' | 'created_at'>): Promise<void> {
  const db = await getDb();
  const existing = await db.select<Transition[]>(
    'SELECT * FROM transitions WHERE clip_a_id = $1 AND clip_b_id = $2',
    [transition.clip_a_id, transition.clip_b_id]
  );

  if (existing.length > 0) {
    await db.execute(
      'UPDATE transitions SET type = $1, duration_frames = $2 WHERE id = $3',
      [transition.type, transition.duration_frames, existing[0].id]
    );
  } else {
    await db.execute(
      'INSERT INTO transitions (track_id, clip_a_id, clip_b_id, type, duration_frames) VALUES ($1, $2, $3, $4, $5)',
      [transition.track_id, transition.clip_a_id, transition.clip_b_id, transition.type, transition.duration_frames]
    );
  }
}

export async function deleteTransition(clipAId: number, clipBId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'DELETE FROM transitions WHERE clip_a_id = $1 AND clip_b_id = $2',
    [clipAId, clipBId]
  );
}