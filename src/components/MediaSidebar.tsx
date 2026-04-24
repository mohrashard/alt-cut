import { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useDraggable } from '@dnd-kit/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getProjectAssets, addAsset, Asset } from '../lib/db';

interface MediaSidebarProps {
  projectId?: number;
  onMediaSelected: (path: string) => void;
  onMediaAdded: (path: string) => void;
}

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

export function MediaSidebar({ projectId, onMediaSelected, onMediaAdded }: MediaSidebarProps) {
  const [mediaItems, setMediaItems] = useState<Asset[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeNav, setActiveNav] = useState('media');

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    if (projectId) {
      getProjectAssets(projectId).then(setMediaItems).catch(console.error);
    }
  }, [projectId]);

  const getVideoDurationBrowser = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => resolve(0);
      video.src = url;
    });

  const handleImport = async () => {
    try {
      if (!(window as any).__TAURI_INTERNALS__) {
        alert('Native file picker is only available in the desktop app.');
        return;
      }
      const file = await open({
        multiple: false,
        filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'png', 'jpg'] }],
      });
      if (file && projectId) {
        const filePath = typeof file === 'string' ? file : (file as any).path || (Array.isArray(file) ? file[0] : null);
        if (!filePath) return;

        let duration = 0;
        try {
          const result = await invoke<any>('get_video_duration', { videoPath: filePath });
          duration = parseFloat(result);
        } catch {}

        if (isNaN(duration) || duration <= 0) {
          try { duration = await getVideoDurationBrowser(convertFileSrc(filePath)); } catch {}
        }
        if (isNaN(duration) || duration <= 0) duration = 5.0;

        const newAsset = await addAsset(projectId, filePath, 'video', duration);
        setMediaItems(prev => [newAsset, ...prev]);
        onMediaAdded(filePath);
      }
    } catch (e) {
      alert(`Import failed: ${e}`);
    }
  };

  const navItems = [
    { id: 'media', label: 'Media' },
    { id: 'audio', label: 'Audio' },
    { id: 'text', label: 'Text' },
  ];

  return (
    <div className="sidebar">
      {/* Nav Tabs */}
      <div className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activeNav === item.id ? 'active' : ''}`}
            onClick={() => setActiveNav(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeNav === 'media' && (
        <div className="sidebar-content">
          {/* Import Zone */}
          <button
            className={`import-zone ${isDragging ? 'dragging' : ''}`}
            onClick={handleImport}
          >
            <div className="import-zone-icon">
              <UploadIcon />
            </div>
            <h3>Import</h3>
            <p>Drag and drop videos, photos, and audio files here</p>
          </button>

          {/* No media hint */}
          {mediaItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
              No media? Import files to get started.
            </div>
          ) : (
            <>
              <div className="sidebar-section-title">Your Media</div>
              {mediaItems.map(item => (
                <DraggableAsset
                  key={item.id}
                  item={item}
                  onClick={() => onMediaSelected(item.file_path)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {activeNav === 'audio' && (
        <div className="sidebar-content">
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '24px 0' }}>
            🎵 Import audio files from the Media tab.
          </div>
        </div>
      )}

      {activeNav === 'text' && (
        <div className="sidebar-content">
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '24px 0' }}>
            📝 Captions are generated via the AI tools panel.
          </div>
        </div>
      )}
    </div>
  );
}

function DraggableAsset({ item, onClick }: { item: Asset; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `asset-${item.id}`,
    data: { type: 'Asset', asset: item },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 999 : 1 }
    : undefined;

  const ext = item.file_path.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4', 'mov', 'mkv', 'avi'].includes(ext);
  const isAudio = ['mp3', 'wav', 'aac'].includes(ext);

  return (
    <div
      ref={setNodeRef}
      className={`asset-item ${isDragging ? 'dragging' : ''}`}
      style={style}
      {...listeners}
      {...attributes}
      onDoubleClick={onClick}
      title={item.file_path}
    >
      <div className="asset-thumb">
        {isVideo ? '🎥' : isAudio ? '🎵' : '🖼️'}
      </div>
      <div className="asset-info">
        <div className="asset-name">{item.file_path.split(/[/\\]/).pop()}</div>
        <div className="asset-meta">
          {item.duration > 0 ? `${item.duration.toFixed(1)}s` : 'Unknown duration'}
          {' · '}{isVideo ? 'Video' : isAudio ? 'Audio' : 'Image'}
        </div>
      </div>
    </div>
  );
}
