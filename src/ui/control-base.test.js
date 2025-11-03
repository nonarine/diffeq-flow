/**
 * Unit tests for control-base.js
 *
 * These tests demonstrate how the new control system can be tested
 * in isolation without requiring a browser or DOM.
 *
 * Run with Node.js or a test framework like Jest/Mocha
 */

// Mock jQuery for testing
class MockElement {
    constructor(id, initialValue = '') {
        this.id = id;
        this._value = initialValue;
        this._checked = false;
        this._listeners = {};
    }

    val(value) {
        if (value !== undefined) {
            this._value = value;
            return this;
        }
        return this._value;
    }

    prop(name, value) {
        if (value !== undefined) {
            if (name === 'checked') this._checked = value;
            return this;
        }
        return name === 'checked' ? this._checked : undefined;
    }

    on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
        return this;
    }

    trigger(event) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(handler => handler());
        }
        return this;
    }

    text(value) {
        if (value !== undefined) {
            this._text = value;
            return this;
        }
        return this._text;
    }
}

// Mock jQuery
global.$ = (selector) => {
    // Extract ID from selector (e.g., "#fade" -> "fade")
    const id = selector.replace('#', '');
    if (!global.$._elements) global.$._elements = {};
    if (!global.$._elements[id]) {
        global.$._elements[id] = new MockElement(id);
    }
    return global.$._elements[id];
};

// Mock localStorage
global.localStorage = {
    _data: {},
    getItem(key) {
        return this._data[key] || null;
    },
    setItem(key, value) {
        this._data[key] = value;
    },
    removeItem(key) {
        delete this._data[key];
    },
    clear() {
        this._data = {};
    }
};

// Import after mocking
import {
    SliderControl,
    LogSliderControl,
    PercentSliderControl,
    TextControl,
    SelectControl,
    CheckboxControl,
    ControlManager
} from './control-base.js';

/**
 * Test Suite
 */

console.log('Running control-base.js tests...\n');

// Test 1: SliderControl basic operations
function testSliderControl() {
    console.log('Test 1: SliderControl');

    const control = new SliderControl('test-slider', 50, {
        min: 0,
        max: 100,
        step: 1
    });

    // Set initial value in DOM
    $('#test-slider').val(75);

    // Test getValue
    const value = control.getValue();
    console.assert(value === 75, `Expected 75, got ${value}`);

    // Test setValue
    control.setValue(25);
    console.assert($('#test-slider').val() === 25, 'setValue failed');

    // Test reset
    control.reset();
    console.assert($('#test-slider').val() === 50, 'reset failed');

    console.log('✓ SliderControl passed\n');
}

// Test 2: LogSliderControl logarithmic conversion
function testLogSliderControl() {
    console.log('Test 2: LogSliderControl');

    const control = new LogSliderControl('test-log', 1.0, {
        minValue: 0.1,
        maxValue: 10.0
    });

    // Test conversion: slider at 50 should give geometric mean
    $('#test-log').val(50);
    const value = control.getValue();
    const expectedMid = Math.sqrt(0.1 * 10.0); // ≈ 1.0
    console.assert(
        Math.abs(value - expectedMid) < 0.01,
        `Expected ~1.0, got ${value}`
    );

    // Test round-trip
    control.setValue(5.0);
    const retrieved = control.getValue();
    console.assert(
        Math.abs(retrieved - 5.0) < 0.01,
        `Round-trip failed: set 5.0, got ${retrieved}`
    );

    // Test min value
    control.setValue(0.1);
    console.assert(
        Math.abs($('#test-log').val() - 0) < 0.01,
        'Min value should map to slider position 0'
    );

    // Test max value
    control.setValue(10.0);
    console.assert(
        Math.abs($('#test-log').val() - 100) < 0.01,
        'Max value should map to slider position 100'
    );

    console.log('✓ LogSliderControl passed\n');
}

// Test 3: PercentSliderControl conversion
function testPercentSliderControl() {
    console.log('Test 3: PercentSliderControl');

    const control = new PercentSliderControl('test-percent', 1.0);

    // Slider at 100 should give value 1.0
    $('#test-percent').val(100);
    console.assert(control.getValue() === 1.0, 'Expected 1.0 at slider 100');

    // Slider at 0 should give value 0.0
    $('#test-percent').val(0);
    console.assert(control.getValue() === 0.0, 'Expected 0.0 at slider 0');

    // Slider at 50 should give value 0.5
    $('#test-percent').val(50);
    console.assert(control.getValue() === 0.5, 'Expected 0.5 at slider 50');

    // Test setValue
    control.setValue(0.75);
    console.assert($('#test-percent').val() === 75, 'setValue(0.75) should set slider to 75');

    console.log('✓ PercentSliderControl passed\n');
}

