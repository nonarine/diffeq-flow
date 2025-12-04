/**
 * Math expression parser that converts user expressions to GLSL code
 * Supports standard math operations and functions
 *
 * ARCHITECTURE:
 * 1. Parse user input string to AST (Abstract Syntax Tree)
 * 2. Keep original AST for display (LaTeX) - preserves user intent (x/y, not x*y^-1)
 * 3. Clone AST for manipulation:
 *    - Substitute custom function calls with their definitions
 *    - Apply algebraic transformations (done externally via CAS)
 * 4. Generate code from AST:
 *    - toGLSL(): With GLSL-specific optimizations (x^2 → x*x)
 *    - toTeX(): Preserves mathematical notation (x/y → \frac{x}{y})
 *    - toJS(): Standard JavaScript Math library calls
 *
 * IMPORTANT:
 * - Optimizations like integer power expansion are ONLY in toGLSL()
 * - LaTeX and JS generation preserve the original expression structure
 * - Function substitution happens on the AST before code generation
 */

import { logger } from '../utils/debug-logger.js';

// ============================================================================
// Expression Interface
// ============================================================================

/**
 * Abstract interface for mathematical expressions
 * This allows us to swap implementations (native AST, Maxima, etc.)
 * without changing calling code
 */
class IExpression {
    /**
     * Convert to GLSL code
     * @param {string[]} variables - Available variable names
     * @param {object} options - Options for code generation
     * @returns {string} GLSL code
     */
    toGLSL(variables, options = {}) {
        throw new Error('Must implement toGLSL()');
    }

    /**
     * Convert to LaTeX notation
     * @param {string[]} variables - Available variable names
     * @returns {string} LaTeX code
     */
    toTeX(variables) {
        throw new Error('Must implement toTeX()');
    }

    /**
     * Convert to JavaScript code
     * @param {string[]} variables - Available variable names
     * @returns {string} JavaScript code
     */
    toJS(variables) {
        throw new Error('Must implement toJS()');
    }

    /**
     * Clone this expression (deep copy)
     * @returns {IExpression} Cloned expression
     */
    clone() {
        throw new Error('Must implement clone()');
    }

    /**
     * Substitute custom function calls with their definitions
     * @param {object} functionDefs - Map of function name -> IExpression
     * @returns {IExpression} New expression with substitutions applied
     */
    substitute(functionDefs) {
        throw new Error('Must implement substitute()');
    }
}

// ============================================================================
// Native Expression Implementation (wraps AST)
// ============================================================================

/**
 * Native expression implementation using our internal AST
 */
class NativeExpression extends IExpression {
    constructor(ast) {
        super();
        this.ast = ast;
    }

    toGLSL(variables, options = {}) {
        return astToGLSL(this.ast, variables, options.useDirectMapping || false, options.posVarName || 'pos');
    }

    toTeX(variables) {
        return astToTeX(this.ast, variables);
    }

    toJS(variables) {
        return astToJS(this.ast, variables);
    }

    clone() {
        return new NativeExpression(cloneAST(this.ast));
    }

    substitute(functionDefs) {
        // Convert IExpression function definitions to AST format
        const astFunctionDefs = {};
        for (const [name, expr] of Object.entries(functionDefs)) {
            if (expr instanceof NativeExpression) {
                // Extract params from custom function registry
                if (customFunctions[name]) {
                    astFunctionDefs[name] = {
                        params: customFunctions[name].params,
                        bodyAST: expr.ast
                    };
                }
            }
        }

        const substitutedAST = substituteAST(this.ast, astFunctionDefs);
        return new NativeExpression(substitutedAST);
    }
}

// ============================================================================
// AST Node Definitions (Internal)
// ============================================================================

/**
 * AST Node base class (internal - not part of public API)
 */
class ASTNode {
    constructor(type) {
        this.type = type;
    }
}

/**
 * Number literal node
 */
class NumberNode extends ASTNode {
    constructor(value, isConstant = false) {
        super('number');
        this.value = value;
        this.isConstant = isConstant;
    }
}

/**
 * Variable reference node
 */
class VariableNode extends ASTNode {
    constructor(name) {
        super('variable');
        this.name = name;
    }
}

/**
 * Binary operation node (+, -, *, /, ^, %)
 */
