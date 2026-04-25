import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;
const DB_PATH = 'sqlite:altcut.db';

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load(DB_PATH);
  }
  return dbInstance;
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

export interface TimelineClip {
  id: number;
  project_id: number;
  asset_id: number;
  track_index: number;
  track_type: 'video' | 'audio' | 'text';   // NEW
  track_lane: number;                         // NEW – stacking lane
  start_time: number;
  end_time: number;
  timeline_start: number;
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

// ─── Schema Migration ─────────────────────────────────────────
// Adds track_type and track_lane to timeline_clips if they don't exist yet

export async function runMigrations(): Promise<void> {
  const db = await getDb();
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN track_type TEXT DEFAULT 'video'`);
  } catch { /* column already exists */ }
  try {
    await db.execute(`ALTER TABLE timeline_clips ADD COLUMN track_lane INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
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

    // Default track_type for old rows that predate migration
    if (!clip.track_type) clip.track_type = 'video';
    if (clip.track_lane == null) clip.track_lane = 0;
  }

  return clips;
}

export async function addClipToTimeline(
  projectId: number,
  assetId: number,
  duration: number,
  trackType: 'video' | 'audio' | 'text' = 'video',
  trackLane = 0
): Promise<TimelineClip> {
  const db = await getDb();

  const existing = await getTimelineClips(projectId);
  // Find the last clip on the same track type + lane
  const sameLane = existing.filter(c => c.track_type === trackType && c.track_lane === trackLane);
  let newTimelineStart = 0;
  let newTrackIndex = sameLane.length;

  if (sameLane.length > 0) {
    const last = sameLane[sameLane.length - 1];
    newTimelineStart = last.timeline_start + (last.end_time - last.start_time);
    newTrackIndex = last.track_index + 1;
  } else {
    // Give a unique track_index across all types
    newTrackIndex = existing.length;
  }

  const { lastInsertId } = await db.execute(
    `INSERT INTO timeline_clips
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [projectId, assetId, newTrackIndex, trackType, trackLane, 0, duration, newTimelineStart]
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
  timelineStart: number
): Promise<TimelineClip> {
  const db = await getDb();
  
  // Find a track_index. Just max + 1.
  const existing = await getTimelineClips(projectId);
  const newTrackIndex = existing.length;

  const { lastInsertId } = await db.execute(
    `INSERT INTO timeline_clips
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [projectId, assetId, newTrackIndex, trackType, trackLane, 0, duration, timelineStart]
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

export async function splitClip(
  clipId: number,
  splitAtSeconds: number // absolute video time of the split point
): Promise<void> {
  const db = await getDb();

  const rows = await db.select<TimelineClip[]>(
    `SELECT c.*, a.file_path, a.type
     FROM timeline_clips c JOIN assets a ON c.asset_id = a.id
     WHERE c.id = $1`, [clipId]
  );
  if (!rows.length) throw new Error('Clip not found');
  const clip = rows[0];

  // The split point in clip-local time
  const clipDuration = clip.end_time - clip.start_time;
  const splitLocalTime = splitAtSeconds - clip.timeline_start; // offset into clip

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
       (project_id, asset_id, track_index, track_type, track_lane, start_time, end_time, timeline_start)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      clip.project_id,
      clip.asset_id,
      clip.track_index + 1,
      (clip as any).track_type || 'video',
      (clip as any).track_lane || 0,
      absStartTime,
      clip.end_time,
      clip.timeline_start + splitLocalTime,
    ]
  );
}

export async function deleteTimelineClip(clipId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM timeline_clips WHERE id = $1', [clipId]);
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
