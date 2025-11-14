/**
 * 2D projection mappers for visualizing n-dimensional vector fields
 * Each mapper reduces n-dimensional position to 2D screen coordinates
 */

import { parseExpression } from './parser.js';

/**
 * Select mapper - choose 2 dimensions to display (with optional depth)
 * @param {number} dim1 - First dimension index (0-based)
 * @param {number} dim2 - Second dimension index (0-based)
 * @param {number} totalDims - Total number of dimensions
 * @param {number} depthDim - Depth dimension index (optional, defaults to 2 or -1 if not available)
 */
export function selectMapper(dim1, dim2, totalDims, depthDim = null) {
    // Auto-select depth dimension if not specified
    if (depthDim === null) {
        // Use dimension 2 if we have at least 3 dimensions, otherwise -1
        depthDim = totalDims >= 3 ? 2 : -1;
    }

    const hasDepth = depthDim >= 0 && depthDim < totalDims;

    return {
        name: 'Select',
        params: { dim1, dim2, depthDim },
        code: `
// Select 2 dimensions for display${hasDepth ? ' (with depth)' : ''}
vec2 project_to_2d(vec${totalDims} pos) {
    return vec2(pos[${dim1}], pos[${dim2}]);
}

vec3 project_to_3d(vec${totalDims} pos) {
    return vec3(pos[${dim1}], pos[${dim2}], ${hasDepth ? `pos[${depthDim}]` : '0.0'});
}
`
    };
}

/**
 * Linear projection mapper - apply 2×N or 3×N matrix projection
 * @param {number[][]} matrix - 2×N or 3×N projection matrix
 * @param {number} dimensions - Number of dimensions
 */
export function linearProjectionMapper(matrix, dimensions) {
    // Generate GLSL code for matrix multiplication
    const row1 = matrix[0].map((val, i) => `${val.toFixed(6)} * pos[${i}]`).join(' + ');
    const row2 = matrix[1].map((val, i) => `${val.toFixed(6)} * pos[${i}]`).join(' + ');
    const row3 = matrix[2] ? matrix[2].map((val, i) => `${val.toFixed(6)} * pos[${i}]`).join(' + ') : null;

    return {
        name: 'Linear Projection',
        params: { matrix },
        code: `
// Linear projection matrix
vec2 project_to_2d(vec${dimensions} pos) {
    return vec2(
        ${row1},
        ${row2}
    );
}

vec3 project_to_3d(vec${dimensions} pos) {
    return vec3(
        ${row1},
        ${row2},
        ${row3 || '0.0'}
    );
}
`
    };
}

/**
 * Orthographic projection - project along a specific axis
 * @param {number} axis - Axis to project out (0-based)
 * @param {number} dimensions - Total dimensions
 */
export function orthographicMapper(axis, dimensions) {
    // Project out the specified axis, take first two remaining dimensions
    let dim1 = axis === 0 ? 1 : 0;
    let dim2 = dim1 + 1;
    if (dim2 === axis) dim2++;

    return {
        name: 'Orthographic',
        params: { axis },
        code: `
// Orthographic projection (remove axis ${axis}, use as depth)
vec2 project_to_2d(vec${dimensions} pos) {
    return vec2(pos[${dim1}], pos[${dim2}]);
}

vec3 project_to_3d(vec${dimensions} pos) {
    return vec3(pos[${dim1}], pos[${dim2}], pos[${axis}]);
}
`
    };
}

/**
 * Spherical projection - project from 3D spherical coordinates
 * Only works for 3D systems
 */
export function sphericalMapper() {
    return {
        name: 'Spherical',
        params: {},
        code: `
// Spherical projection (3D only)
vec2 project_to_2d(vec3 pos) {
    float r = length(pos);
    if (r < 0.001) return vec2(0.0, 0.0);

    float theta = atan(pos.y, pos.x);
    float phi = acos(pos.z / r);

    return vec2(theta, phi);
}

vec3 project_to_3d(vec3 pos) {
    float r = length(pos);
    if (r < 0.001) return vec3(0.0, 0.0, 0.0);

    float theta = atan(pos.y, pos.x);
    float phi = acos(pos.z / r);

    return vec3(theta, phi, r);  // Use radius as depth
}
`
    };
}