class BinaryOpNode extends ASTNode {
    constructor(operator, left, right) {
        super('binaryOp');
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

/**
 * Unary operation node (currently just unary minus)
 */
class UnaryOpNode extends ASTNode {
    constructor(operator, operand) {
        super('unaryOp');
        this.operator = operator;
        this.operand = operand;
    }
}

/**
 * Function call node
 */
class FunctionCallNode extends ASTNode {
    constructor(name, args) {
        super('functionCall');
        this.name = name;
        this.args = args;
    }
}

// ============================================================================
// Tokenizer
// ============================================================================

const TOKEN_TYPES = {
    NUMBER: 'NUMBER',
    VARIABLE: 'VARIABLE',
    FUNCTION: 'FUNCTION',
    OPERATOR: 'OPERATOR',
    UNARY_MINUS: 'UNARY_MINUS',
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

const BUILTIN_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh',
    'exp', 'log', 'log2', 'sqrt', 'abs',
    'floor', 'ceil', 'fract', 'sign',
    'min', 'max', 'pow', 'mod',
    'length', 'normalize', 'dot'
]);

// Custom function registry
// Format: { functionName: { params: ['x', 'y', ...], body: 'expression' } }
const customFunctions = {};

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
            if (BUILTIN_FUNCTIONS.has(name) || customFunctions.hasOwnProperty(name)) {
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
                lastToken.type === TOKEN_TYPES.UNARY_MINUS ||
                lastToken.type === TOKEN_TYPES.LPAREN ||
                lastToken.type === TOKEN_TYPES.COMMA)) {
                // This is a unary minus
                const token = { type: TOKEN_TYPES.UNARY_MINUS };
                tokens.push(token);
                lastToken = token;
                i++;
                continue;
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
        } else if (token.type === TOKEN_TYPES.UNARY_MINUS) {
            // Unary minus has high precedence (higher than ^, right-associative)
            // Pop operators with higher or equal precedence
            while (operators.length > 0) {
                const o2 = operators[operators.length - 1];
                // Only pop other unary minus operators (right-associative)
                // Don't pop binary operators or functions
                if (o2.type === TOKEN_TYPES.UNARY_MINUS) {
                    output.push(operators.pop());
                } else {
                    break;
                }
            }
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
                } else if (o2.type === TOKEN_TYPES.UNARY_MINUS) {
                    // Unary minus has precedence 2.5 (between * and ^)
                    // -x^2 should parse as -(x^2), so ^ has higher precedence
                    // 2*-x should parse as 2*(-x), so * pops unary minus
                    const op1 = OPERATORS[o1.value];
                    if (op1.precedence <= 2) {
                        // Current operator is + or - or * or /
                        // Pop unary minus (it has higher precedence, so it evaluates first)
                        output.push(operators.pop());
                    } else {
                        // Current operator is ^
                        // Don't pop unary minus (^ binds tighter than unary minus)
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

    return rpnToAST(output);
}

/**
 * Convert RPN token stream to AST
 * @param {Array} rpn - RPN token array from Shunting Yard
 * @returns {ASTNode} - Root node of AST
 */
function rpnToAST(rpn) {
    const stack = [];

    for (const token of rpn) {
        if (token.type === TOKEN_TYPES.NUMBER) {
            stack.push(new NumberNode(token.value, token.isConstant));
        } else if (token.type === TOKEN_TYPES.VARIABLE) {
            stack.push(new VariableNode(token.value));
        } else if (token.type === TOKEN_TYPES.UNARY_MINUS) {
            if (stack.length < 1) throw new Error('Invalid expression');
            const operand = stack.pop();
            stack.push(new UnaryOpNode('-', operand));
        } else if (token.type === TOKEN_TYPES.OPERATOR) {
            if (stack.length < 2) throw new Error('Invalid expression');
            const right = stack.pop();
            const left = stack.pop();
            stack.push(new BinaryOpNode(token.value, left, right));
        } else if (token.type === TOKEN_TYPES.FUNCTION) {
            const argCount = getFunctionArgCount(token.value);
            if (stack.length < argCount) throw new Error(`Not enough arguments for ${token.value}`);

            const args = [];
            for (let i = 0; i < argCount; i++) {
                args.unshift(stack.pop());
            }
            stack.push(new FunctionCallNode(token.value, args));
        }
    }

    if (stack.length !== 1) {
        throw new Error('Invalid expression');
    }

    return stack[0];
}

/**
 * Clone an AST (deep copy)
 * @param {ASTNode} node - AST node to clone
 * @returns {ASTNode} Cloned node
 */
function cloneAST(node) {
    if (node.type === 'number') {
        return new NumberNode(node.value, node.isConstant);
    } else if (node.type === 'variable') {
        return new VariableNode(node.name);
    } else if (node.type === 'unaryOp') {
        return new UnaryOpNode(node.operator, cloneAST(node.operand));
    } else if (node.type === 'binaryOp') {
        return new BinaryOpNode(node.operator, cloneAST(node.left), cloneAST(node.right));
    } else if (node.type === 'functionCall') {
        return new FunctionCallNode(node.name, node.args.map(arg => cloneAST(arg)));
    }
    throw new Error(`Unknown node type: ${node.type}`);
}

/**
 * Substitute variables in an AST
 * @param {ASTNode} node - AST node
 * @param {Object} substitutions - Map of variable name -> ASTNode
 * @returns {ASTNode} New AST with substitutions applied
 */
function substituteVariables(node, substitutions) {
    if (node.type === 'number') {
        return cloneAST(node);
    } else if (node.type === 'variable') {
        // If this variable should be substituted, return the substitution (cloned)
        if (substitutions[node.name]) {
            return cloneAST(substitutions[node.name]);
        } else {
            return cloneAST(node);
        }
    } else if (node.type === 'unaryOp') {
        return new UnaryOpNode(node.operator, substituteVariables(node.operand, substitutions));
    } else if (node.type === 'binaryOp') {
        return new BinaryOpNode(
            node.operator,
            substituteVariables(node.left, substitutions),
            substituteVariables(node.right, substitutions)
        );
    } else if (node.type === 'functionCall') {
        // Recursively substitute in arguments
        const newArgs = node.args.map(arg => substituteVariables(arg, substitutions));
        return new FunctionCallNode(node.name, newArgs);
    }
    throw new Error(`Unknown node type: ${node.type}`);
}

/**
 * Substitute function calls in AST with their definitions
 * @param {ASTNode} node - AST node
 * @param {Object} functionDefs - Map of function name -> {params: string[], bodyAST: ASTNode}
 * @returns {ASTNode} New AST with function calls replaced by their bodies
 */
function substituteAST(node, functionDefs) {
    if (node.type === 'number' || node.type === 'variable') {
        return cloneAST(node);
    } else if (node.type === 'unaryOp') {
        return new UnaryOpNode(node.operator, substituteAST(node.operand, functionDefs));
    } else if (node.type === 'binaryOp') {
        return new BinaryOpNode(
            node.operator,
            substituteAST(node.left, functionDefs),
            substituteAST(node.right, functionDefs)
        );
    } else if (node.type === 'functionCall') {
        // Check if this is a custom function that should be substituted
        if (functionDefs[node.name]) {
            const funcDef = functionDefs[node.name];

            // Recursively substitute in the arguments first
            const evalArgs = node.args.map(arg => substituteAST(arg, functionDefs));

            // Build substitution map: parameter name -> argument AST
            const substitutions = {};
            funcDef.params.forEach((param, i) => {
                substitutions[param] = evalArgs[i];
            });

            // Substitute parameters with arguments in the function body
            return substituteVariables(funcDef.bodyAST, substitutions);
        } else {
            // Built-in function or unknown - just substitute in arguments
            const newArgs = node.args.map(arg => substituteAST(arg, functionDefs));
            return new FunctionCallNode(node.name, newArgs);
        }
    }
    throw new Error(`Unknown node type: ${node.type}`);
}

/**
 * Pretty-print AST tree for debugging
 * @param {ASTNode} node - AST node to print
 * @param {number} indent - Indentation level
 * @returns {string} Pretty-printed tree
 */
function prettyPrintAST(node, indent = 0) {
    const indentStr = '  '.repeat(indent);

    if (node.type === 'number') {
        if (node.isConstant) {
            return `${indentStr}NumberNode(${node.value} [constant])`;
        } else {
            return `${indentStr}NumberNode(${node.value})`;
        }
    } else if (node.type === 'variable') {
        return `${indentStr}VariableNode(${node.name})`;
    } else if (node.type === 'unaryOp') {
        const operandStr = prettyPrintAST(node.operand, indent + 1);
        return `${indentStr}UnaryOpNode(${node.operator})\n${operandStr}`;
    } else if (node.type === 'binaryOp') {
        const leftStr = prettyPrintAST(node.left, indent + 1);
        const rightStr = prettyPrintAST(node.right, indent + 1);
        return `${indentStr}BinaryOpNode(${node.operator})\n${leftStr}\n${rightStr}`;
    } else if (node.type === 'functionCall') {
        const argsStr = node.args.map(arg => prettyPrintAST(arg, indent + 1)).join('\n');
        return `${indentStr}FunctionCallNode(${node.name})\n${argsStr}`;
    }
    return `${indentStr}Unknown(${node.type})`;
}

/**
 * Convert AST to JavaScript code
 * @param {ASTNode} node - AST node
 * @param {string[]} variables - Available variable names
 * @returns {string} JavaScript code
 */
function astToJS(node, variables) {
    const varSet = new Set(variables);
    const velocityVars = ['dx', 'dy', 'dz', 'dw', 'du', 'dv'];
    velocityVars.forEach(v => varSet.add(v));
    varSet.add('a'); // Animation alpha

    function walk(node) {
        if (node.type === 'number') {
            if (node.isConstant) {
                const constMap = { 'PI': 'Math.PI', 'E': 'Math.E' };
                return constMap[node.value] || node.value.toString();
            } else {
                return node.value.toString();
            }
        } else if (node.type === 'variable') {
            if (varSet.has(node.name)) {
                return node.name;
            } else {
                throw new Error(`Unknown variable: ${node.name}. Available: ${variables.join(', ')}, dx, dy, dz, dw, du, dv, a`);
            }
        } else if (node.type === 'unaryOp') {
            const operand = walk(node.operand);
            return `(-${operand})`;
        } else if (node.type === 'binaryOp') {
            const left = walk(node.left);
            const right = walk(node.right);
            if (node.operator === '^') {
                return `Math.pow(${left}, ${right})`;
            } else {
                return `(${left} ${node.operator} ${right})`;
            }
        } else if (node.type === 'functionCall') {
            const args = node.args.map(arg => walk(arg));
            const funcMap = {
                'mod': '%',
                'fract': '(x => x - Math.floor(x))',
                'mix': '(a, b, t) => a * (1 - t) + b * t'
            };
            const funcName = funcMap[node.name] || `Math.${node.name}`;
            return `${funcName}(${args.join(', ')})`;
        }
        throw new Error(`Unknown node type: ${node.type}`);
    }

    return walk(node);
}

/**
 * GLSL optimization: expand small integer powers to multiplication
 * e.g., x^2 -> x*x, x^3 -> x*x*x (avoids pow() call)
 * @param {string} base - Base expression (already GLSL code)
 * @param {string} exponent - Exponent expression (already GLSL code)
 * @returns {string} Optimized GLSL code
 */
function optimizeIntegerPower(base, exponent) {

    const expMatch = exponent.match(/^\(*(\-?[\d]+)\.?0?\)*$/);

    // Check if exponent is a small integer literal
    if (expMatch) {

        const n = parseInt(expMatch[1]);

        if (n === 0) {
            return '1.0';
        } else if (n === 1) {
            return base;
        } else if (n === -1) {
            return `1.0 / base`;
        }else {
            // convert negative exponent to division
            const neg = (n < 0);

            // Expand x^n as x*x*... (faster than pow() for small n)
            return `${(neg ? '1.0/' : '')}(${Array(Math.abs(n)).fill(base).join(' * ')})`;
        }
    }
    // Use pow() for non-integer
    return `pow(${base}, ${exponent})`;
}

/**
 * Convert AST to GLSL code
 * @param {ASTNode} node - AST node
 * @param {string[]} variables - Available variable names
 * @param {boolean} useDirectMapping - Use direct variable mapping
 * @param {string} posVarName - GLSL position variable name
 * @returns {string} GLSL code
 */
function astToGLSL(node, variables, useDirectMapping = false, posVarName = 'pos') {
    const varMap = {};

    if (useDirectMapping) {
        // Direct mapping for custom functions - variables map to themselves
        variables.forEach(v => {
            varMap[v] = v;
        });
    } else {
        // Map variable names to swizzle notation (for vector fields)
        const swizzles = ['x', 'y', 'z', 'w', 'u', 'v'];
        const velocityVars = ['dx', 'dy', 'dz', 'dw', 'du', 'dv'];

        // Map position variables (x, y, z, w, u, v) or custom variables (r, theta, etc.)
        variables.forEach((v, i) => {
            if (i < 6) {
                varMap[v] = `${posVarName}.${swizzles[i]}`;
            } else {
                varMap[v] = `${posVarName}[${i}]`;
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
    }

    function walk(node) {
        if (node.type === 'number') {
            if (node.isConstant) {
                // Constants like PI, E
                const constMap = { 'PI': '3.14159265359', 'E': '2.71828182846' };
                return constMap[node.value] || node.value.toString();
            } else {
                // Convert to GLSL float literal (ensure .0 suffix for integers)
                let numStr = node.value.toString();
                if (!numStr.includes('.') && !numStr.includes('e') && !numStr.includes('E')) {
                    numStr += '.0';
                }
                return numStr;
            }
        } else if (node.type === 'variable') {
            if (varMap.hasOwnProperty(node.name)) {
                return varMap[node.name];
            } else {
                throw new Error(`Unknown variable: ${node.name}. Available: ${variables.join(', ')}`);
            }
        } else if (node.type === 'unaryOp') {
            const operand = walk(node.operand);
            return `(-${operand})`;
        } else if (node.type === 'binaryOp') {
            const left = walk(node.left);
            const right = walk(node.right);

            if (node.operator === '^') {
                // GLSL-specific optimization: expand small integer powers
                return optimizeIntegerPower(left, right);
            } else if (node.operator === '%') {
                return `mod(${left}, ${right})`;
            } else {
                return `(${left} ${node.operator} ${right})`;
            }
        } else if (node.type === 'functionCall') {
            const args = node.args.map(arg => walk(arg));

            // Map function names to GLSL equivalents
            let glslFunc = node.name;
            if (node.name === 'atan2') {
                // GLSL uses atan(y, x) instead of atan2(y, x)
                glslFunc = 'atan';
            }

            return `${glslFunc}(${args.join(', ')})`;
        }
        throw new Error(`Unknown node type: ${node.type}`);
    }

    return walk(node);
}

/**
 * Convert AST to LaTeX code
 * @param {ASTNode} node - AST node
 * @param {string[]} variables - Available variable names
 * @returns {string} LaTeX code
 */
function astToTeX(node, variables) {
    const varSet = new Set(variables);

    // Add velocity variables to allowed set
    const velocityVars = ['dx', 'dy', 'dz', 'dw', 'du', 'dv'];
    velocityVars.forEach(v => varSet.add(v));

    // Add animation alpha variable
    varSet.add('a');

    /**
     * Check if a node needs parentheses when used as base of power
     */
    function needsParensForPower(node) {
        // Binary operations and unary minus need parens: (x+2)^2, (-x)^2
        // Simple values don't: x^2, sin(x)^2
        return node.type === 'binaryOp' || node.type === 'unaryOp';
    }

    /**
     * Check if a node needs parentheses for multiplication
     * Addition/subtraction have lower precedence than multiplication
     */
    function needsParensForMultiply(node) {
        return node.type === 'binaryOp' && (node.operator === '+' || node.operator === '-');
    }

    function walk(node) {
        if (node.type === 'number') {
            if (node.isConstant) {
                // Constants like PI, E
                const constMap = { 'PI': '\\pi', 'E': 'e' };
                return constMap[node.value] || node.value.toString();
            } else {
                return node.value.toString();
            }
        } else if (node.type === 'variable') {
            if (varSet.has(node.name)) {
                return node.name;
            } else {
                throw new Error(`Unknown variable: ${node.name}`);
            }
        } else if (node.type === 'unaryOp') {
            const operand = walk(node.operand);
            // Wrap in parens if complex expression
            if (operand.includes(' ') || operand.includes('+') || operand.includes('-')) {
                return `-(${operand})`;
            } else {
                return `-${operand}`;
            }
        } else if (node.type === 'binaryOp') {
            const left = walk(node.left);
            const right = walk(node.right);

            if (node.operator === '^') {
                // Power: a^b
                // Add parentheses around base if it's a complex expression
                // e.g., (x+2)^2 not x+2^2
                const base = needsParensForPower(node.left) ? `\\left(${left}\\right)` : left;
                return `{${base}}^{${right}}`;
            } else if (node.operator === '*') {
                // Multiplication: use \cdot
                // Add parentheses around operands with lower precedence (addition/subtraction)
                const leftParen = needsParensForMultiply(node.left) ? `\\left(${left}\\right)` : left;
                const rightParen = needsParensForMultiply(node.right) ? `\\left(${right}\\right)` : right;
                return `${leftParen} \\cdot ${rightParen}`;
            } else if (node.operator === '/') {
                // Division: use \frac
                return `\\frac{${left}}{${right}}`;
            } else if (node.operator === '-') {
                // Subtraction
                return `${left} - ${right}`;
            } else if (node.operator === '+') {
                // Addition
                return `${left} + ${right}`;
            } else {
                // Other operators
                return `${left} ${node.operator} ${right}`;
            }
        } else if (node.type === 'functionCall') {
            const args = node.args.map(arg => walk(arg));

            // Map functions to LaTeX notation
            if (node.name === 'sqrt') {
                return `\\sqrt{${args[0]}}`;
            } else if (node.name === 'sin') {
                return `\\sin(${args[0]})`;
            } else if (node.name === 'cos') {
                return `\\cos(${args[0]})`;
            } else if (node.name === 'tan') {
                return `\\tan(${args[0]})`;
            } else if (node.name === 'exp') {
                return `\\exp(${args[0]})`;
            } else if (node.name === 'log') {
                return `\\log(${args[0]})`;
            } else if (node.name === 'abs') {
                return `\\left|${args[0]}\\right|`;
            } else {
                // Other functions: use regular notation
                return `${node.name}(${args.join(', ')})`;
            }
        }
        throw new Error(`Unknown node type: ${node.type}`);
    }

    return walk(node);
}

/**
 * Get the number of arguments a function expects
 */
function getFunctionArgCount(funcName) {
    // Check custom functions first
    if (customFunctions.hasOwnProperty(funcName)) {
        return customFunctions[funcName].params.length;
    }
    // Check built-in functions
    const multiArg = new Set(['min', 'max', 'pow', 'mod', 'dot', 'atan2']);
    return multiArg.has(funcName) ? 2 : 1;
}

/**
 * Generate GLSL function declarations for all custom functions
 * @param {string[]} availableVars - Variables available in the current context
 * @returns {string} GLSL function declarations
 */
function generateGLSLFunctionDeclarations(availableVars) {
    let declarations = '';

    for (const [funcName, func] of Object.entries(customFunctions)) {
        // Parse the function body into an AST
        const bodyTokens = tokenize(func.body);
        const bodyAST = parse(bodyTokens);

        // Convert body to GLSL using function parameters as variables
        // Use direct mapping so parameters are used as-is (not mapped to pos.x, etc.)
        const bodyGLSL = astToGLSL(bodyAST, func.params, true);

        // Generate GLSL function declaration
        declarations += `float ${funcName}(`;
        declarations += func.params.map(p => `float ${p}`).join(', ');
        declarations += `) {\n`;
        declarations += `    return ${bodyGLSL};\n`;
        declarations += `}\n\n`;
    }

    return declarations;
}

/**
 * Parse expression and return IExpression object
 * @param {string} expression - Math expression to parse
 * @param {number} dimensions - Number of dimensions
 * @param {Array<string>} customVariables - Optional custom variable names
 * @returns {IExpression} Expression object with toGLSL(), toTeX(), toJS() methods
 */
export function parseToExpression(expression, dimensions, customVariables = null) {
    const variables = customVariables || ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);

    try {
        const tokens = tokenize(expression);
        const ast = parse(tokens);

        // Verbose logging: output AST tree
        logger.verbose(`Parsed expression: "${expression}"`);
        logger.verbose('AST tree:\n' + prettyPrintAST(ast));

        return new NativeExpression(ast);
    } catch (error) {
        throw new Error(`Parse error: ${error.message}`);
    }
}

/**
 * Main parser function - parses expression to GLSL
 * @param {string} expression - Math expression to parse
 * @param {number} dimensions - Number of dimensions
 * @param {Array<string>} customVariables - Optional custom variable names (e.g., ['r', 'theta'])
 * @param {string} posVarName - Optional GLSL position variable name (default: 'pos')
 * @returns {string} GLSL code
 */
export function parseExpression(expression, dimensions, customVariables = null, posVarName = 'pos') {
    const variables = customVariables || ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);
    const expr = parseToExpression(expression, dimensions, customVariables);
    return expr.toGLSL(variables, { useDirectMapping: false, posVarName });
}

/**
 * Get GLSL function declarations for custom functions
 * This should be prepended to shaders that use custom functions
 * @returns {string} GLSL function declarations
 */
export function getGLSLFunctionDeclarations() {
    return generateGLSLFunctionDeclarations([]);
}

/**
 * Parse all dimension expressions
 * @param {string[]} expressions - Array of expressions, one per dimension
 * @param {Array<string>} customVariables - Optional custom variable names (e.g., ['r', 'theta'])
 * @param {string} posVarName - Optional GLSL position variable name (default: 'pos')
 * @returns {string[]} Array of GLSL code strings
 */
export function parseVectorField(expressions, customVariables = null, posVarName = 'pos') {
    const dimensions = expressions.length;
    return expressions.map((expr, i) => {
        try {
            return parseExpression(expr.trim(), dimensions, customVariables, posVarName);
        } catch (error) {
            throw new Error(`Error in dimension ${i}: ${error.message}`);
        }
    });
}

/**
 * Create JavaScript velocity evaluator functions
 * @param {string[]} expressions - Array of expressions, one per dimension
 * @param {Array<string>} customVariables - Optional custom variable names (e.g., ['r', 'theta'])
 * @returns {Function[]} Array of evaluator functions
 */
export function createVelocityEvaluators(expressions, customVariables = null) {
    const dimensions = expressions.length;
    const variables = customVariables || ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);

    return expressions.map((expr, i) => {
        try {
            const tokens = tokenize(expr.trim());
            const ast = parse(tokens);
            const jsCode = astToJS(ast, variables);

            // Create a function that takes position components as arguments
            // e.g., for 2D: (x, y) => expression
            const funcBody = `return ${jsCode};`;
            return new Function(...variables, funcBody);
        } catch (error) {
            throw new Error(`Error creating evaluator for dimension ${i}: ${error.message}`);
        }
    });
}

/**
 * Parse expression and convert to LaTeX notation
 * @param {string} expression - Math expression to parse
 * @param {number} dimensions - Number of dimensions
 * @param {Array<string>} customVariables - Optional custom variable names (e.g., ['r', 'theta'])
 * @returns {string} LaTeX code
 */
export function parseExpressionToTeX(expression, dimensions, customVariables = null) {
    const variables = customVariables || ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);
    const expr = parseToExpression(expression, dimensions, customVariables);
    return expr.toTeX(variables);
}

