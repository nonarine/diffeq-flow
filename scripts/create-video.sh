#!/bin/bash

# Create MP4 video from animation ZIP file(s)
# Usage: ./scripts/create-video.sh animation.zip output.mp4 [fps]
#
# Supports multi-part ZIPs: If animation-timestamp.1.zip, animation-timestamp.2.zip exist,
# you can pass animation-timestamp.zip (or animation-timestamp) and it will find all parts.

if [ $# -lt 2 ]; then
    echo "Usage: $0 <animation.zip> <output.mp4> [fps]"
    echo ""
    echo "Examples:"
    echo "  $0 animation.zip output.mp4              # 30 fps (default)"
    echo "  $0 animation.zip output.mp4 60           # 60 fps"
    echo "  $0 animation-timestamp output.mp4        # Auto-detect .zip or multi-part"
    echo ""
    echo "Multi-part ZIPs:"
    echo "  Large animations are split into animation-timestamp.1.zip, .2.zip, etc."
    echo "  Pass the base name (with or without .zip) to automatically extract all parts."
    echo ""
    exit 1
fi

INPUT_ARG="$1"
OUTPUT_FILE="$2"
FPS="${3:-30}"  # Default to 30 fps

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed"
    echo "Install with: sudo apt install ffmpeg  (Ubuntu/Debian)"
    echo "           or: brew install ffmpeg      (macOS)"
    exit 1
fi

# Determine base filename and directory
INPUT_DIR=$(dirname "$INPUT_ARG")
INPUT_BASE=$(basename "$INPUT_ARG" .zip)

# Find all matching ZIP files (single or multi-part)
ZIP_FILES=()

# Check for single ZIP file first
if [ -f "${INPUT_DIR}/${INPUT_BASE}.zip" ]; then
    # Check if multi-part files also exist
    if [ -f "${INPUT_DIR}/${INPUT_BASE}.1.zip" ]; then
        echo "Found both ${INPUT_BASE}.zip and ${INPUT_BASE}.1.zip"
        echo "Treating as multi-part (ignoring ${INPUT_BASE}.zip, using .1, .2, .3, etc.)"
        # Find all numbered parts
        for part_file in "${INPUT_DIR}/${INPUT_BASE}".*.zip; do
            if [ -f "$part_file" ]; then
                ZIP_FILES+=("$part_file")
            fi
        done
    else
        # Single ZIP file
        ZIP_FILES=("${INPUT_DIR}/${INPUT_BASE}.zip")
    fi
else
    # Look for multi-part files only
    for part_file in "${INPUT_DIR}/${INPUT_BASE}".*.zip; do
        if [ -f "$part_file" ]; then
            ZIP_FILES+=("$part_file")
        fi
    done
fi

# Check if any ZIP files were found
if [ ${#ZIP_FILES[@]} -eq 0 ]; then
    echo "Error: No ZIP files found matching '$INPUT_ARG'"
    echo "Looked for: ${INPUT_DIR}/${INPUT_BASE}.zip or ${INPUT_DIR}/${INPUT_BASE}.*.zip"
    exit 1
fi

# Sort the files to ensure correct order
IFS=$'\n' ZIP_FILES=($(sort <<<"${ZIP_FILES[*]}"))
unset IFS

echo "Found ${#ZIP_FILES[@]} ZIP file(s):"
for zf in "${ZIP_FILES[@]}"; do
    echo "  - $(basename "$zf")"
done

# Create temporary directory
TEMP_DIR=$(mktemp -d)
echo "Extracting frames to $TEMP_DIR..."

# Extract all ZIP files to the same directory
for ZIP_FILE in "${ZIP_FILES[@]}"; do
    echo "Extracting $(basename "$ZIP_FILE")..."
    unzip -q "$ZIP_FILE" -d "$TEMP_DIR"
done

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
# -vf scale: ensure dimensions are divisible by 2 (required for H.264)
# -c:v libx264: H.264 codec
# -pix_fmt yuv420p: compatible pixel format
# -preset slow: better compression
# -crf 18: quality (lower = better, 18 = visually lossless)
ffmpeg -framerate "$FPS" \
    -pattern_type glob -i "$FRAMES_DIR/frame_*.png" \
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
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
