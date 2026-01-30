const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables from .env file
// In development: __dirname = src/, so go up one level to find .env
// In production: __dirname = out/, so go up one level to find .env
const envPath = path.join(__dirname, '..', '.env');
const envLoaded = require('dotenv').config({ path: envPath });

// Also try loading from current working directory (workspace root)
// This handles cases where the extension runs from a different location
if (!process.env.OPENAI_API_KEY) {
    const cwd = process.cwd();
    const envPathCwd = path.join(cwd, '.env');
    require('dotenv').config({ path: envPathCwd });
}

// Debug: Log if .env was loaded
if (envLoaded && !envLoaded.error) {
    console.log('✓ .env file loaded from:', envPath);
} else {
    console.warn('⚠ .env file not found at:', envPath, '- trying alternative paths');
}

const RAGService = require('./rag/ragService');
const CodeAnalyzer = require('./utils/codeAnalyzer');
const DashboardProvider = require('./webview/dashboardProvider');
const FeedbackService = require('./services/feedbackService');
const CodeTransformer = require('./utils/codeTransformer');

let ragService;
let codeAnalyzer;
let dashboardProvider;
let feedbackService;
let currentPanel = null;

// Global persistent virtual environment
let persistentVenv = null;
let persistentVenvLibraries = new Set();

function activate(context) {
    console.log('ML Contract Extension is now active!');

    ragService = new RAGService(context.extensionUri);
    codeAnalyzer = new CodeAnalyzer();
    feedbackService = new FeedbackService();
    dashboardProvider = new DashboardProvider(context.extensionUri, ragService, codeAnalyzer, detectViolations, generateContracts);

    // Register commands

    const openDashboardCommand = vscode.commands.registerCommand('ml-contract.openDashboard', () => {
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
        } else {
            currentPanel = vscode.window.createWebviewPanel(
                'ml-contract-dashboard',
                'ML Contract Dashboard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')]
                }
            );

            currentPanel.webview.html = dashboardProvider.getHtmlForWebview(currentPanel.webview);

            currentPanel.webview.onDidReceiveMessage(async (data) => {
                console.log('Received message from webview:', data);
                switch (data.type) {
                    case 'detectViolations':
                        console.log('Detect violations message received, calling detectViolations()');
                        await detectViolations(data.fileName);
                        break;
                    case 'generateContracts':
                        console.log('Generate contracts message received, calling dashboard generateContractsFromViolations()');
                        try {
                            const contracts = await dashboardProvider.generateContractsFromViolations();
                            
                            dashboardProvider.setContracts(contracts);
                            
                            if (currentPanel && !currentPanel.webview.isDisposed) {
                                currentPanel.webview.postMessage({
                                    type: 'updateUI',
                                    violations: dashboardProvider.getViolations(),
                                    contracts: contracts
                                });
                            }
                            
                            vscode.window.showInformationMessage(`Generated ${contracts.length} PyContracts!`);
                        } catch (error) {
                            console.error('Error generating contracts:', error);
                            vscode.window.showErrorMessage(`Error generating contracts: ${error.message}`);
                        }
                        break;
                    case 'applyContract':
                        console.log('Apply contract message received, calling handleApplyContract()');
                        await handleApplyContract(data.contract);
                        break;
                    case 'showViolationDetails':
                        showViolationDetails(data.violation);
                        break;
                    case 'analyzePastedCode':
                        console.log('Analyze pasted code message received, calling analyzePastedCode()');
                        await analyzePastedCode(data.code);
                        break;
                    case 'runCode':
                        console.log('Run code message received, calling runCodeInTerminal()');
                        await runCodeInTerminal(data.code, data.codeType);
                        break;
                }
            });

            currentPanel.onDidDispose(() => {
                currentPanel = null;
            });
        }
    });

    const detectViolationsCommand = vscode.commands.registerCommand('ml-contract.detectViolations', async () => {
        await detectViolations();
    });

    const generateContractsCommand = vscode.commands.registerCommand('ml-contract.generateContracts', async () => {
        await generateContracts();
    });

    // Add to subscriptions
    context.subscriptions.push(
        openDashboardCommand,
        detectViolationsCommand,
        generateContractsCommand
    );

    vscode.window.showInformationMessage('ML Contract Extension activated! Open a Python file and use the dashboard to detect violations.');
}