/**
 * Parse and register custom function definitions
 * @param {string} functionsText - Multi-line text with function definitions
 * Format: functionName(arg1, arg2, ...) = expression
 */
export function setCustomFunctions(functionsText) {
    // Clear existing custom functions
    for (const key in customFunctions) {
        delete customFunctions[key];
    }

    if (!functionsText || !functionsText.trim()) {
        return; // Empty input, just cleared functions
    }

    const lines = functionsText.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith('//') || line.startsWith('#')) {
            continue;
        }

        // Parse function definition: functionName(arg1, arg2) = expression
        const match = line.match(/^([a-zA-Z_][a-zA-Z_0-9]*)\s*\(([^)]*)\)\s*=\s*(.+)$/);

        if (!match) {
            throw new Error(`Line ${lineNum + 1}: Invalid function definition syntax. Expected: functionName(arg1, arg2) = expression`);
        }

        const [, functionName, paramsStr, body] = match;

        // Check if function name conflicts with built-in functions
        if (BUILTIN_FUNCTIONS.has(functionName)) {
            throw new Error(`Line ${lineNum + 1}: Cannot override built-in function '${functionName}'`);
        }

        // Check if function name conflicts with constants
        if (CONSTANTS.hasOwnProperty(functionName)) {
            throw new Error(`Line ${lineNum + 1}: Cannot use constant name '${functionName}' as function name`);
        }

        // Parse parameters
        const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);

        // Validate parameters are valid identifiers
        for (const param of params) {
            if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(param)) {
                throw new Error(`Line ${lineNum + 1}: Invalid parameter name '${param}'`);
            }
        }

        // Validate the function body can be parsed
        try {
            const testTokens = tokenize(body);
            parse(testTokens);
        } catch (error) {
            throw new Error(`Line ${lineNum + 1}: Error parsing function body: ${error.message}`);
        }

        // Store the function definition
        customFunctions[functionName] = {
            params: params,
            body: body
        };
    }
}

/**
 * Get current custom function definitions
 * @returns {object} Custom functions registry
 */
export function getCustomFunctions() {
    return { ...customFunctions };
}
