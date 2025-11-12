# Animation Scripts

## Create Video from Animation ZIP

### Quick Usage

```bash
# Default 30 fps
./scripts/create-video.sh animation-2025-01-15T12-30-45.zip output.mp4

# Custom 60 fps
./scripts/create-video.sh animation-2025-01-15T12-30-45.zip output.mp4 60
```

### One-Liner (without script)

If you prefer a one-liner command:

```bash
# Extract ZIP and create video in one command (30 fps)
unzip -q animation.zip -d frames && ffmpeg -framerate 30 -pattern_type glob -i 'frames/frames/frame_*.png' -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4 && rm -rf frames
```

Or with custom fps:

```bash
# 60 fps version
unzip -q animation.zip -d frames && ffmpeg -framerate 60 -pattern_type glob -i 'frames/frames/frame_*.png' -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4 && rm -rf frames
```

### Requirements

- **ffmpeg**: Install with:
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Windows: Download from https://ffmpeg.org/download.html

### Parameters Explained

- **Frame rate** (`-framerate`): Frames per second
  - 24 fps: Cinematic
  - 30 fps: Standard video (default)
  - 60 fps: Smooth motion

- **Quality** (`-crf`): Constant Rate Factor (0-51)
  - 0: Lossless (huge files)
  - 18: Visually lossless (default, recommended)
  - 23: High quality
  - 28: Medium quality (smaller files)

- **Codec** (`-c:v libx264`): H.264 video codec (widely compatible)

- **Pixel format** (`-pix_fmt yuv420p`): Ensures compatibility with all players

### Advanced Options

#### High Quality for Presentation

```bash
./scripts/create-video.sh animation.zip presentation.mp4 60
# Uses 60 fps and CRF 18 (visually lossless)
```

#### Smaller File Size

Edit the script and change `-crf 18` to `-crf 28`:

```bash
ffmpeg -framerate "$FPS" \
    -pattern_type glob -i "$FRAMES_DIR/frame_*.png" \
    -c:v libx264 \
    -pix_fmt yuv420p \
    -preset slow \
    -crf 28 \
    -y \
    "$OUTPUT_FILE"
```

#### Loop Video N Times

Create a looping video:

```bash
# Loop 3 times
ffmpeg -stream_loop 2 -i output.mp4 -c copy output-looped.mp4
```

#### Convert to GIF

For social media (note: GIFs are much larger than MP4):

```bash
# Create palette for better colors
ffmpeg -i output.mp4 -vf "fps=30,scale=640:-1:flags=lanczos,palettegen" palette.png

# Generate GIF using palette
ffmpeg -i output.mp4 -i palette.png -filter_complex "fps=30,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse" output.gif

# Cleanup
rm palette.png
```

### Troubleshooting

#### "No frames found in ZIP file"

Make sure the ZIP contains PNG files. Check the structure:

```bash
unzip -l animation.zip | head -20
```

Should show files like:
```
frames/frame_00000.png
frames/frame_00001.png
...
```

#### "ffmpeg not found"

Install ffmpeg first (see Requirements above).

#### Video plays too fast/slow

Adjust the fps parameter:
- Too fast → decrease fps (e.g., 24 or 15)
- Too slow → increase fps (e.g., 60 or 120)

#### Poor quality / compression artifacts

Decrease the CRF value (lower = better quality):
```bash
# Edit the script and change -crf 18 to -crf 10
-crf 10
```
