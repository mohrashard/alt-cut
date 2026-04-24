import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

// The database path should match the one defined in lib.rs
const DB_PATH = 'sqlite:altcut.db';

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load(DB_PATH);
  }
  return dbInstance;
}

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

export async function getProjects(): Promise<Project[]> {
  const db = await getDb();
  return db.select('SELECT * FROM projects ORDER BY updated_at DESC');
}

export async function ensureDefaultProject(): Promise<Project> {
  const projects = await getProjects();
  if (projects.length > 0) {
    return projects[0];
  }
  
  const db = await getDb();
  const { lastInsertId } = await db.execute('INSERT INTO projects (name) VALUES ($1)', ['Default Project']);
  
  const newProjects = await db.select<Project[]>('SELECT * FROM projects WHERE id = $1', [lastInsertId]);
  return newProjects[0];
}

export async function addAsset(projectId: number, filePath: string, type: string, duration: number = 0): Promise<Asset> {
  const db = await getDb();
  
  // Check if asset already exists for this project and path
  const existing = await db.select<Asset[]>('SELECT * FROM assets WHERE project_id = $1 AND file_path = $2', [projectId, filePath]);
  
  if (existing.length > 0) {
    const asset = existing[0];
    // If existing asset has no duration but we now have one, update it
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
  
  // Try to get by lastInsertId
  let assets = await db.select<Asset[]>('SELECT * FROM assets WHERE id = $1', [lastInsertId]);
  
  // Fallback: search by file_path and project_id
  if (assets.length === 0) {
    assets = await db.select<Asset[]>('SELECT * FROM assets WHERE project_id = $1 AND file_path = $2 ORDER BY id DESC LIMIT 1', [projectId, filePath]);
  }
  
  return assets[0];
}

export async function getProjectAssets(projectId: number): Promise<Asset[]> {
  const db = await getDb();
  return db.select('SELECT * FROM assets WHERE project_id = $1 ORDER BY id DESC', [projectId]);
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
  start_time: number;
  end_time: number;
  timeline_start: number;
  // joined fields
  file_path?: string;
  type?: string;
  ai_metadata?: Record<string, AiMetadata>;
}

export async function getTimelineClips(projectId: number): Promise<TimelineClip[]> {
  const db = await getDb();
  // Join with assets to get file path and type
  const query = `
    SELECT c.*, a.file_path, a.type 
    FROM timeline_clips c
    JOIN assets a ON c.asset_id = a.id
    WHERE c.project_id = $1
    ORDER BY c.track_index ASC
  `;
  const clips = await db.select<TimelineClip[]>(query, [projectId]);
  
  // Attach AI Metadata to each clip
  for (const clip of clips) {
    const metaQuery = `SELECT * FROM ai_metadata WHERE clip_id = $1`;
    const metas = await db.select<AiMetadata[]>(metaQuery, [clip.id]);
    clip.ai_metadata = {};
    for (const m of metas) {
      clip.ai_metadata[m.feature_type] = m;
    }
  }
  
  return clips;
}

export async function addClipToTimeline(projectId: number, assetId: number, duration: number): Promise<TimelineClip> {
  const db = await getDb();
  
  // Find the current max track_index and timeline_start
  const existing = await getTimelineClips(projectId);
  let newTrackIndex = 0;
  let newTimelineStart = 0;
  
  if (existing.length > 0) {
    const lastClip = existing[existing.length - 1];
    newTrackIndex = lastClip.track_index + 1;
    newTimelineStart = lastClip.timeline_start + (lastClip.end_time - lastClip.start_time);
  }

  const { lastInsertId } = await db.execute(
    'INSERT INTO timeline_clips (project_id, asset_id, track_index, start_time, end_time, timeline_start) VALUES ($1, $2, $3, $4, $5, $6)',
    [projectId, assetId, newTrackIndex, 0, duration, newTimelineStart]
  );
  
  const query = `
    SELECT c.*, a.file_path, a.type 
    FROM timeline_clips c
    JOIN assets a ON c.asset_id = a.id
    WHERE c.id = $1
  `;
  const clips = await db.select<TimelineClip[]>(query, [lastInsertId]);
  return clips[0];
}

export async function updateTimelineOrder(clips: TimelineClip[]): Promise<void> {
  const db = await getDb();
  let currentStart = 0;
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const duration = clip.end_time - clip.start_time;
    
    await db.execute(
      'UPDATE timeline_clips SET track_index = $1, timeline_start = $2 WHERE id = $3',
      [i, currentStart, clip.id]
    );
    
    currentStart += duration;
  }
}

export async function deleteTimelineClip(clipId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM timeline_clips WHERE id = $1', [clipId]);
}

export async function upsertAiMetadata(clipId: number, featureType: string, status: string, jsonData: string | null = null): Promise<void> {
  const db = await getDb();
  
  // check if exists
  const existing = await db.select<AiMetadata[]>('SELECT * FROM ai_metadata WHERE clip_id = $1 AND feature_type = $2', [clipId, featureType]);
  
  if (existing.length > 0) {
    await db.execute('UPDATE ai_metadata SET status = $1, json_data = $2 WHERE id = $3', [status, jsonData, existing[0].id]);
  } else {
    await db.execute('INSERT INTO ai_metadata (clip_id, feature_type, status, json_data) VALUES ($1, $2, $3, $4)', [clipId, featureType, status, jsonData]);
  }
}

// Update the file_path of an asset (e.g. after denoise, point to the clean video)
export async function updateAssetFilePath(assetId: number, newPath: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE assets SET file_path = $1 WHERE id = $2', [newPath, assetId]);
}
