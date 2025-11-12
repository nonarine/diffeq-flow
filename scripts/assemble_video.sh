#!/bin/bash

# Assemble PNG frames into video using ffmpeg
# Usage: ./assemble_video.sh <frames_dir> <output_file> [fps]

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <frames_dir> <output_file> [fps]"
    echo ""
    echo "Examples:"
    echo "  $0 ./frames output.mp4 30"
    echo "  $0 ./frames output.webm 60"
    echo "  $0 ./frames output.gif 30"
    echo ""
    exit 1
fi

FRAMES_DIR="$1"
OUTPUT="$2"
FPS="${3:-30}"

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed"
    echo "Install with: sudo apt install ffmpeg (Ubuntu/Debian)"
    echo "          or: brew install ffmpeg (macOS)"
    exit 1
fi

# Check if frames directory exists
if [ ! -d "$FRAMES_DIR" ]; then
    echo "Error: Directory not found: $FRAMES_DIR"
    exit 1
fi

# Count frames
FRAME_COUNT=$(ls -1 "$FRAMES_DIR"/*.png 2>/dev/null | wc -l)
if [ "$FRAME_COUNT" -eq 0 ]; then
    echo "Error: No PNG files found in $FRAMES_DIR"
    exit 1
fi

echo "Found $FRAME_COUNT frames in $FRAMES_DIR"
echo "Output: $OUTPUT"
echo "FPS: $FPS"
echo ""

# Determine output format
EXT="${OUTPUT##*.}"

case "$EXT" in
    mp4)
        echo "Creating MP4 (H.264)..."
        ffmpeg -y -framerate "$FPS" \
            -pattern_type glob -i "$FRAMES_DIR/*.png" \
            -c:v libx264 \
            -pix_fmt yuv420p \
            -crf 18 \
            -preset slow \
            "$OUTPUT"
        ;;

    webm)
        echo "Creating WebM (VP9)..."
        ffmpeg -y -framerate "$FPS" \
            -pattern_type glob -i "$FRAMES_DIR/*.png" \
            -c:v libvpx-vp9 \
            -pix_fmt yuva420p \
            -b:v 2M \
            -crf 30 \
            "$OUTPUT"
        ;;

    gif)
        echo "Creating animated GIF..."
        # Generate palette for better colors
        PALETTE="/tmp/palette_$$.png"
        ffmpeg -y -framerate "$FPS" \
            -pattern_type glob -i "$FRAMES_DIR/*.png" \
            -vf "palettegen=stats_mode=diff" \
            "$PALETTE"

        # Create GIF with palette
        ffmpeg -y -framerate "$FPS" \
            -pattern_type glob -i "$FRAMES_DIR/*.png" \
            -i "$PALETTE" \
            -lavfi "paletteuse=dither=bayer:bayer_scale=5" \
            "$OUTPUT"

        rm "$PALETTE"
        ;;

    *)
        echo "Error: Unsupported format: $EXT"
        echo "Supported formats: mp4, webm, gif"
        exit 1
        ;;
esac

echo ""
echo "✓ Created $OUTPUT"
ls -lh "$OUTPUT"