async function detectViolations(fileNameFromWebview = null) {
    let fileName;
    
    if (fileNameFromWebview) {
        fileName = fileNameFromWebview;
    } else {
        fileName = await vscode.window.showInputBox({
            prompt: 'Enter the Python file name to analyze (e.g., test.py, model.py)',
            placeHolder: 'test.py',
            title: 'ML Contract Analysis - File Selection',
            validateInput: (value) => {
                if (!value) {
                    return 'Please enter a file name';
                }
                if (!value.endsWith('.py')) {
                    return 'File must be a Python file (.py)';
                }
                return null;
            }
        });
        
        if (!fileName) {
            // User cancelled
            return;
        }
    }
    
    // Find the file in ALL open documents (not just visible ones)
    let editor = null;
    
    // Debug: Show what files are open
    const visibleFiles = vscode.window.visibleTextEditors.map(e => path.basename(e.document.fileName));
    const allFiles = vscode.workspace.textDocuments.map(doc => path.basename(doc.fileName));
    console.log('Visible files:', visibleFiles);
    console.log('All open files:', allFiles);
    console.log('Looking for:', fileName);
    
    // First try to find in visible editors
    editor = vscode.window.visibleTextEditors.find(
        e => e.document.fileName.endsWith(fileName) || 
             path.basename(e.document.fileName) === fileName
    );
    
    // If not found in visible editors, check all open documents
    if (!editor) {
        const allDocuments = vscode.workspace.textDocuments;
        const matchingDoc = allDocuments.find(
            doc => doc.fileName.endsWith(fileName) || 
                   path.basename(doc.fileName) === fileName
        );
        
        if (matchingDoc) {
            // Open the document in a new editor
            editor = await vscode.window.showTextDocument(matchingDoc);
        }
    }
    
    if (!editor) {
        const availableFiles = allFiles.join(', ');
        vscode.window.showErrorMessage(`File "${fileName}" not found. Available files: ${availableFiles}`);
        return;
    }
    
    console.log('Analyzing file:', editor.document.fileName);

    try {
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Detecting ML Contract Violations...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Analyzing code..." });

            // Get the current file content
            const document = editor.document;
            const code = document.getText();
            const filePath = document.uri.fsPath;

            progress.report({ increment: 30, message: "Extracting ML API patterns..." });

            // Analyze the code for ML patterns
            const analysisResult = await codeAnalyzer.analyzeCode(code, filePath);
            
            console.log('Code analysis result:', analysisResult);
            console.log('Has ML code:', analysisResult.hasMLCode);
            console.log('ML libraries found:', analysisResult.mlLibraries);
            console.log('ML APIs found:', analysisResult.mlAPIs);
            console.log('Snippets found:', analysisResult.snippets.length);
            
            if (!analysisResult.hasMLCode) {
                vscode.window.showWarningMessage('No ML API patterns detected in this file.');
                return;
            }

            progress.report({ increment: 50, message: "Classifying violations..." });

            // Use RAG service to classify violations
            console.log('Calling RAG service to detect violations...');
            const violations = await ragService.detectViolations(analysisResult);
            console.log('RAG service returned violations:', violations);
            
            progress.report({ increment: 80, message: "Updating dashboard..." });

            // Store violations in dashboard provider
            dashboardProvider.setViolations(violations);
            
            // Update dashboard with results
            console.log('Updating dashboard with violations:', violations);
            if (currentPanel && !currentPanel.webview.isDisposed) {
                currentPanel.webview.postMessage({
                    type: 'updateUI',
                    violations: violations,
                    contracts: []
                });
            } else {
                // If no panel is open, show results in a notification
                vscode.window.showInformationMessage(`Found ${violations.length} potential contract violations. Open the dashboard to view details.`);
            }
            
            progress.report({ increment: 100, message: "Complete!" });
        });

        vscode.window.showInformationMessage(`Analysis complete for ${path.basename(editor.document.fileName)}. Check the dashboard for results.`);

    } catch (error) {
        console.error('Error detecting violations:', error);
        vscode.window.showErrorMessage(`Error detecting violations: ${error.message}`);
    }
}

/**
 * Analyze all open Python files and show combined results
 */
