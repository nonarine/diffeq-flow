import { parseExpressionToTeX } from './src/math/parser.js';

console.log('=== Testing LaTeX Conversion ===\n');

const tests = [
    { expr: 'x / y', dims: 2, expected: '\\frac{x}{y}' },
    { expr: '(x + y) / z', dims: 3, expected: '\\frac{x + y}{z}' },
    { expr: 'sin(x) / (y + 1)', dims: 2, expected: '\\frac{\\sin(x)}{y + 1}' },
    { expr: 'x / y / z', dims: 3, expected: 'nested fractions' },
    { expr: '1 / (x^2 + y^2)', dims: 2, expected: '\\frac{1}{...}' }
];

tests.forEach(({ expr, dims, expected }) => {
    const latex = parseExpressionToTeX(expr, dims);
    console.log(`Expression: ${expr}`);
    console.log(`Expected: ${expected}`);
    console.log(`Got: ${latex}`);
    console.log('---\n');
});
