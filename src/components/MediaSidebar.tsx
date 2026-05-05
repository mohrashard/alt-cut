import { useState, useEffect, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useDraggable } from '@dnd-kit/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getProjectAssets, addAsset, Asset } from '../lib/db';

interface MediaSidebarProps {
  projectId?: number;
  onMediaSelected: (path: string) => void;
  onMediaAdded: (path: string) => void;
  highlightAssetId?: number | null;
  onHighlightClear?: () => void;
}

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export function MediaSidebar({ projectId, onMediaSelected, onMediaAdded, highlightAssetId, onHighlightClear }: MediaSidebarProps) {
  const [mediaItems, setMediaItems] = useState<Asset[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeNav, setActiveNav] = useState('media');
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // When a highlight is requested, switch to the media tab and scroll to the asset
  useEffect(() => {
    if (highlightAssetId == null) return;
    setActiveNav('media');
    const id = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => clearTimeout(id);
  }, [highlightAssetId]);

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
    if (projectId !== undefined) {
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
      console.log('[MediaSidebar] Import started, projectId:', projectId);
      if (!(window as any).__TAURI_INTERNALS__) {
        alert('Native file picker is only available in the desktop app.');
        return;
      }
      const file = await open({
        multiple: false,
        filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'png', 'jpg'] }],
      });
      console.log('[MediaSidebar] File picker result:', file);

      if (file && projectId !== undefined) {
        const filePath = typeof file === 'string' ? file : (file as any).path || (Array.isArray(file) ? file[0] : null);
        console.log('[MediaSidebar] Resolved filePath:', filePath);
        if (!filePath) return;

        let duration = 0;
        try {
          console.log('[MediaSidebar] Requesting duration for:', filePath);
          // Add a 1.5s timeout to the duration check so it doesn't hang the UI
          duration = await Promise.race([
            invoke<any>('get_video_duration', { videoPath: filePath }).then(r => parseFloat(r)),
            new Promise<number>((_, reject) => setTimeout(() => reject('timeout'), 1500))
          ]).catch(err => {
            console.warn('[MediaSidebar] Duration check failed or timed out:', err);
            return 0;
          });
        } catch (e) {
          console.warn('[MediaSidebar] Duration check error:', e);
        }

        if (isNaN(duration) || duration <= 0) {
          try {
            console.log('[MediaSidebar] Falling back to browser duration check...');
            duration = await getVideoDurationBrowser(convertFileSrc(filePath));
          } catch (e) {
            console.warn('[MediaSidebar] Browser duration check failed:', e);
          }
        }
        if (isNaN(duration) || duration <= 0) duration = 5.0;
        console.log('[MediaSidebar] Final duration used:', duration);

        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);
        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
        const assetType = isAudio ? 'audio' : isImage ? 'image' : 'video';

        console.log('[MediaSidebar] Calling db.addAsset with type:', assetType);
        const newAsset = await addAsset(projectId, filePath, assetType, duration);
        console.log('[MediaSidebar] db.addAsset success:', newAsset);

        // Prevent duplicate items in local state
        setMediaItems(prev => {
          if (prev.find(a => a.id === newAsset.id)) {
            console.log('[MediaSidebar] Asset already in list, skipping state update');
            return prev;
          }
          return [newAsset, ...prev];
        });

        onMediaAdded(filePath);
      }
    } catch (e) {
      console.error(`[MediaSidebar] Import failed: ${e}`);
    }
  };

  const navItems = [
    { id: 'media', label: 'Media' },
    { id: 'audio', label: 'Audio' },
    { id: 'text', label: 'Text' },
  ];

  return (
    <div className="ms-panel">

      {/* ── Tab strip ─────────────────────────────────── */}
      <div className="ms-tabs">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`ms-tab${activeNav === item.id ? ' ms-tab--active' : ''}`}
            onClick={() => setActiveNav(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Search bar ────────────────────────────────── */}
      <div className="ms-search-wrap">
        <span className="ms-search-icon">⌕</span>
        <input
          className="ms-search-input"
          type="text"
          placeholder="Search media…"
          readOnly
        />
      </div>

      {/* ── Media tab ─────────────────────────────────── */}
      {activeNav === 'media' && (
        <div className="ms-content">
          {/* Import Zone */}
          <button
            className={`ms-import-zone${isDragging ? ' ms-import-zone--active' : ''}`}
            onClick={handleImport}
          >
            <div className="ms-import-icon"><UploadIcon /></div>
            <span className="ms-import-title">Import media</span>
            <span className="ms-import-sub">or drag &amp; drop files here</span>
          </button>

          {/* Grid of assets */}
          {mediaItems.length === 0 ? (
            <div className="ms-empty">
              No media yet — click Import to get started.
            </div>
          ) : (
            <>
              <div className="ms-section-label">Your Media</div>
              <div className="ms-grid">
                {mediaItems.map(item => (
                  <DraggableAsset
                    key={item.id}
                    item={item}
                    isHighlighted={item.id === highlightAssetId}
                    highlightRef={item.id === highlightAssetId ? highlightRef : undefined}
                    onClick={() => { onMediaSelected(item.file_path); onHighlightClear?.(); }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeNav === 'audio' && (
        <div className="ms-content">
          <div className="ms-empty">🎵 Import audio files from the Media tab.</div>
        </div>
      )}

      {activeNav === 'text' && (
        <div className="ms-content">
          <div className="ms-empty">📝 Captions are generated via the AI tools panel.</div>
        </div>
      )}

    </div>
  );
}

function DraggableAsset({ item, onClick, isHighlighted, highlightRef }: {
  item: Asset;
  onClick: () => void;
  isHighlighted?: boolean;
  highlightRef?: React.RefObject<HTMLDivElement | null>;
}) {
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

  const filename = item.file_path.split(/[/\\]/).pop() ?? '';
  const durationLabel = item.duration > 0 ? `${item.duration.toFixed(1)}s` : '';

  return (
    <div
      ref={el => {
        setNodeRef(el);
        if (highlightRef) (highlightRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className={`ms-card${isDragging ? ' ms-card--dragging' : ''}${isHighlighted ? ' ms-card--highlighted' : ''}`}
      style={style}
      {...listeners}
      {...attributes}
      onDoubleClick={onClick}
      title={item.file_path}
    >
      {/* Thumbnail area */}
      <div className="ms-card-thumb">
        <span className="ms-card-type-icon">
          {isVideo ? '🎥' : isAudio ? '🎵' : '🖼️'}
        </span>

        {/* Duration badge — top right */}
        {durationLabel && (
          <span className="ms-card-duration">{durationLabel}</span>
        )}

        {/* Filename gradient overlay — bottom */}
        <div className="ms-card-label-wrap">
          <span className="ms-card-label">{filename}</span>
        </div>
      </div>
    </div>
  );
}
