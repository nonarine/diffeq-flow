/**
 * Math expression parser that converts user expressions to GLSL code
 * Supports standard math operations and functions
 */

// Tokenizer
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

const OPERATORS = {
    '+': { precedence: 1, associativity: 'L' },
    '-': { precedence: 1, associativity: 'L' },
    '*': { precedence: 2, associativity: 'L' },
    '/': { precedence: 2, associativity: 'L' },
    '^': { precedence: 3, associativity: 'R' },
    '%': { precedence: 2, associativity: 'L' }
};

const FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh',
    'exp', 'log', 'log2', 'sqrt', 'abs',
    'floor', 'ceil', 'fract', 'sign',
    'min', 'max', 'pow', 'mod',
    'length', 'normalize', 'dot'
]);

const CONSTANTS = {
    'pi': 'PI',
    'e': 'E',
    'PI': 'PI',
    'E': 'E'
};

/**
 * Tokenize an expression string
 */
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
            if (FUNCTIONS.has(name)) {
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

        // Operators (handle unary minus)
        if (OPERATORS.hasOwnProperty(char)) {
            // Check if this is a unary minus
            if (char === '-' && (lastToken === null ||
                lastToken.type === TOKEN_TYPES.OPERATOR ||
                lastToken.type === TOKEN_TYPES.LPAREN ||
                lastToken.type === TOKEN_TYPES.COMMA)) {
                // Insert a 0 to make it binary: -x becomes 0-x
                tokens.push({ type: TOKEN_TYPES.NUMBER, value: 0 });
            }
            const token = { type: TOKEN_TYPES.OPERATOR, value: char };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }

        // Parentheses
        if (char === '(') {
            const token = { type: TOKEN_TYPES.LPAREN };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }
        if (char === ')') {
            const token = { type: TOKEN_TYPES.RPAREN };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }

        // Comma
        if (char === ',') {
            const token = { type: TOKEN_TYPES.COMMA };
            tokens.push(token);
            lastToken = token;
            i++;
            continue;
        }

        throw new Error(`Unexpected character: ${char} at position ${i}`);
    }

    tokens.push({ type: TOKEN_TYPES.EOF });
    return tokens;
}

/**
 * Parse tokens into an AST using Shunting Yard algorithm
 */
