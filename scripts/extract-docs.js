#!/usr/bin/env node

/**
 * Extract function documentation from JavaScript source files
 * Uses comment-parser to parse JSDoc comments
 */

import { parse } from 'comment-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'dev', 'API_REFERENCE.md');

/**
 * Recursively get all JavaScript files in a directory
 */
function getAllJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            getAllJsFiles(filePath, fileList);
        } else if (file.endsWith('.js')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

/**
 * Extract function/class name from the line following a comment
 */
function extractName(source, commentEnd) {
    const lines = source.split('\n');
    const commentEndLine = source.substring(0, commentEnd).split('\n').length;

    // Look at the next few lines after the comment
    for (let i = commentEndLine; i < Math.min(commentEndLine + 3, lines.length); i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        // Class declaration
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) return { type: 'class', name: classMatch[1] };

        // Function declaration
        const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (funcMatch) return { type: 'function', name: funcMatch[1] };

        // Method or arrow function
        const methodMatch = line.match(/(?:async\s+)?(\w+)\s*(?:\(|=\s*(?:async\s+)?\()/);
        if (methodMatch && !['if', 'while', 'for', 'switch', 'catch'].includes(methodMatch[1])) {
            return { type: 'function', name: methodMatch[1] };
        }
    }

    return null;
}

/**
 * Extract documentation from a single file
 */
function extractDocsFromFile(filePath) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(SRC_DIR, filePath);

    // Parse all comments in the file
    const comments = parse(source, { spacing: 'preserve' });

    const docs = [];

    comments.forEach(comment => {
        // Find what this comment documents
        const nameInfo = extractName(source, comment.source[0].number);

        if (!nameInfo) return;

        // Extract description
        const description = comment.description || '';

        // Extract parameters
        const params = comment.tags.filter(tag => tag.tag === 'param').map(tag => ({
            name: tag.name,
            type: tag.type,
            description: tag.description
        }));

        // Extract return value
        const returns = comment.tags.find(tag => tag.tag === 'returns' || tag.tag === 'return');

        docs.push({
            type: nameInfo.type,
            name: nameInfo.name,
            description: description,
            params: params,
            returns: returns ? { type: returns.type, description: returns.description } : null
        });
    });

    return {
        file: relativePath,
        docs: docs
    };
}

/**
 * Generate markdown documentation
 */
function generateMarkdown(allDocs) {
    let md = '# API Reference\n\n';
    md += '_Auto-generated from inline JSDoc documentation_\n\n';
    md += `_Generated: ${new Date().toISOString()}_\n\n`;
    md += '---\n\n';

    // Group by directory
    const byDirectory = {};
    allDocs.forEach(fileDoc => {
        const dir = path.dirname(fileDoc.file);
        if (!byDirectory[dir]) {
            byDirectory[dir] = [];
        }
        byDirectory[dir].push(fileDoc);
    });

    // Sort directories
    const sortedDirs = Object.keys(byDirectory).sort();

    sortedDirs.forEach(dir => {
        md += `## ${dir}/\n\n`;

        const files = byDirectory[dir];
        files.forEach(fileDoc => {
            if (fileDoc.docs.length === 0) return;

            md += `### ${path.basename(fileDoc.file)}\n\n`;

            fileDoc.docs.forEach(doc => {
                // Header
                if (doc.type === 'class') {
                    md += `#### class \`${doc.name}\`\n\n`;
                } else {
                    // Build function signature
                    const paramNames = doc.params.map(p => p.name).join(', ');
                    md += `#### \`${doc.name}(${paramNames})\`\n\n`;
                }

                // Description
                if (doc.description) {
                    md += doc.description + '\n\n';
                }

                // Parameters
                if (doc.params && doc.params.length > 0) {
                    md += '**Parameters:**\n\n';
                    doc.params.forEach(param => {
                        md += `- \`${param.name}\``;
                        if (param.type) md += ` *${param.type}*`;
                        if (param.description) md += ` - ${param.description}`;
                        md += '\n';
                    });
                    md += '\n';
                }

                // Return value
                if (doc.returns) {
                    md += '**Returns:**';
                    if (doc.returns.type) md += ` *${doc.returns.type}*`;
                    if (doc.returns.description) md += ` - ${doc.returns.description}`;
                    md += '\n\n';
                }
            });

            md += '\n';
        });
    });

    return md;
}

/**
 * Main execution
 */
function main() {
    console.log('Extracting documentation from JavaScript files...');

    // Get all JS files
    const jsFiles = getAllJsFiles(SRC_DIR);
    console.log(`Found ${jsFiles.length} JavaScript files`);

    // Extract docs from each file
    const allDocs = jsFiles.map(file => {
        const docs = extractDocsFromFile(file);
        const count = docs.docs.length;
        if (count > 0) {
            console.log(`  ${docs.file}: ${count} documented items`);
        }
        return docs;
    }).filter(doc => doc.docs.length > 0);

    // Generate markdown
    const markdown = generateMarkdown(allDocs);

    // Ensure docs directory exists
    const docsDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(OUTPUT_FILE, markdown);
    console.log(`\nDocumentation written to: ${OUTPUT_FILE}`);

    // Summary
    const totalItems = allDocs.reduce((sum, doc) => sum + doc.docs.length, 0);
    console.log(`Total documented items: ${totalItems}`);
}

main();
