import { convertFileSrc } from '@tauri-apps/api/core';

interface Task {
  filePath: string;
  timeSec: number;
  resolve: (url: string | null) => void;
}

class ThumbnailQueue {
  private queue: Task[] = [];
  private isProcessing = false;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private cache = new Map<string, string>();
  private MAX_CACHE_SIZE = 200; // Adjust based on memory profiling

  constructor() {
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.video.muted = true;
    this.video.crossOrigin = 'anonymous';
    this.video.preload = 'auto'; // Helps with faster seeking
  }

  public getThumbnail(filePath: string, timeSec: number): Promise<string | null> {
    const key = `${filePath}@${timeSec.toFixed(2)}`;
    
    // 1. Check Cache
    if (this.cache.has(key)) {
      return Promise.resolve(this.cache.get(key)!);
    }

    // 2. Add to Queue
    return new Promise((resolve) => {
      this.queue.push({ filePath, timeSec, resolve });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue.shift()!;
    const key = `${task.filePath}@${task.timeSec.toFixed(2)}`;
    const src = convertFileSrc(task.filePath);

    try {
      if (this.video.src !== src) {
        this.video.src = src;
        await new Promise((res) => {
            this.video.onloadedmetadata = res;
        });
      }

      this.video.currentTime = Math.max(0, Math.min(task.timeSec, this.video.duration - 0.05));
      
      await new Promise((res, rej) => {
        this.video.onseeked = res;
        this.video.onerror = rej;
      });

      // Calculate proportional dimensions (Max height 180px)
      const targetHeight = 180;
      const aspectRatio = this.video.videoWidth / this.video.videoHeight;
      this.canvas.height = targetHeight;
      this.canvas.width = targetHeight * aspectRatio;

      const ctx = this.canvas.getContext('2d');
      ctx?.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Use Blob instead of Base64
      this.canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          this.manageCache(key, url);
          task.resolve(url);
        } else {
          task.resolve(null);
        }
        this.finishTask();
      }, 'image/jpeg', 0.6);

    } catch (error) {
      console.error("Thumbnail extraction failed:", error);
      task.resolve(null);
      this.finishTask();
    }
  }

  private finishTask() {
    this.isProcessing = false;
    this.processNext();
  }

  private manageCache(key: string, url: string) {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        URL.revokeObjectURL(this.cache.get(firstKey)!); // Free memory!
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, url);
  }
}

export const thumbnailProcessor = new ThumbnailQueue();