function parse(tokens) {
    const output = [];
    const operators = [];
    let i = 0;

    const peek = () => tokens[i];
    const consume = () => tokens[i++];

    while (peek().type !== TOKEN_TYPES.EOF) {
        const token = consume();

        if (token.type === TOKEN_TYPES.NUMBER) {
            output.push(token);
        } else if (token.type === TOKEN_TYPES.VARIABLE) {
            output.push(token);
        } else if (token.type === TOKEN_TYPES.FUNCTION) {
            operators.push(token);
        } else if (token.type === TOKEN_TYPES.COMMA) {
            while (operators.length > 0 && operators[operators.length - 1].type !== TOKEN_TYPES.LPAREN) {
                output.push(operators.pop());
            }
        } else if (token.type === TOKEN_TYPES.OPERATOR) {
            const o1 = token;
            while (operators.length > 0) {
                const o2 = operators[operators.length - 1];
                if (o2.type === TOKEN_TYPES.OPERATOR) {
                    const op1 = OPERATORS[o1.value];
                    const op2 = OPERATORS[o2.value];
                    if ((op1.associativity === 'L' && op1.precedence <= op2.precedence) ||
                        (op1.associativity === 'R' && op1.precedence < op2.precedence)) {
                        output.push(operators.pop());
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            operators.push(o1);
        } else if (token.type === TOKEN_TYPES.LPAREN) {
            operators.push(token);
        } else if (token.type === TOKEN_TYPES.RPAREN) {
            while (operators.length > 0 && operators[operators.length - 1].type !== TOKEN_TYPES.LPAREN) {
                output.push(operators.pop());
            }
            if (operators.length === 0) {
                throw new Error('Mismatched parentheses');
            }
            operators.pop(); // Remove the LPAREN

            // If there's a function on top, pop it to output
            if (operators.length > 0 && operators[operators.length - 1].type === TOKEN_TYPES.FUNCTION) {
                output.push(operators.pop());
            }
        }
    }

    while (operators.length > 0) {
        const op = operators.pop();
        if (op.type === TOKEN_TYPES.LPAREN) {
            throw new Error('Mismatched parentheses');
        }
        output.push(op);
    }

    return output;
}

/**
 * Convert RPN AST to JavaScript code
 */
function toJS(rpn, variables) {
    const stack = [];
    const varSet = new Set(variables);

    // Add velocity variables to allowed set
    const velocityVars = ['dx', 'dy', 'dz', 'dw', 'du', 'dv'];
    velocityVars.forEach(v => varSet.add(v));

    // Add animation alpha variable
    varSet.add('a');

    for (const token of rpn) {
        if (token.type === TOKEN_TYPES.NUMBER) {
            if (token.isConstant) {
                // Constants like PI, E
                const constMap = { 'PI': 'Math.PI', 'E': 'Math.E' };
                stack.push(constMap[token.value] || token.value.toString());
            } else {
                stack.push(token.value.toString());
            }
        } else if (token.type === TOKEN_TYPES.VARIABLE) {
            if (varSet.has(token.value)) {
                stack.push(token.value);
            } else {
                throw new Error(`Unknown variable: ${token.value}. Available: ${variables.join(', ')}, dx, dy, dz, dw, du, dv, a (animation alpha)`);
            }
        } else if (token.type === TOKEN_TYPES.OPERATOR) {
            if (stack.length < 2) throw new Error('Invalid expression');
            const b = stack.pop();
            const a = stack.pop();

            if (token.value === '^') {
                stack.push(`Math.pow(${a}, ${b})`);
            } else {
                stack.push(`(${a} ${token.value} ${b})`);
            }
        } else if (token.type === TOKEN_TYPES.FUNCTION) {
            const argCount = getFunctionArgCount(token.value);
            if (stack.length < argCount) throw new Error(`Not enough arguments for ${token.value}`);

            const args = [];
            for (let i = 0; i < argCount; i++) {
                args.unshift(stack.pop());
            }

            // Map GLSL functions to JS Math functions
            const funcMap = {
                'mod': '%',
                'fract': '(x => x - Math.floor(x))',
                'mix': '(a, b, t) => a * (1 - t) + b * t'
            };

            const funcName = funcMap[token.value] || `Math.${token.value}`;
            stack.push(`${funcName}(${args.join(', ')})`);
        }
    }

    if (stack.length !== 1) {
        throw new Error('Invalid expression');
    }

    return stack[0];
}

/**
 * Convert RPN AST to GLSL code
 */
function toGLSL(rpn, variables) {
    const stack = [];
    const varMap = {};

    // Map variable names to swizzle notation
    const swizzles = ['x', 'y', 'z', 'w', 'u', 'v'];
    const velocityVars = ['dx', 'dy', 'dz', 'dw', 'du', 'dv'];

    // Map position variables (x, y, z, w, u, v)
    variables.forEach((v, i) => {
        if (i < 6) {
            varMap[v] = `pos.${swizzles[i]}`;
        } else {
            varMap[v] = `pos[${i}]`;
        }
    });

    // Map velocity variables (dx, dy, dz, dw, du, dv)
    velocityVars.forEach((v, i) => {
        if (i < 6) {
            varMap[v] = `velocity.${swizzles[i]}`;
        } else {
            varMap[v] = `velocity[${i}]`;
        }
    });

    // Map animation alpha variable to uniform
    varMap['a'] = 'u_alpha';

    for (const token of rpn) {
        if (token.type === TOKEN_TYPES.NUMBER) {
            if (token.isConstant) {
                // Constants like PI, E
                const constMap = { 'PI': '3.14159265359', 'E': '2.71828182846' };
                stack.push(constMap[token.value] || token.value.toString());
            } else {
                // Convert to GLSL float literal (ensure .0 suffix for integers)
                let numStr = token.value.toString();
                if (!numStr.includes('.') && !numStr.includes('e') && !numStr.includes('E')) {
                    numStr += '.0';
                }
                stack.push(numStr);
            }
        } else if (token.type === TOKEN_TYPES.VARIABLE) {
            if (varMap.hasOwnProperty(token.value)) {
                stack.push(varMap[token.value]);
            } else {
                throw new Error(`Unknown variable: ${token.value}. Available: ${variables.join(', ')}`);
            }
        } else if (token.type === TOKEN_TYPES.OPERATOR) {
            if (stack.length < 2) throw new Error('Invalid expression');
            const b = stack.pop();
            const a = stack.pop();

            if (token.value === '^') {
                // Optimize: expand small integer exponents instead of using pow()
                const expMatch = b.match(/^(\d+)\.0$/);
                if (expMatch) {
                    const n = parseInt(expMatch[1]);
                    if (n === 0) {
                        stack.push('1.0');
                    } else if (n === 1) {
                        stack.push(a);
                    } else if (n <= 4) {
                        // Expand x^n as x*x*...
                        stack.push(`(${Array(n).fill(a).join(' * ')})`);
                    } else {
                        stack.push(`pow(${a}, ${b})`);
                    }
                } else {
                    stack.push(`pow(${a}, ${b})`);
                }
            } else if (token.value === '%') {
                stack.push(`mod(${a}, ${b})`);
            } else {
                stack.push(`(${a} ${token.value} ${b})`);
            }
        } else if (token.type === TOKEN_TYPES.FUNCTION) {
            const argCount = getFunctionArgCount(token.value);
            if (stack.length < argCount) throw new Error(`Not enough arguments for ${token.value}`);

            const args = [];
            for (let i = 0; i < argCount; i++) {
                args.unshift(stack.pop());
            }

            stack.push(`${token.value}(${args.join(', ')})`);
        }
    }

    if (stack.length !== 1) {
        throw new Error('Invalid expression');
    }

    return stack[0];
}

/**
 * Get the number of arguments a function expects
 */
function getFunctionArgCount(funcName) {
    const multiArg = new Set(['min', 'max', 'pow', 'mod', 'dot', 'atan2']);
    return multiArg.has(funcName) ? 2 : 1;
}

/**
 * Main parser function
 * @param {string} expression - Math expression to parse
 * @param {number} dimensions - Number of dimensions
 * @returns {string} GLSL code
 */
export function parseExpression(expression, dimensions) {
    const variables = ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);

    try {
        const tokens = tokenize(expression);
        const rpn = parse(tokens);
        const glsl = toGLSL(rpn, variables);
        return glsl;
    } catch (error) {
        throw new Error(`Parse error: ${error.message}`);
    }
}

/**
 * Parse all dimension expressions
 * @param {string[]} expressions - Array of expressions, one per dimension
 * @returns {string[]} Array of GLSL code strings
 */
export function parseVectorField(expressions) {
    const dimensions = expressions.length;
    return expressions.map((expr, i) => {
        try {
            return parseExpression(expr.trim(), dimensions);
        } catch (error) {
            throw new Error(`Error in dimension ${i}: ${error.message}`);
        }
    });
}

/**
 * Create JavaScript velocity evaluator functions
 * @param {string[]} expressions - Array of expressions, one per dimension
 * @returns {Function[]} Array of evaluator functions
 */
export function createVelocityEvaluators(expressions) {
    const dimensions = expressions.length;
    const variables = ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);

    return expressions.map((expr, i) => {
        try {
            const tokens = tokenize(expr.trim());
            const rpn = parse(tokens);
            const jsCode = toJS(rpn, variables);

            // Create a function that takes position components as arguments
            // e.g., for 2D: (x, y) => expression
            const funcBody = `return ${jsCode};`;
            return new Function(...variables, funcBody);
        } catch (error) {
            throw new Error(`Error creating evaluator for dimension ${i}: ${error.message}`);
        }
    });
}
