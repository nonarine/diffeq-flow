#!/bin/bash

# Create MP4 video from animation ZIP file
# Usage: ./scripts/create-video.sh animation.zip output.mp4 [fps]

if [ $# -lt 2 ]; then
    echo "Usage: $0 <animation.zip> <output.mp4> [fps]"
    echo ""
    echo "Examples:"
    echo "  $0 animation.zip output.mp4          # 30 fps (default)"
    echo "  $0 animation.zip output.mp4 60       # 60 fps"
    echo ""
    exit 1
fi

ZIP_FILE="$1"
OUTPUT_FILE="$2"
FPS="${3:-30}"  # Default to 30 fps

# Check if ZIP file exists
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: ZIP file '$ZIP_FILE' not found"
    exit 1
fi

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed"
    echo "Install with: sudo apt install ffmpeg  (Ubuntu/Debian)"
    echo "           or: brew install ffmpeg      (macOS)"
    exit 1
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
echo "Extracting frames to $TEMP_DIR..."

# Extract ZIP
unzip -q "$ZIP_FILE" -d "$TEMP_DIR"

# Find the frames directory (handle both flat and nested structure)
if [ -d "$TEMP_DIR/frames" ]; then
    FRAMES_DIR="$TEMP_DIR/frames"
else
    FRAMES_DIR="$TEMP_DIR"
fi

# Count frames
FRAME_COUNT=$(ls "$FRAMES_DIR"/frame_*.png 2>/dev/null | wc -l)
if [ "$FRAME_COUNT" -eq 0 ]; then
    echo "Error: No frames found in ZIP file"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Found $FRAME_COUNT frames"
echo "Creating video at ${FPS} fps..."

# Create video with ffmpeg
# -framerate: input frame rate
# -i: input pattern
# -c:v libx264: H.264 codec
# -pix_fmt yuv420p: compatible pixel format
# -preset slow: better compression
# -crf 18: quality (lower = better, 18 = visually lossless)
ffmpeg -framerate "$FPS" \
    -pattern_type glob -i "$FRAMES_DIR/frame_*.png" \
    -c:v libx264 \
    -pix_fmt yuv420p \
    -preset slow \
    -crf 18 \
    -y \
    "$OUTPUT_FILE"

# Check if ffmpeg succeeded
if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Video created successfully: $OUTPUT_FILE"

    # Get video info
    if command -v ffprobe &> /dev/null; then
        DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_FILE")
        SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
        echo "  Duration: $(printf "%.2f" "$DURATION")s"
        echo "  Size: $SIZE"
        echo "  Resolution: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUTPUT_FILE")"
    fi
else
    echo ""
    echo "✗ Error creating video"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Cleanup
echo ""
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "Done!"
