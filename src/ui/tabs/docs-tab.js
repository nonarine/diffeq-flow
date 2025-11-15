/**
 * Documentation tab for the modal window
 *
 * Provides organized documentation with collapsible sections.
 * Can be opened to specific sections via anchor links from help icons.
 * Loads documentation from markdown files.
 */

import { Tab } from './tab-base.js';

export class DocsTab extends Tab {
    constructor() {
        super('docs', 'Documentation');
        this.sections = [];

        // Define documentation sections
        this.sectionDefinitions = [
            { id: 'display-options', title: 'Display Options & UI Controls', file: 'docs/display-options.md' },
            { id: 'vector-fields', title: 'Vector Fields', file: 'docs/vector-fields.md' },
            { id: 'integrators', title: 'Integration Methods', file: 'docs/integrators.md' },
            { id: 'color-modes', title: 'Color Modes', file: 'docs/color-modes.md' },
            { id: 'projection', title: '2D Projection', file: 'docs/projection.md' },
            { id: 'coordinate-systems', title: 'Coordinate Systems', file: 'docs/coordinate-systems.md' },
            { id: 'domain-transforms', title: 'Domain Transforms', file: 'docs/domain-transforms.md' },
            { id: 'hdr-rendering', title: 'HDR & Tone Mapping', file: 'docs/hdr-rendering.md' },
            { id: 'rendering-effects', title: 'Rendering Effects', file: 'docs/rendering-effects.md' },
            { id: 'particle-settings', title: 'Particle Settings', file: 'docs/particle-settings.md' },
            { id: 'animation', title: 'Animation System', file: 'docs/animation.md' },
            { id: 'preset-management', title: 'Preset Management', file: 'docs/preset-management.md' },
            { id: 'storage-strategy', title: 'Storage Strategy', file: 'docs/storage-strategy.md' },
            { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', file: 'docs/keyboard-shortcuts.md' }
        ];
    }

    /**
     * Load markdown file and convert to HTML
     * @private
     */
    async _loadMarkdown(file) {
        try {
            const response = await fetch(file);
            if (!response.ok) {
                throw new Error(`Failed to load ${file}: ${response.statusText}`);
            }
            const markdown = await response.text();

            // Parse markdown with marked.js
            if (typeof marked === 'undefined') {
                console.error('marked.js not loaded');
                return `<p>Error: Markdown parser not available</p>`;
            }

            return marked.parse(markdown);
        } catch (error) {
            console.error('Error loading markdown:', error);
            return `<p>Error loading documentation: ${error.message}</p>`;
        }
    }

    /**
     * Render the tab content
     */
    render(container) {
        const content = document.createElement('div');
        content.id = 'docs-tab-content';
        content.className = 'modal-tab-content';
        content.style.display = 'none';

        // Create container with loading message
        content.innerHTML = `
            <div class="docs-container">
                <p style="text-align: center; padding: 40px; color: #888;">Loading documentation...</p>
            </div>
        `;

        container.appendChild(content);

        // Load all markdown files and render sections
        this._loadAllSections(content);

        return content;
    }

    /**
     * Load all markdown sections asynchronously
     * @private
     */
    async _loadAllSections(content) {
        const docsContainer = content.querySelector('.docs-container');

        // Load all sections
        const sectionPromises = this.sectionDefinitions.map(async (def) => {
            const html = await this._loadMarkdown(def.file);
            return { id: def.id, title: def.title, html };
        });

        const sections = await Promise.all(sectionPromises);

        // Render all sections
        const sectionsHTML = sections.map(section =>
            this._renderSection(section.id, section.title, section.html)
        ).join('');

        docsContainer.innerHTML = sectionsHTML;

        // Setup collapsible sections
        this._setupCollapsibles(content);

        // If there's a pending section, open it now
        if (this._pendingSection) {
            this.openToSection(this._pendingSection);
            this._pendingSection = null;
        }
    }

    /**
     * Render a collapsible documentation section
     * @private
     */
    _renderSection(id, title, content) {
        return `
            <div class="docs-section collapsed" id="docs-${id}">
                <div class="docs-section-header">
                    <h3>${title}</h3>
                    <span class="docs-toggle">▶</span>
                </div>
                <div class="docs-section-content" style="max-height: 0;">
                    ${content}
                </div>
            </div>
        `;
    }

    /**
     * Setup collapsible section behavior
     * @private
     */
    _setupCollapsibles(container) {
        const headers = container.querySelectorAll('.docs-section-header');

        headers.forEach(header => {
            header.addEventListener('click', () => {
                const section = header.parentElement;
                const content = section.querySelector('.docs-section-content');
                const toggle = header.querySelector('.docs-toggle');
                const isCollapsed = section.classList.contains('collapsed');

                if (isCollapsed) {
                    section.classList.remove('collapsed');
                    // Set a large initial max-height to allow content to render
                    content.style.maxHeight = '5000px';
                    toggle.textContent = '▼';

                    // After content has rendered, set to exact height for smooth future collapses
                    setTimeout(() => {
                        if (!section.classList.contains('collapsed')) {
                            content.style.maxHeight = content.scrollHeight + 'px';
                        }
                    }, 350);
                } else {
                    section.classList.add('collapsed');
                    content.style.maxHeight = '0';
                    toggle.textContent = '▶';
                }
            });
        });
    }

    /**
     * Open to a specific section
     * @param {string} sectionId - Section ID (e.g., 'integrators')
     */
    openToSection(sectionId) {
        if (!this._contentElement) return;

        const section = this._contentElement.querySelector(`#docs-${sectionId}`);
        if (!section) {
            console.warn(`Documentation section '${sectionId}' not found`);
            return;
        }

        // Expand the section if collapsed
        if (section.classList.contains('collapsed')) {
            const header = section.querySelector('.docs-section-header');
            header.click();
        }

        // Scroll to section after expansion animation completes
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
    }

    /**
     * Called when tab becomes active
     */
    onActivate() {
        // Check if we need to open to a specific section
        if (this._pendingSection) {
            this.openToSection(this._pendingSection);
            this._pendingSection = null;
        }
    }

    /**
     * Set a section to open when tab becomes active
     * @param {string} sectionId - Section ID
     */
    setPendingSection(sectionId) {
        this._pendingSection = sectionId;
    }
}