async function analyzeAllPythonFiles(pythonEditors) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${pythonEditors.length} Python Files...`,
            cancellable: false
        }, async (progress) => {
            const allViolations = [];
            const fileResults = [];
            
            for (let i = 0; i < pythonEditors.length; i++) {
                const editor = pythonEditors[i];
                const fileName = path.basename(editor.document.fileName);
                
                progress.report({ 
                    increment: (100 / pythonEditors.length), 
                    message: `Analyzing ${fileName}...` 
                });
                
                try {
                    const code = editor.document.getText();
                    const analysisResult = codeAnalyzer.analyzeCode(code);
                    
                    if (analysisResult.hasMLCode) {
                        const violations = await ragService.detectViolations(analysisResult);
                        
                        // Add file information to each violation
                        const violationsWithFile = violations.map(v => ({
                            ...v,
                            sourceFile: fileName,
                            sourcePath: editor.document.fileName
                        }));
                        
                        allViolations.push(...violationsWithFile);
                        fileResults.push({
                            fileName: fileName,
                            filePath: editor.document.fileName,
                            violationCount: violations.length,
                            hasMLCode: true
                        });
                    } else {
                        fileResults.push({
                            fileName: fileName,
                            filePath: editor.document.fileName,
                            violationCount: 0,
                            hasMLCode: false
                        });
                    }
                } catch (error) {
                    console.error(`Error analyzing ${fileName}:`, error);
                    fileResults.push({
                        fileName: fileName,
                        filePath: editor.document.fileName,
                        violationCount: 0,
                        hasMLCode: false,
                        error: error.message
                    });
                }
            }
            
            // Update dashboard with combined results
            if (currentPanel && !currentPanel.webview.isDisposed) {
                currentPanel.webview.postMessage({
                    type: 'updateUI',
                    violations: allViolations,
                    contracts: [],
                    fileResults: fileResults
                });
            } else {
                // If no panel is open, show results in a notification
                const totalViolations = allViolations.length;
                const filesWithViolations = fileResults.filter(f => f.violationCount > 0).length;
                vscode.window.showInformationMessage(
                    `Analysis complete! Found ${totalViolations} violations across ${filesWithViolations} files. Open the dashboard to view details.`
                );
            }
        });
        
    } catch (error) {
        console.error('Error analyzing all files:', error);
        vscode.window.showErrorMessage(`Error analyzing files: ${error.message}`);
    }
}

/**
 * Generate PyContracts for detected violations
 */
async function generateContracts() {
    if (!currentPanel || currentPanel.webview.isDisposed) {
        vscode.window.showErrorMessage('No violations detected. Please run "Detect Contract Violations" first.');
        return;
    }

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating PyContracts...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Generating contracts..." });

            // Get actual violations from the dashboard provider
            const violations = dashboardProvider.getViolations();
            
            if (!violations || violations.length === 0) {
                vscode.window.showErrorMessage('No violations found. Please run "Detect Contract Violations" first.');
                return;
            }
            
            const contracts = await ragService.generateContracts(violations, feedbackService);
            
            progress.report({ increment: 80, message: "Updating dashboard..." });

            // Update dashboard with generated contracts
            if (currentPanel && !currentPanel.webview.isDisposed) {
                currentPanel.webview.postMessage({
                    type: 'updateUI',
                    violations: violations,
                    contracts: contracts
                });
            }
            
            progress.report({ increment: 100, message: "Complete!" });
        });

        vscode.window.showInformationMessage(`Generated PyContracts. Check the dashboard to apply them.`);

    } catch (error) {
        console.error('Error generating contracts:', error);
        vscode.window.showErrorMessage(`Error generating contracts: ${error.message}`);
    }
}

/**
 * Show violation details in the dashboard modal
 */
function showViolationDetails(violation) {
    if (!violation || !violation.labels) {
        vscode.window.showErrorMessage('No violation details available');
        return;
    }

    // Send violation details to the dashboard to show in modal
    if (currentPanel && !currentPanel.webview.isDisposed) {
        currentPanel.webview.postMessage({
            type: 'showViolationDetails',
            violation: violation
        });
    } else {
        vscode.window.showErrorMessage('Dashboard not available. Please open the dashboard first.');
    }
}

/**
 * Get comprehensive label explanations based on the research paper
 */
function getLabelExplanations() {
    return {
        // Level 1 explanations (Central Contract Categories)
        level1: {
            'SAM': 'Single API Method - Violations that occur within a single API method, typically related to argument constraints or method-specific requirements',
            'AMO': 'API Method Order - Violations related to the correct sequence of API method calls',
            'HYBRID': 'Hybrid - Violations that involve a combination of different contract types'
        },
        
        // Level 2 explanations (Contract Subcategories)
        level2: {
            // For SAM (Level 1)
            'DT': 'Data Type - Violations concerning the expected data types of arguments or return values',
            'BET': 'Boolean Expression Type - Violations involving boolean expressions, often related to conditions or flags',
            
            // For AMO (Level 1)
            'G': 'Always - Conditions that must always hold true, regardless of the state or context',
            'F': 'Eventually - Conditions that must hold true at some point in the future',
            
            // For HYBRID (Level 1)
            'SAI': 'SAM-AMO Interdependency - Violations where the correctness of a single API method depends on the order of method calls',
            'SELECTION': 'Selection - Choice-based constraints involving multiple valid options'
        },
        
        // Level 3 explanations (Hybrid Patterns)
        level3: {
            // For SAM Level 2 categories
            'PT': 'Primitive Type - Violations related to basic data types like integers, floats, etc.',
            'BIT': 'Built-in Type - Violations concerning standard data structures or types, such as arrays or lists',
            'RT': 'Reference Type - Violations involving object references or custom data structures',
            'MT': 'ML Type - Violations specific to machine learning contexts, such as mismatched tensor shapes or incompatible model configurations',
            'IC-1': 'Intra-argument Contract - Violations within a single argument, such as invalid values or out-of-range numbers',
            'IC-2': 'Inter-argument Contract - Violations between multiple arguments, where the combination of argument values is invalid',
            
            // For HYBRID Level 2 categories
            'SAM ∧ AMO': 'Combination of SAM and AMO - Violations that involve both single API method constraints and API method order constraints',
            'SAM': 'Single API Method component in hybrid violation',
            'AMO': 'API Method Order component in hybrid violation'
        },
        
        // Leaf Contract Category explanations
        leafContractCategory: {
            'PT': 'Primitive Type - Violations related to basic data types like integers, floats, etc.',
            'BIT': 'Built-in Type - Violations concerning standard data structures or types, such as arrays or lists',
            'RT': 'Reference Type - Violations involving object references or custom data structures',
            'MT': 'ML Type - Violations specific to machine learning contexts, such as mismatched tensor shapes or incompatible model configurations',
            'IC-1': 'Intra-argument Contract - Violations within a single argument, such as invalid values or out-of-range numbers',
            'IC-2': 'Inter-argument Contract - Violations between multiple arguments, where the combination of argument values is invalid',
            'SAM ∧ AMO': 'Combination of SAM and AMO - Violations that involve both single API method constraints and API method order constraints',
            'SAM': 'Single API Method component in hybrid violation',
            'AMO': 'API Method Order component in hybrid violation'
        },
        
        // Root Cause explanations
        rootCause: {
            'Unacceptable Input Type': 'Developer provided wrong data type for ML API',
            'Unacceptable Input Value': 'Developer provided invalid parameter values',
            'Missing Required Method Order': 'Developer failed to follow proper API call sequence',
            'Incorrect Data Type': 'Developer used wrong data type for ML operations',
            'Dimension Mismatch': 'Developer provided data with incorrect dimensions',
            'Invalid Parameter Value': 'Developer provided invalid parameter values',
            'State Violation': 'Developer called API in incorrect state',
            'Missing Input Value/Type Dependency': 'Developer failed to maintain proper argument relationships'
        },
        
        // Effect explanations
        effect: {
            'Crash': 'Program terminates with runtime error',
            'IF': 'Incorrect Functionality - Program runs but produces wrong results',
            'BP': 'Bad Performance - Program runs but with degraded performance',
            'MOB': 'Model Output Bias - Model produces biased or incorrect predictions',
            'Unknown': 'Effect cannot be determined from available information'
        },
        
        // Location explanations
        location: {
            'Model Construction': 'Violation occurs during model architecture definition',
            'Train': 'Violation occurs during model training phase',
            'Model Evaluation': 'Violation occurs during model evaluation/testing',
            'Data Preprocessing': 'Violation occurs during data preparation',
            'Prediction': 'Violation occurs during model inference/prediction',
            'Load': 'Violation occurs during model loading',
            'Model Initialization': 'Violation occurs during model setup'
        },
        
        // Detection technique explanations
        detection: {
            'Static': 'Can be detected through static code analysis',
            'Runtime Checking': 'Requires runtime execution to detect',
            'Dynamic': 'Detected during program execution',
            'Contract': 'Detected through contract violation checking'
        },
        
        // ML Library explanations
        mlLibrary: {
            'TensorFlow': 'TensorFlow-specific violations and constraints',
            'Scikit-learn': 'Scikit-learn-specific violations and constraints',
            'Keras': 'Keras-specific violations and constraints',
            'PyTorch': 'PyTorch-specific violations and constraints'
        }
    };
}

/**
 * Get explanation for a specific label
 */
function getLabelExplanation(label, category, explanations) {
    if (!label || !explanations[category] || !explanations[category][label]) {
        return '';
    }
    
    const explanation = explanations[category][label];
    return `\n  💡 ${explanation}`;
}

/**
 * Analyze pasted code for contract violations
 */
async function analyzePastedCode(code) {
    try {
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing Pasted Code...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Analyzing code..." });

            progress.report({ increment: 30, message: "Extracting ML API patterns..." });

            // Analyze the pasted code for ML patterns
            const analysisResult = await codeAnalyzer.analyzeCode(code, 'pasted-code.py');
            
            console.log('Pasted code analysis result:', analysisResult);
            console.log('Has ML code:', analysisResult.hasMLCode);
            console.log('ML libraries found:', analysisResult.mlLibraries);
            console.log('ML APIs found:', analysisResult.mlAPIs);
            console.log('Snippets found:', analysisResult.snippets.length);
            
            if (!analysisResult.hasMLCode) {
                vscode.window.showWarningMessage('No ML API patterns detected in the pasted code.');
                return;
            }

            progress.report({ increment: 50, message: "Classifying violations..." });

            // Use RAG service to classify violations
            console.log('Calling RAG service to detect violations in pasted code...');
            const violations = await ragService.detectViolations(analysisResult);
            console.log('RAG service returned violations:', violations);
            
            progress.report({ increment: 80, message: "Updating dashboard..." });

            // Store violations in dashboard provider
            dashboardProvider.setViolations(violations);
            
            // Update dashboard with results
            console.log('Updating dashboard with violations from pasted code:', violations);
            if (currentPanel && !currentPanel.webview.isDisposed) {
                currentPanel.webview.postMessage({
                    type: 'updateUI',
                    violations: violations,
                    contracts: []
                });
            } else {
                // If no panel is open, show results in a notification
                vscode.window.showInformationMessage(`Found ${violations.length} potential contract violations in pasted code. Open the dashboard to view details.`);
            }
            
            progress.report({ increment: 100, message: "Complete!" });
        });

        vscode.window.showInformationMessage(`Analysis complete for pasted code. Found ${dashboardProvider.getViolations().length} potential violations. Check the dashboard for results.`);

    } catch (error) {
        console.error('Error analyzing pasted code:', error);
        vscode.window.showErrorMessage(`Error analyzing pasted code: ${error.message}`);
    }
}


/**
 * Handle applying contract to code
 */
async function handleApplyContract(contract) {
    try {
        // First try to get the active editor
        let editor = vscode.window.activeTextEditor;
        
        // If no active editor, show a file picker
        if (!editor) {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectMany: false,
                filters: {
                    'Python files': ['py']
                },
                title: 'Select Python file to apply contract'
            });
            
            if (!fileUri || fileUri.length === 0) {
                vscode.window.showInformationMessage('No file selected. Contract not applied.');
                return;
            }
            
            // Open the selected file
            const document = await vscode.workspace.openTextDocument(fileUri[0]);
            editor = await vscode.window.showTextDocument(document);
        }

        if (!editor) {
            vscode.window.showErrorMessage('No editor available to apply contract');
            return;
        }

        // Insert the contract at the top of the file
        const position = new vscode.Position(0, 0);
        await editor.edit(editBuilder => {
            editBuilder.insert(position, contract + '\n\n');
        });

        vscode.window.showInformationMessage(`Contract applied successfully to ${editor.document.fileName}!`);
    } catch (error) {
        console.error('Error applying contract:', error);
        vscode.window.showErrorMessage(`Error applying contract: ${error.message}`);
    }
}

/**
 * Run code in terminal with automatic library detection and installation in venv
 */
async function runCodeInTerminal(code, codeType) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Setting up ${codeType} code execution...`,
            cancellable: false
        }, async (progress) => {
            // Detect required libraries from the code
            const requiredLibraries = detectRequiredLibraries(code);
            
            // Use persistent venv, only create if it doesn't exist
            if (!persistentVenv) {
                progress.report({ increment: 20, message: "Creating persistent virtual environment..." });
                const tempDir = require('os').tmpdir();
                // Use new location with v2 suffix to avoid conflicts with old venv
                persistentVenv = require('path').join(tempDir, 'ml_contract_persistent_venv_v2');
                await createVirtualEnvironment(persistentVenv);
                
                // Pre-install all common ML libraries for better reliability
                progress.report({ increment: 25, message: "Pre-installing common ML libraries..." });
                const commonMLLibraries = ['tensorflow', 'keras', 'torch', 'scikit-learn', 'numpy', 'PyContracts'];
                await installLibrariesInVenv(persistentVenv, commonMLLibraries);
                // Track pre-installed libraries
                commonMLLibraries.forEach(lib => persistentVenvLibraries.add(lib));
                console.log('Pre-installed common ML libraries:', commonMLLibraries);
            } else {
                try {
                    await fs.access(persistentVenv);
                    progress.report({ increment: 20, message: "Using existing persistent virtual environment" });
                } catch (error) {
                    progress.report({ increment: 20, message: "Recreating persistent virtual environment..." });
                    await createVirtualEnvironment(persistentVenv);
                    persistentVenvLibraries.clear(); // Reset library tracking
                    
                    // Pre-install all common ML libraries after recreation
                    progress.report({ increment: 25, message: "Pre-installing common ML libraries..." });
                    const commonMLLibraries = ['tensorflow', 'keras', 'torch', 'scikit-learn', 'numpy', 'PyContracts'];
                    try {
                        await installLibrariesInVenv(persistentVenv, commonMLLibraries);
                        commonMLLibraries.forEach(lib => persistentVenvLibraries.add(lib));
                        console.log('✅ Pre-installed common ML libraries after recreation:', commonMLLibraries);
                    } catch (error) {
                        console.warn('⚠️ Some libraries failed to pre-install:', error.message);
                    }
                }
            }
            
            // Track which libraries need to be installed
            let librariesToInstall = [];
            if (requiredLibraries.length > 0) {
                const missingLibraries = requiredLibraries.filter(lib => !persistentVenvLibraries.has(lib));
                if (missingLibraries.length > 0) {
                    librariesToInstall = missingLibraries;
                    progress.report({ increment: 30, message: `Will install missing libraries: ${missingLibraries.join(', ')}...` });
                } else {
                    progress.report({ increment: 30, message: "All required libraries already installed" });
                }
            }
            
            if (/from\s+tensorflow\.keras|import\s+tensorflow\.keras|from\s+keras|import\s+keras/.test(code)) {
                if (!librariesToInstall.includes('tensorflow') && !persistentVenvLibraries.has('tensorflow')) {
                    librariesToInstall.unshift('tensorflow');
                    console.log('Force adding tensorflow to installation list (required for tensorflow.keras)');
                }
                if (!librariesToInstall.includes('keras') && !persistentVenvLibraries.has('keras')) {
                    librariesToInstall.push('keras');
                    console.log('Force adding keras to installation list (code uses keras imports)');
                }
            }
            
            if (/import\s+tensorflow|from\s+tensorflow/.test(code)) {
                if (!librariesToInstall.includes('tensorflow') && !persistentVenvLibraries.has('tensorflow')) {
                    librariesToInstall.unshift('tensorflow');
                    console.log('Force adding tensorflow to installation list (code uses tensorflow imports)');
                }
            }
            
            const codeUsesContracts = /from\s+contracts\s+import|import\s+contracts|@contract/.test(code);
            if (codeUsesContracts) {
                if (!librariesToInstall.includes('PyContracts') && !persistentVenvLibraries.has('PyContracts')) {
                    librariesToInstall.push('PyContracts');
                    console.log('Force adding PyContracts to installation list (code uses contracts)');
                } else if (persistentVenvLibraries.has('PyContracts')) {
                    console.log('PyContracts already installed, skipping installation');
                }
                if (!librariesToInstall.includes('pyparsing') && !requiredLibraries.includes('pyparsing')) {
                    console.log('PyContracts requires pyparsing (will be auto-added)');
                }
            }
            
            console.log('Detected required libraries:', requiredLibraries);
            console.log('Libraries to install:', librariesToInstall);
            
            const tempDir = require('os').tmpdir();
            const sessionDir = require('path').join(tempDir, `ml_contract_${Date.now()}`);
            
            progress.report({ increment: 20, message: "Preparing code file..." });
            await fs.mkdir(sessionDir, { recursive: true });
            
            // Apply code transformer for compatibility fixes
            const codeTransformer = new CodeTransformer();
            const transformResult = codeTransformer.transformCode(code, {
                addEagerDisable: true,
                addCollectionsFix: false, // We add this in wrapper instead
                trackReplacements: true
            });
            
            const codeToWrite = transformResult.wasTransformed ? transformResult.transformedCode : code;
            if (transformResult.wasTransformed) {
                console.log(`Code transformer applied ${transformResult.replacements.length} replacements`);
                transformResult.replacements.forEach(r => {
                    console.log(`  - ${r.comment}`);
                });
            }
            
            const tempFile = require('path').join(sessionDir, `ml_contract_${codeType}.py`);
            await fs.writeFile(tempFile, codeToWrite, 'utf8');
            
            // Create and show terminal
            progress.report({ increment: 30, message: "Opening terminal..." });
            const terminal = vscode.window.createTerminal({
                name: `ML Contract - ${codeType === 'buggy' ? 'Buggy' : 'Fixed'} Code`,
                cwd: sessionDir,
                shellPath: process.platform === 'win32' ? 'cmd.exe' : undefined
            });
            
            terminal.show();
            
            // Wait for terminal to initialize, then run code
            setTimeout(() => {
                // Activate the persistent virtual environment
                const activateCmd = process.platform === 'win32' 
                    ? `"${require('path').join(persistentVenv, 'Scripts', 'activate.bat').replace(/\\/g, '\\\\')}"`
                    : `source "${require('path').join(persistentVenv, 'bin', 'activate')}"`;
                
                terminal.sendText(activateCmd);
                
                setTimeout(() => {
                    terminal.sendText(`python --version && echo "Python is ready" || echo "WARNING: Python not found in venv"`);
                }, 1000);
                
                // Install libraries if needed, then run code
                if (librariesToInstall.length > 0) {
                    setTimeout(() => {
                        const libraryVersions = getLibraryVersions(librariesToInstall);
                        // All versions are now specific - always use ==
                        // pip will skip if already installed with same version (shows "already satisfied")
                        const installArgs = libraryVersions.map(lib => `${lib.name}==${lib.version}`);
                        
                        terminal.sendText(`echo "Installing missing libraries: ${installArgs.join(' ')}"`);
                        // Skip pip upgrade to avoid permission issues on Windows
                        // Just install packages - pip will handle dependencies
                        terminal.sendText(`pip install ${installArgs.join(' ')}`);
                        terminal.sendText(`echo "Installation complete. Verifying..."`);
                        
                        // Wait longer for large packages (TensorFlow, PyTorch)
                        const hasLargePackage = librariesToInstall.some(lib => 
                            ['tensorflow', 'torch'].includes(lib)
                        );
                        const waitTime = hasLargePackage ? 90000 : 15000; // 90s for large packages, 15s for others
                        
                        setTimeout(async () => {
                            const codeUsesContracts = /from\s+contracts\s+import|import\s+contracts|@contract/.test(code);
                            
                            if (librariesToInstall.includes('tensorflow')) {
                                terminal.sendText(`python -c "import tensorflow as tf; print(f'✓ TensorFlow {tf.__version__} installed')" || echo "✗ TensorFlow verification failed"`);
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }
                            
                            if (codeUsesContracts) {
                                const verifyScript = `import collections; import collections.abc; collections.Container = collections.abc.Container; collections.Iterable = collections.abc.Iterable; collections.Iterator = collections.abc.Iterator; collections.Callable = collections.abc.Callable; collections.Mapping = collections.abc.Mapping; collections.MutableMapping = collections.abc.MutableMapping; collections.Sequence = collections.abc.Sequence; collections.MutableSequence = collections.abc.MutableSequence; collections.Set = collections.abc.Set; collections.MutableSet = collections.abc.MutableSet; collections.Hashable = collections.abc.Hashable; collections.Sized = collections.abc.Sized; from contracts import contract; print('✓ PyContracts installed')`;
                                terminal.sendText(`python -c "${verifyScript}" || (echo "✗ PyContracts not found, installing..." && pip install PyContracts==1.8.12 pyparsing==2.4.7)`);
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                terminal.sendText(`python -c "${verifyScript}" || echo "✗ PyContracts installation failed - code may not work"`);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            } else if (librariesToInstall.includes('PyContracts')) {
                                const verifyScript = `import collections; import collections.abc; collections.Container = collections.abc.Container; collections.Iterable = collections.abc.Iterable; collections.Iterator = collections.abc.Iterator; collections.Callable = collections.abc.Callable; collections.Mapping = collections.abc.Mapping; collections.MutableMapping = collections.abc.MutableMapping; collections.Sequence = collections.abc.Sequence; collections.MutableSequence = collections.abc.MutableSequence; collections.Set = collections.abc.Set; collections.MutableSet = collections.abc.MutableSet; collections.Hashable = collections.abc.Hashable; collections.Sized = collections.abc.Sized; from contracts import contract; print('✓ PyContracts installed')`;
                                terminal.sendText(`python -c "${verifyScript}" || echo "✗ PyContracts verification failed"`);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                            
                            if (librariesToInstall.includes('torch')) {
                                terminal.sendText(`python -c "import torch; print(f'✓ PyTorch {torch.__version__} installed')" || echo "✗ PyTorch verification failed"`);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                            if (librariesToInstall.includes('numpy')) {
                                terminal.sendText(`python -c "import numpy as np; print(f'✓ NumPy {np.__version__} installed')" || echo "✗ NumPy verification failed"`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                            
                            try {
                                librariesToInstall.forEach(lib => persistentVenvLibraries.add(lib));
                                if (codeUsesContracts) {
                                    persistentVenvLibraries.add('PyContracts');
                                }
                                
                                const escapedPath = tempFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                                const wrapperScript = `# Apply collections compatibility fix for PyContracts
import collections
import collections.abc

# Apply compatibility patches for PyContracts
try:
    collections.Container = collections.abc.Container
    collections.Iterable = collections.abc.Iterable
    collections.Callable = collections.abc.Callable
    collections.Mapping = collections.abc.Mapping
    collections.MutableMapping = collections.abc.MutableMapping
    collections.Sequence = collections.abc.Sequence
    collections.MutableSequence = collections.abc.MutableSequence
    collections.Set = collections.abc.Set
    collections.MutableSet = collections.abc.MutableSet
    collections.Hashable = collections.abc.Hashable
    collections.Iterator = collections.abc.Iterator
    collections.Sized = collections.abc.Sized
except AttributeError:
    pass

# Run the actual code
exec(open(r"${escapedPath}").read())`;
                                
                                const wrapperFile = require('path').join(sessionDir, 'wrapper.py');
                                await fs.writeFile(wrapperFile, wrapperScript);
                                
                                // Escape path for terminal command (Windows-safe)
                                const escapedWrapperPath = process.platform === 'win32'
                                    ? wrapperFile.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                                    : wrapperFile.replace(/'/g, "\\'");
                                
                                const pythonCmd = process.platform === 'win32'
                                    ? `python "${escapedWrapperPath}"`
                                    : `python '${escapedWrapperPath}'`;
                                
                                // Final check: Verify PyContracts is available before running (if code uses it)
                                const codeUsesContractsFinal = /from\s+contracts\s+import|import\s+contracts|@contract/.test(code);
                                if (codeUsesContractsFinal) {
                                    // Use verification with collections fix
                                    const verifyScript = `import collections; import collections.abc; collections.Container = collections.abc.Container; collections.Iterable = collections.abc.Iterable; collections.Iterator = collections.abc.Iterator; collections.Callable = collections.abc.Callable; collections.Mapping = collections.abc.Mapping; collections.MutableMapping = collections.abc.MutableMapping; collections.Sequence = collections.abc.Sequence; collections.MutableSequence = collections.abc.MutableSequence; collections.Set = collections.abc.Set; collections.MutableSet = collections.abc.MutableSet; collections.Hashable = collections.abc.Hashable; collections.Sized = collections.abc.Sized; from contracts import contract`;
                                    terminal.sendText(`python -c "${verifyScript}" 2>&1 || (echo "Installing PyContracts..." && pip install -q PyContracts==1.8.12 pyparsing==2.4.7 && python -c "${verifyScript}; print('PyContracts ready')")`);
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                }
                                
                                terminal.sendText(`echo "Running ${codeType} code with compatibility fix..."`);
                                terminal.sendText(pythonCmd);
                            } catch (error) {
                                console.error('Error creating wrapper script:', error);
                                terminal.sendText(`echo "Error: ${error.message}"`);
                            }
                        }, waitTime); // Wait for installation to complete (dynamic based on package size)
                    }, 2000);
                } else {
                    const codeUsesContracts = /from\s+contracts\s+import|import\s+contracts|@contract/.test(code);
                    
                    setTimeout(async () => {
                        if (codeUsesContracts) {
                            const verifyScript = `import collections; import collections.abc; collections.Container = collections.abc.Container; collections.Iterable = collections.abc.Iterable; collections.Iterator = collections.abc.Iterator; collections.Callable = collections.abc.Callable; collections.Mapping = collections.abc.Mapping; collections.MutableMapping = collections.abc.MutableMapping; collections.Sequence = collections.abc.Sequence; collections.MutableSequence = collections.abc.MutableSequence; collections.Set = collections.abc.Set; collections.MutableSet = collections.abc.MutableSet; collections.Hashable = collections.abc.Hashable; collections.Sized = collections.abc.Sized; from contracts import contract; print('✓ PyContracts available')`;
                            terminal.sendText(`python -c "${verifyScript}" || (echo "✗ PyContracts not found, installing..." && pip install PyContracts==1.8.12 pyparsing==2.4.7 && python -c "${verifyScript}")`);
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                        
                        try {
                            const escapedPath = tempFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                            const wrapperScript = `# Apply collections compatibility fix for PyContracts
import collections
import collections.abc

# Apply compatibility patches for PyContracts
try:
    collections.Container = collections.abc.Container
    collections.Iterable = collections.abc.Iterable
    collections.Callable = collections.abc.Callable
    collections.Mapping = collections.abc.Mapping
    collections.MutableMapping = collections.abc.MutableMapping
    collections.Sequence = collections.abc.Sequence
    collections.MutableSequence = collections.abc.MutableSequence
    collections.Set = collections.abc.Set
    collections.MutableSet = collections.abc.MutableSet
    collections.Hashable = collections.abc.Hashable
    collections.Iterator = collections.abc.Iterator
    collections.Sized = collections.abc.Sized
except AttributeError:
    pass

# Run the actual code
exec(open(r"${escapedPath}").read())`;
                            
                            const wrapperFile = require('path').join(sessionDir, 'wrapper.py');
                            await fs.writeFile(wrapperFile, wrapperScript);
                            
                            // Escape path for terminal command (Windows-safe)
                            const escapedWrapperPath = process.platform === 'win32'
                                ? wrapperFile.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                                : wrapperFile.replace(/'/g, "\\'");
                            
                            const pythonCmd = process.platform === 'win32'
                                ? `python "${escapedWrapperPath}"`
                                : `python '${escapedWrapperPath}'`;
                            
                            // Final check: Verify PyContracts is available before running (if code uses it)
                            const codeUsesContractsFinal = /from\s+contracts\s+import|import\s+contracts|@contract/.test(code);
                            if (codeUsesContractsFinal) {
                                // Use verification with collections fix
                                const verifyScript = `import collections; import collections.abc; collections.Container = collections.abc.Container; collections.Iterable = collections.abc.Iterable; collections.Iterator = collections.abc.Iterator; collections.Callable = collections.abc.Callable; collections.Mapping = collections.abc.Mapping; collections.MutableMapping = collections.abc.MutableMapping; collections.Sequence = collections.abc.Sequence; collections.MutableSequence = collections.abc.MutableSequence; collections.Set = collections.abc.Set; collections.MutableSet = collections.abc.MutableSet; collections.Hashable = collections.abc.Hashable; collections.Sized = collections.abc.Sized; from contracts import contract`;
                                terminal.sendText(`python -c "${verifyScript}" 2>&1 || (echo "Installing PyContracts..." && pip install -q PyContracts==1.8.12 pyparsing==2.4.7 && python -c "${verifyScript}; print('PyContracts ready')")`);
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }
                            
                            terminal.sendText(`echo "Running ${codeType} code with compatibility fix..."`);
                            terminal.sendText(pythonCmd);
                        } catch (error) {
                            console.error('Error creating wrapper script:', error);
                            terminal.sendText(`echo "Error: ${error.message}"`);
                        }
                    }, 1000);
                }
            }, 1000);
            
            // Clean up only the temporary file, not the venv
            setTimeout(async () => {
                try {
                    await fs.rm(sessionDir, { recursive: true, force: true });
                } catch (error) {
                    console.warn('Could not clean up temp file:', error.message);
                }
            }, 30000);
        });
        
        vscode.window.showInformationMessage(
            `Running ${codeType} code in persistent virtual environment. Check the terminal for output.`
        );
        
    } catch (error) {
        console.error('Error running code:', error);
        vscode.window.showErrorMessage(`Error running code: ${error.message}`);
    }
}

/**
 * Detect required libraries from Python code
 */
function detectRequiredLibraries(code) {
    const libraries = [];
    const importPatterns = [
        /^import\s+(\w+)/gm,           // Match "import tensorflow" at start of line
        /^from\s+(\w+)\s+import/gm,     // Match "from tensorflow import" at start of line
        /^from\s+(\w+)\./gm,            // Match "from tensorflow.keras" -> captures "tensorflow"
        /import\s+(\w+)/g,              // Match "import tensorflow" anywhere
        /from\s+(\w+)\s+import/g,      // Match "from tensorflow import" anywhere
        /from\s+(\w+)\./g,              // Match "from tensorflow.keras" anywhere
        /import\s+(\w+)\./g             // Match "import tensorflow.keras" anywhere
    ];
    
    const commonLibraries = {
        'tensorflow': 'tensorflow',
        'tf': 'tensorflow',
        'keras': 'keras',  // Changed: keras is now a separate package for standalone imports
        'torch': 'torch',
        'pytorch': 'torch',
        'sklearn': 'scikit-learn',
        'numpy': 'numpy',
        'np': 'numpy',
        'pandas': 'pandas',
        'pd': 'pandas',
        'matplotlib': 'matplotlib',
        'plt': 'matplotlib',
        'seaborn': 'seaborn',
        'contracts': 'PyContracts',
        'contract': 'PyContracts'
    };
    
    for (const pattern of importPatterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
            const lib = match[1].toLowerCase();
            if (commonLibraries[lib] && !libraries.includes(commonLibraries[lib])) {
                libraries.push(commonLibraries[lib]);
            }
        }
    }
    
    return libraries;
}

/**
 * Create a virtual environment
 */
async function createVirtualEnvironment(venvPath) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        
        console.log('Creating virtual environment at:', venvPath);
        
        const childProcess = spawn('python', ['-m', 'venv', venvPath], {
            stdio: 'inherit',
            shell: true
        });
        
        childProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Virtual environment created successfully');
                resolve();
            } else {
                reject(new Error(`Failed to create virtual environment. Exit code: ${code}`));
            }
        });
        
        childProcess.on('error', (error) => {
            reject(new Error(`Failed to create virtual environment: ${error.message}`));
        });
    });
}

