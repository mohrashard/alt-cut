import Database from '@tauri-apps/plugin-sql';

async function debugDb() {
  try {
    const db = await Database.load('sqlite:altcut.db');
    console.log("DB Loaded");
    
    const projects = await db.select('SELECT * FROM projects');
    console.log("Projects:", projects);
    
    const assets = await db.select('SELECT * FROM assets');
    console.log("Assets:", assets);
    
    const clips = await db.select('SELECT * FROM timeline_clips');
    console.log("Clips:", clips);
  } catch (err) {
    console.error("DB Debug Error:", err);
  }
}

// @ts-ignore
window.debugDb = debugDb;
