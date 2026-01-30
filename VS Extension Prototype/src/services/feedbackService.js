const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CodeTransformer = require('../utils/codeTransformer');

class FeedbackService {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'ml-contract-feedback');
        this.ensureTempDir();
        this.codeTransformer = new CodeTransformer();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    // Get persistent venv Python path
    getVenvPythonPath() {
        const tmpDir = os.tmpdir();
        const isWindows = process.platform === 'win32';
        const pythonExe = isWindows ? 'python.exe' : 'python';
        const venvPath = path.join(tmpDir, 'ml_contract_persistent_venv_v2', isWindows ? 'Scripts' : 'bin', pythonExe);
        
        if (!fs.existsSync(venvPath)) {
            throw new Error(`Virtual environment not found at: ${venvPath}. Please ensure the venv is created.`);
        }
        
        return venvPath;
    }

    // Execute Python code using persistent venv
    async executePythonCode(code, timeout = 30000) {
        return new Promise((resolve) => {
            const timestamp = Date.now();
            const tempFile = path.join(this.tempDir, `temp_${timestamp}.py`);
            const wrapperFile = path.join(this.tempDir, `wrapper_${timestamp}.py`);
            let timeoutHandle = null;
            let pythonProcess = null;
            
            const cleanup = () => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (err) {
                    console.warn('Failed to delete temp file:', err.message);
                }
                
                try {
                    if (fs.existsSync(wrapperFile)) {
                        fs.unlinkSync(wrapperFile);
                    }
                } catch (err) {
                    console.warn('Failed to delete wrapper file:', err.message);
                }
            };
            
            try {
                let codeToExecute = code;
                const transformResult = this.codeTransformer.transformCode(code, {
                    addEagerDisable: true,
                    addCollectionsFix: false,
                    trackReplacements: true
                });
                
                if (transformResult.wasTransformed) {
                    codeToExecute = transformResult.transformedCode;
                    console.log(`Code transformer applied ${transformResult.replacements.length} replacements`);
                    transformResult.replacements.forEach(r => {
                        console.log(`  - ${r.comment}`);
                    });
                }
                
                fs.writeFileSync(tempFile, codeToExecute, 'utf8');
                
                const wrapperCode = `# Apply collections compatibility fix for PyContracts
import collections
import collections.abc

# Apply compatibility patches for PyContracts
try:
    collections.Container = collections.abc.Container
    collections.Iterable = collections.abc.Iterable
    collections.Iterator = collections.abc.Iterator
    collections.Callable = collections.abc.Callable
    collections.Mapping = collections.abc.Mapping
    collections.MutableMapping = collections.abc.MutableMapping
    collections.Sequence = collections.abc.Sequence
    collections.MutableSequence = collections.abc.MutableSequence
    collections.Set = collections.abc.Set
    collections.MutableSet = collections.abc.MutableSet
    collections.Hashable = collections.abc.Hashable
    collections.Sized = collections.abc.Sized
except AttributeError:
    pass

# Run the actual code
try:
    with open(r"${tempFile.replace(/\\/g, '\\\\')}", 'r', encoding='utf-8') as f:
        code_content = f.read()
    exec(code_content)
except Exception as e:
    import traceback
    print(f"Error executing code: {e}")
    traceback.print_exc()
    raise`;
                
                fs.writeFileSync(wrapperFile, wrapperCode, 'utf8');
                
                let venvPython;
                try {
                    venvPython = this.getVenvPythonPath();
                } catch (error) {
                    cleanup();
                    resolve({
                        success: false,
                        exitCode: -1,
                        stdout: '',
                        stderr: error.message,
                        hasError: true,
                        output: error.message
                    });
                    return;
                }
                
                pythonProcess = spawn(venvPython, [wrapperFile], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });

                let stdout = '';
                let stderr = '';
                let hasError = false;
                let resolved = false;

                timeoutHandle = setTimeout(() => {
                    if (!resolved && pythonProcess) {
                        resolved = true;
                        pythonProcess.kill('SIGTERM');
                        cleanup();
                        resolve({
                            success: false,
                            exitCode: -1,
                            stdout: stdout.trim(),
                            stderr: stderr.trim() || `Execution timeout after ${timeout}ms`,
                            hasError: true,
                            output: `Execution timeout after ${timeout}ms`
                        });
                    }
                }, timeout);

                pythonProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                    hasError = true;
                });

                pythonProcess.on('close', (code) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();

                    resolve({
                        success: code === 0 && !hasError,
                        exitCode: code,
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        hasError: hasError || code !== 0,
                        output: stdout.trim() || stderr.trim()
                    });
                });

                pythonProcess.on('error', (error) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();

                    resolve({
                        success: false,
                        exitCode: -1,
                        stdout: stdout.trim(),
                        stderr: stderr.trim() || error.message,
                        hasError: true,
                        output: error.message
                    });
                });

            } catch (error) {
                cleanup();
                resolve({
                    success: false,
                    exitCode: -1,
                    stdout: '',
                    stderr: error.message,
                    hasError: true,
                    output: error.message
                });
            }
        });
    }

    // Check if error indicates contract violation
    isContractViolation(errorOutput) {
        if (!errorOutput) return false;
        
        const errorLower = errorOutput.toLowerCase();
        const contractKeywords = [
            'contract violation',
            'contracts.contracts',
            'precondition',
            'postcondition',
            'contract',
            'assertionerror',
            'assert',
            'type mismatch',
            'type error'
        ];
        
        return contractKeywords.some(keyword => errorLower.includes(keyword));
    }

    // Test buggy code for violations
    async testBuggyCode(code) {
        console.log('Testing buggy code for violations...');
        const result = await this.executePythonCode(code);
        
        const hasViolation = result.hasError || result.exitCode !== 0;
        const isContractError = this.isContractViolation(result.stderr || result.stdout);
        
        console.log(`Buggy code test - Has error: ${hasViolation}, Is contract violation: ${isContractError}`);
        if (result.stderr) {
            console.log(`Buggy code stderr: ${result.stderr.substring(0, 200)}...`);
        }
        
        return {
            type: 'buggy_test',
            code: code,
            result: result,
            hasViolation: hasViolation,
            isContractViolation: isContractError,
            violationDetails: result.stderr || result.stdout || 'No error captured',
            success: result.success
        };
    }

    // Test fixed code for correctness
    async testFixedCode(code) {
        console.log('Testing fixed code for correctness...');
        const result = await this.executePythonCode(code);
        
        const isWorking = result.success && !this.isContractViolation(result.stderr);
        
        console.log(`Fixed code test - Success: ${result.success}, Is working: ${isWorking}`);
        if (result.stderr) {
            console.log(`Fixed code stderr: ${result.stderr.substring(0, 200)}...`);
        }
        
        return {
            type: 'fixed_test',
            code: code,
            result: result,
            isWorking: isWorking,
            output: result.output,
            hasError: result.hasError,
            errorDetails: result.stderr || ''
        };
    }

    // Generate feedback prompt from execution results
    generateFeedbackPrompt(buggyTest, fixedTest, originalViolation) {
        const violationLabels = originalViolation?.labels || {};
        const violationText = typeof originalViolation === 'string' 
            ? originalViolation 
            : JSON.stringify(originalViolation, null, 2);
        
        const prompt = `
You are an expert ML engineer helping to fix contract violations. Here's the feedback from code execution:

--- ORIGINAL VIOLATION CONTEXT ---
${violationText}
${violationLabels.level1 ? `Level 1: ${violationLabels.level1}` : ''}
${violationLabels.level2 ? `Level 2: ${violationLabels.level2}` : ''}
${violationLabels.level3 ? `Level 3: ${violationLabels.level3}` : ''}
${violationLabels.rootCause ? `Root Cause: ${violationLabels.rootCause}` : ''}
${violationLabels.effect ? `Effect: ${violationLabels.effect}` : ''}

--- BUGGY CODE EXECUTION RESULT ---
- Success: ${buggyTest.result.success}
- Exit Code: ${buggyTest.result.exitCode}
- Has Error: ${buggyTest.result.hasError}
- Is Contract Violation: ${buggyTest.isContractViolation !== undefined ? buggyTest.isContractViolation : 'unknown'}
- Output: ${buggyTest.result.stdout || '(no output)'}
- Error Details: ${buggyTest.result.stderr || '(no errors)'}

--- FIXED CODE EXECUTION RESULT ---
- Success: ${fixedTest.result.success}
- Exit Code: ${fixedTest.result.exitCode}
- Has Error: ${fixedTest.result.hasError}
- Is Working: ${fixedTest.isWorking !== undefined ? fixedTest.isWorking : fixedTest.result.success}
- Output: ${fixedTest.result.stdout || '(no output)'}
- Error Details: ${fixedTest.result.stderr || '(no errors)'}

--- ANALYSIS REQUIRED ---
1. Did the buggy code produce the expected contract violation? (Expected: ${buggyTest.isContractViolation !== undefined && buggyTest.isContractViolation ? 'YES' : 'NO - but should be YES'})
2. Did the fixed code resolve the issue and run successfully? (Expected: YES, Actual: ${fixedTest.isWorking !== undefined ? (fixedTest.isWorking ? 'YES' : 'NO') : (fixedTest.result.success ? 'YES' : 'NO')})
3. If not working, what specific issues need to be fixed?

--- SPECIFIC GUIDANCE ---
- For data type violations: Use 'array[float]' for numpy arrays without strict dimension constraints
- For string data violations: Use 'array[float]' to enforce numeric data
- For mixed data type violations: Use 'array[float]' to ensure all elements are numeric
- Avoid overly strict dimension constraints that break with different input shapes
- Use flexible array types like 'array[float]' instead of 'array[float, 1]' unless specifically needed
- Ensure contracts are actually being checked (use @contract decorator correctly)
- Make sure compatibility fixes (collections.abc) are applied

--- YOUR TASK ---
Provide a detailed analysis:
1. What went wrong/right with the current implementation?
2. Specific issues preventing the buggy code from showing contract violations
3. Specific issues preventing the fixed code from running successfully
4. Concrete recommendations for fixing both codes

Be specific and actionable. Focus on making the contract robust and the code actually executable.
`;

        return prompt;
    }

    // Run feedback loop: test buggy → test fixed → get feedback → improve
    async runFeedbackLoop(originalCode, buggyCode, fixedCode, originalViolation, ragService) {
        console.log('Starting feedback loop...');
        
        try {
            const buggyTest = await this.testBuggyCode(buggyCode);
            const fixedTest = await this.testFixedCode(fixedCode);
            const feedbackPrompt = this.generateFeedbackPrompt(buggyTest, fixedTest, originalViolation);
            const feedback = await ragService.getLLMFeedback(feedbackPrompt);
            
            const buggyNeedsFix = !buggyTest.hasViolation || !buggyTest.isContractViolation;
            const fixedNeedsFix = !fixedTest.isWorking;
            const needsImprovement = buggyNeedsFix || fixedNeedsFix;
            
            console.log(`Feedback loop result - Buggy needs fix: ${buggyNeedsFix}, Fixed needs fix: ${fixedNeedsFix}, Overall: ${needsImprovement}`);
            
            return {
                buggyTest,
                fixedTest,
                feedback,
                needsImprovement: needsImprovement,
                buggyNeedsFix: buggyNeedsFix,
                fixedNeedsFix: fixedNeedsFix,
                iteration: 1
            };
            
        } catch (error) {
            console.error('Error in feedback loop:', error);
            return {
                error: error.message,
                needsImprovement: true,
                iteration: 1
            };
        }
    }

    // Run iterative improvement until success or max iterations
    async runIterativeImprovement(originalCode, initialBuggyCode, initialFixedCode, originalViolation, ragService, maxIterations = 3) {
        console.log(`Starting iterative improvement (max ${maxIterations} iterations)...`);
        
        let currentBuggyCode = initialBuggyCode;
        let currentFixedCode = initialFixedCode;
        let iteration = 0;
        const results = [];

        while (iteration < maxIterations) {
            iteration++;
            console.log(`\n--- Iteration ${iteration} ---`);
            
            const feedbackResult = await this.runFeedbackLoop(
                originalCode, 
                currentBuggyCode, 
                currentFixedCode, 
                originalViolation, 
                ragService
            );
            
            results.push({
                iteration,
                ...feedbackResult
            });

            const buggyGood = feedbackResult.buggyTest && 
                             feedbackResult.buggyTest.hasViolation && 
                             feedbackResult.buggyTest.isContractViolation;
            const fixedGood = feedbackResult.fixedTest && feedbackResult.fixedTest.isWorking;
            
            if (buggyGood && fixedGood) {
                console.log(`✅ Success achieved in iteration ${iteration}!`);
                console.log(`  - Buggy code shows contract violation: ${buggyGood}`);
                console.log(`  - Fixed code runs successfully: ${fixedGood}`);
                break;
            } else {
                console.log(`⚠️  Not satisfied yet - Buggy: ${buggyGood}, Fixed: ${fixedGood}`);
            }

            if (feedbackResult.feedback && feedbackResult.needsImprovement) {
                console.log('Attempting to improve code based on feedback...');
                
                try {
                    const improvedCode = await this.generateImprovedCode(
                        currentBuggyCode,
                        currentFixedCode,
                        feedbackResult.feedback,
                        originalViolation,
                        ragService
                    );
                    
                    if (improvedCode.buggyCode && improvedCode.fixedCode) {
                        currentBuggyCode = improvedCode.buggyCode;
                        currentFixedCode = improvedCode.fixedCode;
                        console.log('Code improved, will test in next iteration...');
                    } else {
                        console.log('Could not improve code, stopping iterations');
                        break;
                    }
                } catch (error) {
                    console.warn('Error improving code:', error.message);
                    break;
                }
            } else {
                console.log('No improvement needed or no feedback available');
                break;
            }
        }

        return {
            success: results[results.length - 1]?.fixedTest?.isWorking || false,
            iterations: results,
            finalBuggyCode: currentBuggyCode,
            finalFixedCode: currentFixedCode,
            totalIterations: iteration
        };
    }

    // Generate improved code from LLM feedback
    async generateImprovedCode(buggyCode, fixedCode, feedback, originalViolation, ragService) {
        const improvementPrompt = `
You are an expert Python engineer and ML contract specialist. Based on the execution feedback, improve the PyContract code.

--- ORIGINAL VIOLATION CONTEXT ---
Level 1: ${originalViolation.labels.level1}
Level 2: ${originalViolation.labels.level2}
Level 3: ${originalViolation.labels.level3}
Root Cause: ${originalViolation.labels.rootCause}
Effect: ${originalViolation.labels.effect}

--- CURRENT BUGGY CODE ---
\`\`\`python
${buggyCode}
\`\`\`

--- CURRENT FIXED CODE ---
\`\`\`python
${fixedCode}
\`\`\`

--- EXECUTION FEEDBACK ---
${feedback}

--- TASK ---
Based on the feedback, generate improved versions of both buggy and fixed code that:
1. The buggy code should demonstrate a clear contract violation (not just a crash)
2. The fixed code should satisfy the contract and run successfully
3. Both should use the same contract specifications
4. The contract should be relevant to the original violation context

Output exactly in this format:

<IMPROVED_BUGGY_CODE>
\`\`\`python
# Improved buggy code that demonstrates contract violation
\`\`\`
</IMPROVED_BUGGY_CODE>

<IMPROVED_FIXED_CODE>
\`\`\`python
# Improved fixed code that satisfies the contract
\`\`\`
</IMPROVED_FIXED_CODE>
`;

        try {
            const response = await ragService.getLLMFeedback(improvementPrompt);
            
            let buggyMatch = response.match(/<IMPROVED_BUGGY_CODE>\s*```python\s*([\s\S]*?)\s*```/);
            let fixedMatch = response.match(/<IMPROVED_FIXED_CODE>\s*```python\s*([\s\S]*?)\s*```/);
            
            // Fallback: try without language tag
            if (!buggyMatch) {
                buggyMatch = response.match(/<IMPROVED_BUGGY_CODE>\s*```\s*([\s\S]*?)\s*```/);
            }
            if (!fixedMatch) {
                fixedMatch = response.match(/<IMPROVED_FIXED_CODE>\s*```\s*([\s\S]*?)\s*```/);
            }
            
            // Fallback: try to extract between tags without code fences
            if (!buggyMatch) {
                const buggyStart = response.indexOf('<IMPROVED_BUGGY_CODE>');
                const buggyEnd = response.indexOf('</IMPROVED_BUGGY_CODE>');
                if (buggyStart !== -1 && buggyEnd !== -1) {
                    const buggyContent = response.substring(buggyStart + '<IMPROVED_BUGGY_CODE>'.length, buggyEnd).trim();
                    // Remove any leading ```python or ```
                    buggyMatch = [null, buggyContent.replace(/^```python\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '')];
                }
            }
            
            if (!fixedMatch) {
                const fixedStart = response.indexOf('<IMPROVED_FIXED_CODE>');
                const fixedEnd = response.indexOf('</IMPROVED_FIXED_CODE>');
                if (fixedStart !== -1 && fixedEnd !== -1) {
                    const fixedContent = response.substring(fixedStart + '<IMPROVED_FIXED_CODE>'.length, fixedEnd).trim();
                    // Remove any leading ```python or ```
                    fixedMatch = [null, fixedContent.replace(/^```python\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '')];
                }
            }
            
            if (buggyMatch && fixedMatch) {
                const buggyCode = buggyMatch[1] ? buggyMatch[1].trim() : buggyMatch[0];
                const fixedCode = fixedMatch[1] ? fixedMatch[1].trim() : fixedMatch[0];
                
                if (buggyCode && fixedCode) {
                    console.log('Successfully extracted improved code from LLM response');
                    return {
                        buggyCode: buggyCode,
                        fixedCode: fixedCode
                    };
                }
            }
            
            console.warn('Could not extract improved code from LLM response');
            console.warn('Response preview:', response.substring(0, 500));
            return null;
        } catch (error) {
            console.error('Error generating improved code:', error);
            return null;
        }
    }
}

module.exports = FeedbackService;
