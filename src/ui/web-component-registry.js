/**
 * Web Component Control Registry
 * Handles async registration of Web Components with ControlManager
 */

/**
 * WebComponentControlRegistry
 * Manages registration of Web Components with ControlManager
 */
export class WebComponentControlRegistry {
    constructor(manager) {
        this.manager = manager;
        this.registrationPromises = [];
    }

    /**
     * Register a Web Component control
     * @param {string} tagName - The custom element tag name (e.g., 'log-slider')
     * @param {string} elementId - The ID of the element in the DOM
     * @returns {Promise<HTMLElement>} Promise that resolves to the registered element
     */
    register(tagName, elementId) {
        const promise = customElements.whenDefined(tagName).then(() => {
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    const element = document.getElementById(elementId);
                    if (element && element._initialized) {
                        // Register with ControlManager
                        this.manager.register(element);

                        // Manually attach listeners since initializeControls() already ran
                        const debouncedCallback = () => this.manager.debouncedApply();
                        element.attachListeners(debouncedCallback);

                        resolve(element);
                    } else {
                        console.warn(`Web Component ${tagName}#${elementId} not found or not initialized`);
                        resolve(null);
                    }
                });
            });
        });

        this.registrationPromises.push(promise);
        return promise;
    }

    /**
     * Wait for all Web Components to be ready
     * @returns {Promise<Array<HTMLElement>>} Promise that resolves to array of registered elements
     */
    whenAllReady() {
        return Promise.all(this.registrationPromises);
    }

    /**
     * Restore settings to all registered Web Components
     * @param {Object} settings - Settings object
     */
    async restoreSettings(settings) {
        const elements = await this.whenAllReady();

        for (const element of elements) {
            if (element && settings[element.settingsKey] !== undefined) {
                element.setValue(settings[element.settingsKey]);
            }
        }
    }

    /**
     * Apply settings after all Web Components are ready
     * @param {Object} settings - Settings object (optional)
     * @returns {Promise} Promise that resolves when settings are applied
     */
    async applyWhenReady(settings = null) {
        // Wait for all components to be ready
        await this.whenAllReady();

        // Apply settings if provided
        if (settings) {
            this.manager.applySettings(settings);

            // Restore Web Component values
            await this.restoreSettings(settings);
        }

        // Trigger final apply to renderer
        this.manager.apply();
    }
}
