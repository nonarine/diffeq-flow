/**
 * Unit tests for parser tokenization and basic parsing
 * Tests basic expression parsing functionality
 */

const { test, describe, printSummary, exitWithResults, assertEqual, assertThrows } = require('../helpers/test-runner.cjs');

/**
 * Simplified tokenizer for testing (based on parser.js)
 */
const TOKEN_TYPES = {
    NUMBER: 'NUMBER',
    VARIABLE: 'VARIABLE',
    FUNCTION: 'FUNCTION',
    OPERATOR: 'OPERATOR',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA',
    EOF: 'EOF'
};

const OPERATORS = new Set(['+', '-', '*', '/', '^', '%']);
const BUILTIN_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh',
    'exp', 'log', 'log2', 'sqrt', 'abs',
    'floor', 'ceil', 'fract', 'sign',
    'min', 'max', 'pow', 'mod'
]);
const CONSTANTS = { 'pi': 'PI', 'e': 'E', 'PI': 'PI', 'E': 'E' };

function tokenize(expr) {
    const tokens = [];
    let i = 0;
    let lastToken = null;

    while (i < expr.length) {
        let char = expr[i];

        // Skip whitespace
        if (/\s/.test(char)) {
            i++;
            continue;
        }

        // Numbers
        if (/\d/.test(char) || (char === '.' && /\d/.test(expr[i + 1]))) {
            let num = '';
            while (i < expr.length && /[\d.]/.test(expr[i])) {
                num += expr[i++];
            }
            const token = { type: TOKEN_TYPES.NUMBER, value: parseFloat(num) };
            tokens.push(token);
            lastToken = token;
            continue;
        }

        // Variables, functions, and constants
        if (/[a-zA-Z_]/.test(char)) {
            let name = '';
            while (i < expr.length && /[a-zA-Z_0-9]/.test(expr[i])) {
                name += expr[i++];
            }

            let token;
            if (BUILTIN_FUNCTIONS.has(name)) {
                token = { type: TOKEN_TYPES.FUNCTION, value: name };
            } else if (CONSTANTS.hasOwnProperty(name)) {
                token = { type: TOKEN_TYPES.NUMBER, value: CONSTANTS[name], isConstant: true };
            } else {
                token = { type: TOKEN_TYPES.VARIABLE, value: name };
            }
            tokens.push(token);
            lastToken = token;
            continue;
        }

        // Operators
        if (OPERATORS.has(char)) {
            const token = { type: TOKEN_TYPES.OPERATOR, value: char };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }

        // Parentheses
        if (char === '(') {
            const token = { type: TOKEN_TYPES.LPAREN, value: '(' };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }
        if (char === ')') {
            const token = { type: TOKEN_TYPES.RPAREN, value: ')' };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }

        // Comma
        if (char === ',') {
            const token = { type: TOKEN_TYPES.COMMA, value: ',' };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }

        // Unknown character
        throw new Error(`Unknown character: ${char} at position ${i}`);
    }

    tokens.push({ type: TOKEN_TYPES.EOF, value: null });
    return tokens;
}

/**
 * Run all tests
 */