/**
 * Install required libraries in virtual environment with specific versions
 */
async function installLibrariesInVenv(venvPath, libraries) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        
        const pipPath = process.platform === 'win32' 
            ? require('path').join(venvPath, 'Scripts', 'pip.exe')
            : require('path').join(venvPath, 'bin', 'pip');
        
        // Map libraries to specific stable versions
        const libraryVersions = getLibraryVersions(libraries);
        const installArgs = libraryVersions.map(lib => `${lib.name}==${lib.version}`);
        
        console.log('Installing libraries in venv with versions:', installArgs.join(' '));
        
        const childProcess = spawn(pipPath, ['install', ...installArgs], {
            stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout and stderr
            shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        childProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            // Also log to console for visibility
            console.log('pip install:', output.trim());
        });
        
        childProcess.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            // Log warnings but don't fail
            if (!output.includes('WARNING') && !output.includes('DEPRECATION')) {
                console.warn('pip install stderr:', output.trim());
            }
        });
        
        childProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Libraries installed successfully in venv');
                console.log('Installation output:', stdout.substring(0, 500));
                resolve();
            } else {
                console.warn('Library installation in venv completed with warnings');
                console.warn('Exit code:', code);
                console.warn('Error output:', stderr.substring(0, 500));
                // Still resolve to continue, but log the error
                resolve();
            }
        });
        
        childProcess.on('error', (error) => {
            console.error('Library installation error in venv:', error.message);
            console.error('Full error:', error);
            // Reject for critical errors (venv not found, etc.)
            if (error.code === 'ENOENT') {
                reject(new Error(`Virtual environment not found or pip not available: ${error.message}`));
            } else {
                // For other errors, still resolve but log warning
                console.warn('Non-critical installation error, continuing...');
                resolve();
            }
        });
    });
}