/**
 * Stereographic projection - project high-dimensional sphere to 2D
 * Projects from N-sphere to 2D plane
 */
export function stereographicMapper(dimensions) {
    return {
        name: 'Stereographic',
        params: {},
        code: `
// Stereographic projection
vec2 project_to_2d(vec${dimensions} pos) {
    float denom = 1.0 - pos[${dimensions - 1}];
    if (abs(denom) < 0.001) denom = 0.001;
    return vec2(pos[0] / denom, pos[1] / denom);
}

vec3 project_to_3d(vec${dimensions} pos) {
    float denom = 1.0 - pos[${dimensions - 1}];
    if (abs(denom) < 0.001) denom = 0.001;
    return vec3(pos[0] / denom, pos[1] / denom, pos[${dimensions - 1}]);
}
`
    };
}

/**
 * Get default mapper based on dimensions and type
 */
export function getMapper(type, dimensions, params = {}) {
    switch (type) {
        case 'select': {
            const dim1 = params.dim1 !== undefined ? params.dim1 : 0;
            const dim2 = params.dim2 !== undefined ? params.dim2 : Math.min(1, dimensions - 1);
            const depthDim = params.depthDim !== undefined ? params.depthDim : null;
            return selectMapper(dim1, dim2, dimensions, depthDim);
        }

        case 'project': {
            // Default: identity-like projection for first 2 dims
            const matrix = params.matrix || [
                [1, 0, ...Array(Math.max(0, dimensions - 2)).fill(0)],
                [0, 1, ...Array(Math.max(0, dimensions - 2)).fill(0)]
            ];
            return linearProjectionMapper(matrix, dimensions);
        }

        case 'orthographic': {
            const axis = params.axis !== undefined ? params.axis : dimensions - 1;
            return orthographicMapper(axis, dimensions);
        }

        case 'spherical':
            if (dimensions === 3) {
                return sphericalMapper();
            }
            // Fall back to select if not 3D
            return selectMapper(0, 1, dimensions);

        case 'stereographic':
            if (dimensions >= 3) {
                return stereographicMapper(dimensions);
            }
            return selectMapper(0, 1, dimensions);

        case 'custom': {
            const horizontalExpr = params.horizontalExpr || 'x';
            const verticalExpr = params.verticalExpr || 'y';
            const depthExpr = params.depthExpr || '';
            return customMapper(horizontalExpr, verticalExpr, depthExpr, dimensions);
        }

        default:
            return selectMapper(0, 1, dimensions);
    }
}

/**
 * Create custom mapper from user math expressions
 * @param {string} horizontalExpr - Math expression for horizontal coordinate
 * @param {string} verticalExpr - Math expression for vertical coordinate
 * @param {string} depthExpr - Optional math expression for depth coordinate
 * @param {number} dimensions - Number of dimensions
 */
export function customMapper(horizontalExpr, verticalExpr, depthExpr, dimensions) {
    // Parse expressions to GLSL
    const horizontalGLSL = parseExpression(horizontalExpr || 'x', dimensions);
    const verticalGLSL = parseExpression(verticalExpr || 'y', dimensions);
    const depthGLSL = depthExpr ? parseExpression(depthExpr, dimensions) : '0.0';

    return {
        name: 'Custom',
        params: { horizontalExpr, verticalExpr, depthExpr },
        code: `
// Custom mapper
vec2 project_to_2d(vec${dimensions} pos) {
    return vec2(
        ${horizontalGLSL},
        ${verticalGLSL}
    );
}

vec3 project_to_3d(vec${dimensions} pos) {
    return vec3(
        ${horizontalGLSL},
        ${verticalGLSL},
        ${depthGLSL}
    );
}
`
    };
}

/**
 * Get list of available mapper names
 */
export function getAvailableMappers(dimensions) {
    const mappers = ['select', 'project'];

    if (dimensions >= 3) {
        mappers.push('orthographic', 'stereographic');
    }

    if (dimensions === 3) {
        mappers.push('spherical');
    }

    return mappers;
}