async function runTests() {
    // Test tokenization
    await describe('Tokenization', async () => {
        await test('tokenize simple number', async () => {
            const tokens = tokenize('42');
            assertEqual(tokens.length, 2); // number + EOF
            assertEqual(tokens[0].type, TOKEN_TYPES.NUMBER);
            assertEqual(tokens[0].value, 42);
        });

        await test('tokenize decimal number', async () => {
            const tokens = tokenize('3.14159');
            assertEqual(tokens[0].type, TOKEN_TYPES.NUMBER);
            assertEqual(tokens[0].value, 3.14159);
        });

        await test('tokenize variable', async () => {
            const tokens = tokenize('x');
            assertEqual(tokens[0].type, TOKEN_TYPES.VARIABLE);
            assertEqual(tokens[0].value, 'x');
        });

        await test('tokenize addition', async () => {
            const tokens = tokenize('x + y');
            assertEqual(tokens.length, 4); // var, op, var, EOF
            assertEqual(tokens[0].type, TOKEN_TYPES.VARIABLE);
            assertEqual(tokens[1].type, TOKEN_TYPES.OPERATOR);
            assertEqual(tokens[1].value, '+');
            assertEqual(tokens[2].type, TOKEN_TYPES.VARIABLE);
        });

        await test('tokenize multiplication', async () => {
            const tokens = tokenize('2 * x');
            assertEqual(tokens[0].type, TOKEN_TYPES.NUMBER);
            assertEqual(tokens[1].type, TOKEN_TYPES.OPERATOR);
            assertEqual(tokens[1].value, '*');
            assertEqual(tokens[2].type, TOKEN_TYPES.VARIABLE);
        });

        await test('tokenize function call', async () => {
            const tokens = tokenize('sin(x)');
            assertEqual(tokens[0].type, TOKEN_TYPES.FUNCTION);
            assertEqual(tokens[0].value, 'sin');
            assertEqual(tokens[1].type, TOKEN_TYPES.LPAREN);
            assertEqual(tokens[2].type, TOKEN_TYPES.VARIABLE);
            assertEqual(tokens[3].type, TOKEN_TYPES.RPAREN);
        });

        await test('tokenize nested functions', async () => {
            const tokens = tokenize('cos(sin(x))');
            assertEqual(tokens[0].type, TOKEN_TYPES.FUNCTION);
            assertEqual(tokens[0].value, 'cos');
            assertEqual(tokens[2].type, TOKEN_TYPES.FUNCTION);
            assertEqual(tokens[2].value, 'sin');
        });

        await test('tokenize constant pi', async () => {
            const tokens = tokenize('pi');
            assertEqual(tokens[0].type, TOKEN_TYPES.NUMBER);
            assertEqual(tokens[0].value, 'PI');
        });

        await test('tokenize constant e', async () => {
            const tokens = tokenize('e');
            assertEqual(tokens[0].type, TOKEN_TYPES.NUMBER);
            assertEqual(tokens[0].value, 'E');
        });

        await test('tokenize complex expression', async () => {
            const tokens = tokenize('sin(x) + cos(y) * 2');
            // sin, (, x, ), +, cos, (, y, ), *, 2, EOF
            assertEqual(tokens.length, 12);
        });

        await test('tokenize with parentheses', async () => {
            const tokens = tokenize('(x + y) * z');
            assertEqual(tokens[0].type, TOKEN_TYPES.LPAREN);
            assertEqual(tokens[4].type, TOKEN_TYPES.RPAREN);
        });

        await test('tokenize function with multiple args', async () => {
            const tokens = tokenize('pow(x, 2)');
            assertEqual(tokens[0].type, TOKEN_TYPES.FUNCTION);
            assertEqual(tokens[0].value, 'pow');
            assertEqual(tokens[3].type, TOKEN_TYPES.COMMA);
        });

        await test('handle whitespace correctly', async () => {
            const tokens1 = tokenize('x+y');
            const tokens2 = tokenize('x + y');
            const tokens3 = tokenize('  x  +  y  ');
            assertEqual(tokens1.length, tokens2.length);
            assertEqual(tokens2.length, tokens3.length);
        });
    });

    // Test error handling
    await describe('Error Handling', async () => {
        await test('reject unknown characters', async () => {
            assertThrows(() => tokenize('x $ y'));
        });

        await test('handle empty expression', async () => {
            const tokens = tokenize('');
            assertEqual(tokens.length, 1); // Just EOF
            assertEqual(tokens[0].type, TOKEN_TYPES.EOF);
        });

        await test('handle expression with only whitespace', async () => {
            const tokens = tokenize('   ');
            assertEqual(tokens.length, 1); // Just EOF
        });
    });

    // Test specific math expressions
    await describe('Common Math Expressions', async () => {
        await test('linear expression: x + y', async () => {
            const tokens = tokenize('x + y');
            assertEqual(tokens[0].value, 'x');
            assertEqual(tokens[1].value, '+');
            assertEqual(tokens[2].value, 'y');
        });

        await test('quadratic: x^2', async () => {
            const tokens = tokenize('x^2');
            assertEqual(tokens[0].value, 'x');
            assertEqual(tokens[1].value, '^');
            assertEqual(tokens[2].value, 2);
        });

        await test('circular motion: -y, x', async () => {
            const tokens1 = tokenize('-y');
            assertEqual(tokens1[0].value, '-');
            assertEqual(tokens1[1].value, 'y');

            const tokens2 = tokenize('x');
            assertEqual(tokens2[0].value, 'x');
        });

        await test('Lorenz x component: sigma * (y - x)', async () => {
            const tokens = tokenize('sigma * (y - x)');
            // sigma, *, (, y, -, x, ), EOF
            assertEqual(tokens.length, 8);
            assertEqual(tokens[0].value, 'sigma');
            assertEqual(tokens[1].value, '*');
        });

        await test('exponential growth: exp(x)', async () => {
            const tokens = tokenize('exp(x)');
            assertEqual(tokens[0].type, TOKEN_TYPES.FUNCTION);
            assertEqual(tokens[0].value, 'exp');
        });
    });

    // Test variable names
    await describe('Variable Names', async () => {
        await test('single letter variables', async () => {
            const vars = ['x', 'y', 'z', 'w', 'u', 'v'];
            vars.forEach(v => {
                const tokens = tokenize(v);
                assertEqual(tokens[0].type, TOKEN_TYPES.VARIABLE);
                assertEqual(tokens[0].value, v);
            });
        });

        await test('multi-letter variables', async () => {
            const tokens = tokenize('sigma');
            assertEqual(tokens[0].type, TOKEN_TYPES.VARIABLE);
            assertEqual(tokens[0].value, 'sigma');
        });

        await test('variables with underscores', async () => {
            const tokens = tokenize('my_var');
            assertEqual(tokens[0].type, TOKEN_TYPES.VARIABLE);
            assertEqual(tokens[0].value, 'my_var');
        });

        await test('variables with numbers', async () => {
            const tokens = tokenize('x1');
            assertEqual(tokens[0].type, TOKEN_TYPES.VARIABLE);
            assertEqual(tokens[0].value, 'x1');
        });
    });
}

// Run all tests
(async () => {
    try {
        await runTests();
        printSummary();
        exitWithResults();
    } catch (error) {
        console.error('Test runner crashed:', error);
        process.exit(1);
    }
})();
