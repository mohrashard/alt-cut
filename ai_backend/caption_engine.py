import os
import subprocess
import glob
import json
import re
import sys
import argparse

# ── Encoding fix for Windows console ─────────────────────────
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# ── CLI args ──────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("input_video", nargs="?", default="test.mp4")
parser.add_argument("--step", choices=["all", "denoise", "captions", "jumpcut"], default="all",
                    help="Which AI step to run")
parser.add_argument("--output-json",  default="captions.json",        help="Path for captions JSON output")
parser.add_argument("--output-media", default="processed_export.mp4", help="Path for processed video output")
args = parser.parse_args()

INPUT_VIDEO  = args.input_video
STEP         = args.step
OUTPUT_JSON  = args.output_json
OUTPUT_MEDIA = args.output_media
RAW_AUDIO    = os.path.join(os.path.dirname(OUTPUT_JSON) or ".", "raw_audio_temp.wav")

def log(msg: str):
    """Print with flush so Rust captures it line-by-line."""
    print(msg, flush=True)

# ─────────────────────────────────────────────────────────────
# Step 1: Extract audio from video
# ─────────────────────────────────────────────────────────────
def extract_audio(input_file: str, output_wav: str) -> str:
    log(f"🎬 Extracting audio from: {os.path.basename(input_file)}")
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_file, "-vn",
         "-acodec", "pcm_s16le", "-ar", "48000", output_wav],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    log(f"✅ Audio extracted → {os.path.basename(output_wav)}")
    return output_wav

