# AltCut Product Specification

AltCut is a modern, AI-powered video editor designed for fast-paced content creation. It features a sleek, CapCut-style interface and deeply integrated AI tools for automated editing workflows.

## 1. Core Editor Features
- **Project Persistence**: Automatic saving of project state, clips, and metadata using a local SQLite database.
- **Mobile-First Preview**: 1080x1920 (9:16) preview window powered by Remotion for high-performance rendering.
- **Multi-Track Timeline**:
  - **Text Track**: For AI-generated captions and overlays.
  - **Video Track**: Primary track with drag-and-drop support and absolute positioning.
  - **Audio Track**: Dedicated track for background music and cleaned audio visualization.
- **Media Pool**: Local asset ingestion with thumbnail support and persistent storage.
- **Modular Toolbar**: Quick access to Media, Audio, Text, Stickers, Effects, and specialized AI tools.

## 2. AI Intelligence Suite
- **Modular AI Pipeline**: Powered by a Python backend (`caption_engine.py`) with CUDA GPU acceleration and CPU fallback.
- **Automated Captions**:
  - **Speech-to-Text**: High-accuracy transcription via `Faster-Whisper`.
  - **Intelligent Chunking**: Large language model (`Gemma-4`) chunking for punchy, 2-3 word captions.
  - **Timestamp Alignment**: Precise sub-second alignment of words to video frames.
- **Audio Cleaning (Denoise)**: Professional-grade background noise and echo removal using `DeepFilterNet`.
- **Live Feedback**: Real-time process logs and status badges (`⚙️ Processing`, `✅ Done`) integrated into the properties panel.

## 3. Styling & Customization
- **Dynamic Captions**:
  - **Hormozi Style**: Big, bold yellow highlights with subtle rotations.
  - **Karaoke Style**: Smooth neon green flow for rhythmic text.
- **Typography**: Support for custom fonts (Arial, Impact, Proxima Nova).
- **Transform Tools**: Real-time scale and volume adjustments for individual clips.

## 4. Rendering & Export
- **Remotion Engine**: Uses React-based rendering for frame-accurate previews and exports.
- **Full Export**: Muxing of cleaned audio and burned-in AI captions into a final `.mp4` file via CLI.
