#!/usr/bin/env node

/**
 * Puppeteer-based offline animation renderer
 * Loads animation JSON and captures frames to disk
 *
 * Usage:
 *   node render-animation.js <animation.json> [options]
 *
 * Options:
 *   --width <px>       Canvas width (default: 1920)
 *   --height <px>      Canvas height (default: 1080)
 *   --output <dir>     Output directory (default: ./frames)
 *   --format <fmt>     Image format: png or jpg (default: png)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: node render-animation.js <animation.json> [options]

Options:
  --width <px>       Canvas width (default: 1920)
  --height <px>      Canvas height (default: 1080)
  --output <dir>     Output directory (default: ./frames)
  --format <fmt>     Image format: png or jpg (default: png)

Example:
  node render-animation.js animations/lorenz-zoom.json --width 3840 --height 2160 --output ./renders/lorenz
    `);
    process.exit(0);
}

const animationFile = args[0];
const options = {
    width: parseInt(args[args.indexOf('--width') + 1]) || 1920,
    height: parseInt(args[args.indexOf('--height') + 1]) || 1080,
    output: args[args.indexOf('--output') + 1] || './frames',
    format: args[args.indexOf('--format') + 1] || 'png'
};

// Validate animation file
if (!fs.existsSync(animationFile)) {
    console.error(`Error: Animation file not found: ${animationFile}`);
    process.exit(1);
}

// Load animation JSON
const animationData = JSON.parse(fs.readFileSync(animationFile, 'utf8'));

console.log(`=== Animation Renderer ===`);
console.log(`Animation: ${animationData.name || 'Untitled'}`);
console.log(`Resolution: ${options.width}x${options.height}`);
console.log(`Output: ${options.output}/`);
console.log(`Format: ${options.format}`);
console.log('');

// Create output directory
if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
}

/**
 * Render animation frames
 */
async function renderAnimation() {
    console.log('Launching browser...');

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--enable-webgl',
            '--use-gl=swiftshader',  // Software rendering
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    try {
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({
            width: options.width,
            height: options.height,
            deviceScaleFactor: 1
        });

        // Load local index.html
        const indexPath = path.resolve(__dirname, '../index.html');
        console.log(`Loading application: file://${indexPath}`);
        await page.goto(`file://${indexPath}`, { waitUntil: 'networkidle2' });

        // Wait for renderer to initialize
        await page.waitForTimeout(2000);

        console.log('Injecting animation script...');

        // Inject animation data and run
        const results = await page.evaluate(async (animData) => {
            // Wait for renderer and control manager to be available
            while (!window.renderer || !window.controlManager) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Import and create animator
            const { Animator } = await import('./src/animation/animator.js');
            const animator = new Animator(window.renderer, window.controlManager);

            // Load script
            const script = animator.loadScript(animData);
            const duration = script.timeline[script.timeline.length - 1].time;
            const totalFrames = Math.ceil(duration * script.fps);

            console.log(`Starting animation: ${totalFrames} frames`);

            const frames = [];

            // Run animation
            for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
                // Calculate time for this frame
                const time = (frameNum / script.fps);

                // Get interpolated settings
                const settings = animator.getInterpolatedSettings(time);
                const alpha = animator.getAnimationAlpha(time);

                // Apply settings
                window.controlManager.setSettings(settings);
                window.renderer.setAnimationAlpha(alpha);

                // Wait for one frame
                await new Promise(resolve => requestAnimationFrame(resolve));

                // Render frame workflow
                window.renderer.clearRenderBuffer();
                window.renderer.resetParticles();

                // Burn-in
                if (script.frameConfig.burnInSteps > 0) {
                    window.renderer.step(script.frameConfig.burnInSteps);
                }

                // Optional clear
                if (script.frameConfig.clearAfterBurnIn) {
                    window.renderer.clearRenderBuffer();
                }

                // Accumulation
                if (script.frameConfig.accumulationSteps > 0) {
                    for (let i = 0; i < script.frameConfig.accumulationSteps; i++) {
                        window.renderer.updateParticles();
                        window.renderer.drawParticles();
                        window.renderer.applyFade();
                    }
                }

                // Final render
                window.renderer.render();
                await new Promise(resolve => requestAnimationFrame(resolve));

                // Capture frame as data URL
                const dataUrl = window.renderer.canvas.toDataURL('image/png');
                frames.push({
                    frameNum,
                    time,
                    dataUrl
                });

                // Progress
                if (frameNum % 10 === 0 || frameNum === totalFrames - 1) {
                    console.log(`  Frame ${frameNum + 1}/${totalFrames} (${(100 * (frameNum + 1) / totalFrames).toFixed(1)}%)`);
                }
            }

            return frames;
        }, animationData);

        console.log(`\nRendering complete: ${results.length} frames`);
        console.log('Saving frames to disk...');

        // Save frames to disk
        for (const { frameNum, dataUrl } of results) {
            const filename = `frame_${String(frameNum).padStart(6, '0')}.${options.format}`;
            const filepath = path.join(options.output, filename);

            // Convert data URL to buffer
            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            fs.writeFileSync(filepath, buffer);

            if (frameNum % 50 === 0 || frameNum === results.length - 1) {
                console.log(`  Saved ${frameNum + 1}/${results.length} frames`);
            }
        }

        console.log(`\n=== Rendering Complete ===`);
        console.log(`Output: ${path.resolve(options.output)}/`);
        console.log(`Frames: ${results.length}`);
        console.log('');
        console.log('To create video with ffmpeg:');
        console.log(`  ffmpeg -framerate ${animationData.fps || 30} -i ${options.output}/frame_%06d.${options.format} \\`);
        console.log(`    -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4`);

    } catch (error) {
        console.error('Rendering failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Run
renderAnimation().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