# ─────────────────────────────────────────────────────────────
# Step 2: Denoise audio with DeepFilterNet
# ─────────────────────────────────────────────────────────────
def denoise_audio(input_wav: str) -> str:
    log("🎧 Running DeepFilterNet noise removal…")

    import tempfile
    # Use a controlled temp dir so we know exactly where the output goes
    tmp_dir = tempfile.mkdtemp(prefix="df_out_")
    wav_base = os.path.splitext(os.path.basename(input_wav))[0]

    result = subprocess.run(
        [sys.executable, "-m", "df.enhance",
         "--output-dir", tmp_dir,
         input_wav],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        log(f"⚠️ DeepFilterNet failed (exit {result.returncode}). Using original audio.\n{result.stderr[:500]}")
        return input_wav

    # Find any .wav file written to tmp_dir
    written = glob.glob(os.path.join(tmp_dir, "*.wav"))
    if written:
        out = written[0]
        log(f"✅ DeepFilterNet enhanced: {os.path.basename(out)}")
        return out

    log(f"⚠️ DeepFilterNet completed but wrote no file to {tmp_dir}. Using original.")
    return input_wav

# ─────────────────────────────────────────────────────────────
# Step 3: Transcribe with Whisper
# ─────────────────────────────────────────────────────────────
def transcribe(audio_path: str):
    from faster_whisper import WhisperModel

    log("🎙️ Loading Whisper model…")
    try:
        model = WhisperModel("small", device="cuda", compute_type="float16")
        log("   Using CUDA (GPU)")
    except Exception as e:
        log(f"   GPU unavailable ({type(e).__name__}), falling back to CPU")
        model = WhisperModel("small", device="cpu", compute_type="int8")

    log("🎙️ Transcribing… (this may take 1-3 min for long videos)")
    segments, info = model.transcribe(audio_path, beam_size=5, language="en", word_timestamps=True)

    word_list = []
    full_transcript = ""

    for seg in list(segments):
        full_transcript += seg.text + " "
        if seg.words:
            for w in seg.words:
                word_list.append({
                    "word":  w.word.strip(),
                    "start": round(w.start, 3),
                    "end":   round(w.end,   3),
                })

    log(f"✅ Transcription done: {len(word_list)} words, ~{info.duration:.1f}s audio")
    return full_transcript.strip(), word_list

# ─────────────────────────────────────────────────────────────
# Step 4: Chunk with Gemma4 via Ollama
# ─────────────────────────────────────────────────────────────
def chunk_with_gemma(transcript: str) -> list[str]:
    import ollama

    log("🧠 Sending transcript to Gemma 4 for 2-3 word chunking…")
    prompt = (
        "You are a strict data-formatting pipeline. "
        "Break the user's transcript into short, punchy chunks of 2 to 3 words each. "
        "Return ONLY valid JSON: { \"chunks\": [ \"word1 word2\", \"word3 word4 word5\" ] }. "
        "No markdown, no explanation, no extra keys."
    )
    response = ollama.chat(
        model='gemma4:e4b',
        format='json',
        messages=[
            {'role': 'system', 'content': prompt},
            {'role': 'user',   'content': f'Transcript: "{transcript}"'},
        ],
        options={'num_predict': 4096}
    )

    raw = response['message']['content']
    # Strip any accidental markdown fences
    cleaned = re.sub(r'```json|```', '', raw).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemma returned invalid JSON: {e}\nRaw: {raw[:400]}")

    chunks = parsed.get("chunks", [])
    log(f"✅ Gemma returned {len(chunks)} chunks")
    return chunks

# ─────────────────────────────────────────────────────────────
# Step 5: Align chunk timestamps with Whisper word list
# ─────────────────────────────────────────────────────────────
def align_timestamps(chunks: list[str], whisper_words: list[dict]) -> dict:
    result = []
    w_idx  = 0

    for chunk_text in chunks:
        words_in_chunk = chunk_text.split()
        obj = {"text": chunk_text, "start": 0.0, "end": 0.0, "words": []}

        for i, _ in enumerate(words_in_chunk):
            if w_idx < len(whisper_words):
                w = whisper_words[w_idx]
                if i == 0:
                    obj["start"] = w["start"]
                obj["end"] = w["end"]
                obj["words"].append(w)
                w_idx += 1

        if obj["words"]:
            result.append(obj)

    log(f"✅ Timestamp alignment done: {len(result)} final chunks")
    return {"chunks": result}

# ─────────────────────────────────────────────────────────────
# Step 6: Generate captions (transcribe + chunk + align + save)
# ─────────────────────────────────────────────────────────────
def generate_captions(audio_path: str):
    transcript, word_list = transcribe(audio_path)

    if not transcript:
        raise RuntimeError("Transcription returned empty text. Is the audio silent?")

    chunks      = chunk_with_gemma(transcript)
    final_data  = align_timestamps(chunks, word_list)

    # Ensure output directory exists
    out_dir = os.path.dirname(os.path.abspath(OUTPUT_JSON))
    os.makedirs(out_dir, exist_ok=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(final_data, f, indent=2, ensure_ascii=False)

    log(f"💾 Captions saved → {OUTPUT_JSON}  ({len(final_data['chunks'])} chunks)")

# ─────────────────────────────────────────────────────────────
# Step 7: Denoise and mux back to video
# ─────────────────────────────────────────────────────────────
def run_denoise():
    raw  = extract_audio(INPUT_VIDEO, RAW_AUDIO)
    clean = denoise_audio(raw)

    log(f"🎬 Muxing clean audio back into video → {OUTPUT_MEDIA}")

    # Ensure output directory exists
    out_dir = os.path.dirname(os.path.abspath(OUTPUT_MEDIA))
    os.makedirs(out_dir, exist_ok=True)

    subprocess.run(
        ["ffmpeg", "-y",
         "-i", INPUT_VIDEO,
         "-i", clean,
         "-c:v", "copy",
         "-map", "0:v:0",
         "-map", "1:a:0",
         OUTPUT_MEDIA],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    log(f"✅ Denoised video saved → {OUTPUT_MEDIA}")

    # Cleanup temp files
    for tmp in [RAW_AUDIO, clean]:
        if tmp != RAW_AUDIO and os.path.exists(tmp):
            os.remove(tmp)
    if os.path.exists(RAW_AUDIO):
        os.remove(RAW_AUDIO)

# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
def run_pipeline():
    log(f"🚀 Pipeline step [{STEP}] on: {INPUT_VIDEO}")

    if not os.path.exists(INPUT_VIDEO):
        raise FileNotFoundError(f"Input file not found: {INPUT_VIDEO}")

    if STEP == "captions":
        raw = extract_audio(INPUT_VIDEO, RAW_AUDIO)
        generate_captions(raw)
        if os.path.exists(RAW_AUDIO):
            os.remove(RAW_AUDIO)

    elif STEP == "denoise":
        run_denoise()

    elif STEP == "jumpcut":
        log("⚠️ Jumpcut step not yet implemented.")

    else:
        log("⚠️ Use --step captions or --step denoise.")

if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as e:
        log(f"❌ FATAL: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)