/**
 * Get specific versions for libraries to ensure compatibility
 */
function getLibraryVersions(libraries) {
    const versionMap = {
        'tensorflow': { name: 'tensorflow', version: '2.10.0' }, // Stable version with good numpy support
        'keras': { name: 'keras', version: '2.10.0' }, // TensorFlow 2.10.0 requires keras>=2.10.0,<2.11
        'torch': { name: 'torch', version: '1.13.1' }, // Stable PyTorch version
        'scikit-learn': { name: 'scikit-learn', version: '1.1.3' }, // Compatible with numpy 1.21
        'numpy': { name: 'numpy', version: '1.21.6' }, // Compatible with TensorFlow 2.10 and PyContracts
        'pandas': { name: 'pandas', version: '1.5.3' }, // Compatible with numpy 1.21
        'matplotlib': { name: 'matplotlib', version: '3.6.3' }, // Compatible with numpy 1.21
        'seaborn': { name: 'seaborn', version: '0.12.2' },
        'PyContracts': { name: 'PyContracts', version: '1.8.12' } // Compatible with numpy 1.21.6
    };
    
    const result = [];
    const processed = new Set();
    
    // Sort libraries to install dependencies first
    const dependencyOrder = ['numpy', 'tensorflow', 'keras', 'torch', 'scikit-learn', 'pandas', 'matplotlib', 'seaborn', 'PyContracts'];
    const orderedLibraries = [...dependencyOrder.filter(lib => libraries.includes(lib)), 
                              ...libraries.filter(lib => !dependencyOrder.includes(lib))];
    
    for (const lib of orderedLibraries) {
        if (processed.has(lib)) continue;
        processed.add(lib);
        
        const version = versionMap[lib];
        if (version) {
            result.push(version);
        } else {
            // For unknown libraries, throw error - don't use 'latest'
            console.error(`Unknown library: ${lib} - No compatible version specified. Please add to versionMap.`);
            throw new Error(`Unknown library: ${lib} - Cannot determine compatible version`);
        }
    }
    
    if (!result.some(r => r.name === 'numpy')) {
        const needsNumpy = ['tensorflow', 'torch', 'scikit-learn', 'pandas', 'matplotlib', 'PyContracts'];
        if (libraries.some(lib => needsNumpy.includes(lib))) {
            result.unshift({ name: 'numpy', version: '1.21.6' }); // Add at beginning
        }
    }
    
    if (libraries.includes('PyContracts')) {
        if (!result.some(r => r.name === 'pyparsing')) {
            result.push({ name: 'pyparsing', version: '2.4.7' });
        }
        if (!result.some(r => r.name === 'numpy')) {
            result.unshift({ name: 'numpy', version: '1.21.6' }); // Add at beginning
        }
    }
    
    if (libraries.includes('tensorflow') && !result.some(r => r.name === 'keras')) {
        result.push({ name: 'keras', version: '2.10.0' });
    }
    if (libraries.includes('keras') && !result.some(r => r.name === 'tensorflow')) {
        const tfIndex = result.findIndex(r => r.name === 'tensorflow');
        if (tfIndex === -1) {
            // Find numpy index to insert after it
            const numpyIndex = result.findIndex(r => r.name === 'numpy');
            result.splice(numpyIndex + 1, 0, { name: 'tensorflow', version: '2.10.0' });
        }
        if (!result.some(r => r.name === 'keras')) {
            result.push({ name: 'keras', version: '2.10.0' });
        }
    }
    
    return result;
}

/**
 * Install required libraries using pip (legacy function for non-venv usage)
 */
async function installLibraries(libraries) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        
        const installCommand = `pip install ${libraries.join(' ')}`;
        console.log('Installing libraries:', installCommand);
        
        const childProcess = spawn('pip', ['install', ...libraries], {
            stdio: 'inherit',
            shell: true
        });
        
        childProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Libraries installed successfully');
                resolve();
            } else {
                console.warn('Library installation completed with warnings');
                resolve(); // Continue even if some libraries fail
            }
        });
        
        childProcess.on('error', (error) => {
            console.warn('Library installation error:', error.message);
            resolve(); // Continue even if installation fails
        });
    });
}

/**
 * Extension deactivation function
 */
function deactivate() {
    console.log('ML Contract Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
