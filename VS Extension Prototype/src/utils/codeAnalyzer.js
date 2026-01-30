const fs = require('fs');
const path = require('path');

class CodeAnalyzer {
    constructor() {
        this.mlLibraries = {
            'tensorflow': {
                imports: ['tensorflow', 'tf', 'tensorflow.keras', 'keras'],
                apis: [
                    'tf.keras.Model', 'tf.keras.Sequential', 'tf.keras.layers',
                    'tf.placeholder', 'tf.Variable', 'tf.constant',
                    'tf.Session', 'tf.global_variables_initializer',
                    'tf.train', 'tf.nn', 'tf.layers', 'tf.estimator',
                    'model.fit', 'model.predict', 'model.evaluate', 'model.compile',
                    'model.save', 'model.load_weights', 'model.summary'
                ]
            },
            'keras': {
                imports: ['keras', 'tensorflow.keras'],
                apis: [
                    'keras.Model', 'keras.Sequential', 'keras.layers',
                    'Dense', 'Conv2D', 'LSTM', 'Dropout', 'Activation',
                    'model.fit', 'model.predict', 'model.evaluate', 'model.compile',
                    'model.save', 'model.load_weights', 'model.summary'
                ]
            },
            'pytorch': {
                imports: ['torch', 'torch.nn', 'torch.optim'],
                apis: [
                    'torch.nn.Module', 'torch.nn.Linear', 'torch.nn.Conv2d',
                    'torch.nn.ReLU', 'torch.nn.Softmax', 'torch.nn.CrossEntropyLoss',
                    'torch.optim.Adam', 'torch.optim.SGD',
                    'model.train', 'model.eval', 'model.forward',
                    'torch.save', 'torch.load', 'model.state_dict'
                ]
            },
            'sklearn': {
                imports: ['sklearn', 'sklearn.ensemble', 'sklearn.linear_model', 'sklearn.svm'],
                apis: [
                    'fit', 'predict', 'predict_proba', 'score', 'transform',
                    'RandomForestClassifier', 'LogisticRegression', 'SVC',
                    'train_test_split', 'StandardScaler', 'LabelEncoder'
                ]
            }
        };

        // Common violation patterns
        this.violationPatterns = [
            // Shape mismatches
            { pattern: /\.reshape\([^)]*\)/, type: 'shape_operation' },
            { pattern: /\.shape/, type: 'shape_access' },
            
            // Model lifecycle issues
            { pattern: /\.fit\(/, type: 'model_training' },
            { pattern: /\.predict\(/, type: 'model_prediction' },
            { pattern: /\.compile\(/, type: 'model_compilation' },
            
            // Data type issues
            { pattern: /\.astype\(/, type: 'type_conversion' },
            { pattern: /dtype\s*=/, type: 'dtype_specification' },
            
            // Tensor operations
            { pattern: /tf\.(constant|Variable|placeholder)/, type: 'tensor_creation' },
            { pattern: /torch\.(tensor|Tensor)/, type: 'tensor_creation' },
            
            // Array operations
            { pattern: /np\.(array|zeros|ones)/, type: 'array_creation' },
            { pattern: /\.concatenate|\.stack|\.vstack|\.hstack/, type: 'array_concatenation' }
        ];
    }

    /**
     * Analyze Python code for ML patterns and potential violations
     */
    async analyzeCode(code, filePath) {
        const lines = code.split('\n');
        const analysis = {
            filePath: filePath,
            hasMLCode: false,
            mlLibraries: [],
            mlAPIs: [],
            snippets: [],
            violations: []
        };

        // Detect ML library imports
        const imports = this.detectMLImports(code);
        analysis.mlLibraries = imports;
        analysis.hasMLCode = imports.length > 0;

        if (!analysis.hasMLCode) {
            return analysis;
        }

        // Detect ML API usage
        analysis.mlAPIs = this.detectMLAPIs(code, imports);

        analysis.snippets = this.extractMLSnippets(lines, imports);

        // Detect potential violations
        analysis.violations = this.detectViolationPatterns(code);

        return analysis;
    }

    /**
     * Detect ML library imports
     */
    detectMLImports(code) {
        const imports = [];
        const importLines = code.match(/^(import|from)\s+[\w.]+\s*(import\s+[\w.,\s*]+)?/gm) || [];

        for (const line of importLines) {
            for (const [library, config] of Object.entries(this.mlLibraries)) {
                for (const importPattern of config.imports) {
                    if (line.includes(importPattern)) {
                        if (!imports.includes(library)) {
                            imports.push(library);
                        }
                    }
                }
            }
        }

        return imports;
    }

    /**
     * Detect ML API usage
     */
    detectMLAPIs(code, detectedLibraries) {
        const apis = [];
        
        for (const library of detectedLibraries) {
            const config = this.mlLibraries[library];
            for (const api of config.apis) {
                if (code.includes(api)) {
                    apis.push(api);
                }
            }
        }

        return apis;
    }

    /**
     * Extract code snippets containing ML patterns
     */
    extractMLSnippets(lines, detectedLibraries) {
        const snippets = [];
        const snippetSize = 10; // Lines before and after ML pattern

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let hasMLPattern = false;

            for (const library of detectedLibraries) {
                const config = this.mlLibraries[library];
                for (const api of config.apis) {
                    if (line.includes(api)) {
                        hasMLPattern = true;
                        break;
                    }
                }
                if (hasMLPattern) break;
            }

            if (hasMLPattern) {
                const startLine = Math.max(0, i - snippetSize);
                const endLine = Math.min(lines.length - 1, i + snippetSize);
                const snippet = {
                    startLine: startLine + 1, // 1-based line numbers
                    endLine: endLine + 1,
                    code: lines.slice(startLine, endLine + 1).join('\n'),
                    mlLine: i + 1
                };
                snippets.push(snippet);
            }
        }

        return snippets;
    }

    /**
     * Detect potential violation patterns
     */
    detectViolationPatterns(code) {
        const violations = [];

        for (const { pattern, type } of this.violationPatterns) {
            const matches = code.match(new RegExp(pattern.source, 'g'));
            if (matches) {
                violations.push({
                    type: type,
                    pattern: pattern.source,
                    matches: matches.length,
                    description: this.getViolationDescription(type)
                });
            }
        }

        return violations;
    }

    /**
     * Get description for violation type
     */
    getViolationDescription(type) {
        const descriptions = {
            'shape_operation': 'Shape manipulation operations that might cause dimension mismatches',
            'shape_access': 'Direct shape access that might indicate dimension issues',
            'model_training': 'Model training calls that might have parameter issues',
            'model_prediction': 'Model prediction calls that might have input shape issues',
            'model_compilation': 'Model compilation that might have configuration issues',
            'type_conversion': 'Data type conversions that might cause compatibility issues',
            'dtype_specification': 'Data type specifications that might be incorrect',
            'tensor_creation': 'Tensor creation that might have shape or type issues',
            'array_creation': 'Array creation that might have dimension issues',
            'array_concatenation': 'Array concatenation that might have shape mismatches'
        };

        return descriptions[type] || 'Potential ML API usage issue';
    }

    /**
     * Get ML library specific analysis
     */
    getLibraryAnalysis(library) {
        return this.mlLibraries[library] || null;
    }

    /**
     * Check if code has specific ML pattern
     */
    hasMLPattern(code, pattern) {
        return new RegExp(pattern).test(code);
    }

    /**
     * Extract function definitions that use ML APIs
     */
    extractMLFunctions(code) {
        const functions = [];
        const lines = code.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('def ')) {
                const functionName = line.match(/def\s+(\w+)/)?.[1];
                if (functionName) {
                    let j = i + 1;
                    let functionBody = '';
                    let indentLevel = line.match(/^(\s*)/)?.[1].length || 0;
                    
                    while (j < lines.length) {
                        const currentLine = lines[j];
                        const currentIndent = currentLine.match(/^(\s*)/)?.[1].length || 0;
                        
                        if (currentLine.trim() === '' || currentIndent > indentLevel) {
                            functionBody += currentLine + '\n';
                            j++;
                        } else {
                            break;
                        }
                    }
                    
                    const hasML = this.detectMLImports(functionBody).length > 0 || 
                                 this.detectMLAPIs(functionBody, Object.keys(this.mlLibraries)).length > 0;
                    
                    if (hasML) {
                        functions.push({
                            name: functionName,
                            startLine: i + 1,
                            endLine: j,
                            body: functionBody.trim()
                        });
                    }
                }
            }
        }
        
        return functions;
    }
}

module.exports = CodeAnalyzer;