// Test 4: CheckboxControl
function testCheckboxControl() {
    console.log('Test 4: CheckboxControl');

    const control = new CheckboxControl('test-checkbox', false);

    // Test getValue
    $('#test-checkbox').prop('checked', true);
    console.assert(control.getValue() === true, 'getValue should return true');

    // Test setValue
    control.setValue(false);
    console.assert($('#test-checkbox').prop('checked') === false, 'setValue should set to false');

    // Test reset
    control.reset();
    console.assert($('#test-checkbox').prop('checked') === false, 'reset should restore default');

    console.log('✓ CheckboxControl passed\n');
}

// Test 5: TextControl
function testTextControl() {
    console.log('Test 5: TextControl');

    const control = new TextControl('test-text', 'default', { trim: true });

    // Test getValue with trimming
    $('#test-text').val('  hello world  ');
    console.assert(control.getValue() === 'hello world', 'Should trim whitespace');

    // Test setValue
    control.setValue('test value');
    console.assert($('#test-text').val() === 'test value', 'setValue failed');

    console.log('✓ TextControl passed\n');
}

// Test 6: SelectControl
function testSelectControl() {
    console.log('Test 6: SelectControl');

    const control = new SelectControl('test-select', 'option1');

    // Test getValue
    $('#test-select').val('option2');
    console.assert(control.getValue() === 'option2', 'getValue failed');

    // Test setValue
    control.setValue('option3');
    console.assert($('#test-select').val() === 'option3', 'setValue failed');

    console.log('✓ SelectControl passed\n');
}

// Test 7: ControlManager save/restore
function testControlManager() {
    console.log('Test 7: ControlManager');

    const manager = new ControlManager({
        storageKey: 'test-settings',
        onApply: null
    });

    // Register controls
    manager.register(new SliderControl('slider1', 50));
    manager.register(new CheckboxControl('check1', false));
    manager.register(new TextControl('text1', 'default'));

    // Set values
    $('#slider1').val(75);
    $('#check1').prop('checked', true);
    $('#text1').val('modified');

    // Test getSettings
    const settings = manager.getSettings();
    console.assert(settings.slider1 === 75, 'getSettings slider1 failed');
    console.assert(settings.check1 === true, 'getSettings check1 failed');
    console.assert(settings.text1 === 'modified', 'getSettings text1 failed');

    // Test saveToStorage
    manager.saveToStorage();
    const saved = localStorage.getItem('test-settings');
    console.assert(saved !== null, 'saveToStorage failed');

    // Reset controls
    $('#slider1').val(0);
    $('#check1').prop('checked', false);
    $('#text1').val('');

    // Test loadFromStorage
    manager.loadFromStorage();
    console.assert($('#slider1').val() === 75, 'loadFromStorage slider1 failed');
    console.assert($('#check1').prop('checked') === true, 'loadFromStorage check1 failed');
    console.assert($('#text1').val() === 'modified', 'loadFromStorage text1 failed');

    // Test resetAll
    manager.resetAll();
    console.assert($('#slider1').val() === 50, 'resetAll slider1 failed');
    console.assert($('#check1').prop('checked') === false, 'resetAll check1 failed');
    console.assert($('#text1').val() === 'default', 'resetAll text1 failed');

    console.log('✓ ControlManager passed\n');
}

// Test 8: Control with custom onChange
function testCustomOnChange() {
    console.log('Test 8: Custom onChange callback');

    let callbackCalled = false;
    let callbackValue = null;

    const control = new SliderControl('test-callback', 50, {
        onChange: (value) => {
            callbackCalled = true;
            callbackValue = value;
        }
    });

    // Attach listeners
    const dummyCallback = () => {};
    control.attachListeners(dummyCallback);

    // Trigger input event
    $('#test-callback').val(75);
    $('#test-callback').trigger('input');

    console.assert(callbackCalled === true, 'onChange callback not called');
    console.assert(callbackValue === 75, `Expected 75, got ${callbackValue}`);

    console.log('✓ Custom onChange passed\n');
}

// Test 9: Settings key mapping
function testSettingsKey() {
    console.log('Test 9: Settings key mapping');

    const control = new SliderControl('my-slider', 100, {
        settingsKey: 'customKey'
    });

    $('#my-slider').val(200);

    const settings = {};
    control.saveToSettings(settings);

    console.assert(settings.customKey === 200, 'Settings key mapping failed');
    console.assert(settings['my-slider'] === undefined, 'Should not use element ID as key');

    console.log('✓ Settings key mapping passed\n');
}

// Run all tests
try {
    testSliderControl();
    testLogSliderControl();
    testPercentSliderControl();
    testCheckboxControl();
    testTextControl();
    testSelectControl();
    testControlManager();
    testCustomOnChange();
    testSettingsKey();

    console.log('✅ All tests passed!');
} catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
}
