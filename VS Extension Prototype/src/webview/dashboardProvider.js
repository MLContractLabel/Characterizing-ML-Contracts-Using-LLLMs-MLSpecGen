const vscode = require('vscode');
const path = require('path');

class DashboardProvider {
    constructor(extensionUri, ragService, codeAnalyzer, detectViolationsFn, generateContractsFn) {
        this.extensionUri = extensionUri;
        this.ragService = ragService;
        this.codeAnalyzer = codeAnalyzer;
        this.detectViolationsFn = detectViolationsFn;
        this.generateContractsFn = generateContractsFn;
        this.violations = [];
        this.contracts = [];
    }

    getHtmlForWebview(webview) {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'dashboard.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>ML Contract Dashboard</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="dashboard">
        <!-- Header -->
        <header class="dashboard-header">
            <div class="header-content">
                <div class="header-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="header-text">
                    <h1>ML Contract Violation Detector</h1>
                    <p>AI-powered detection and automatic fixing of ML API contract violations</p>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="dashboard-content">
            <!-- Analysis Panel -->
            <div class="analysis-panel">
                <div class="panel-header">
                    <h2>Code Analysis</h2>
                    <div class="panel-badge">
                        <span class="badge">Ready</span>
                    </div>
                </div>
                
                <div class="input-section">
                    <div class="input-group">
                        <div class="input-wrapper">
                            <label for="fileNameInput">Python File to Analyze</label>
                            <input type="text" id="fileNameInput" placeholder="Enter filename (e.g., model.py)" class="file-input">
                        </div>
                        <button id="detectBtn" class="btn btn-primary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
                                <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Detect Violations
                        </button>
                    </div>
                    <div class="input-help">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                            <path d="M9.09 9A3 3 0 0 1 12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Enter the name of a Python file currently open in VS Code
                    </div>
                    
                    <div class="input-divider">
                        <span>or</span>
                    </div>
                    
                    <div class="paste-section">
                        <button id="pasteCodeBtn" class="btn btn-secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke="currentColor" stroke-width="2"/>
                                <path d="M16 4H18C19.1 4 20 4.9 20 6V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V6C4 4.9 4.9 4 6 4H8" stroke="currentColor" stroke-width="2"/>
                            </svg>
                            Paste Code Directly
                        </button>
                        <div class="paste-help">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                <path d="M9.09 9A3 3 0 0 1 12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Paste Python code directly for analysis without opening a file
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="action-section">
                    <button id="generateBtn" class="btn btn-secondary" disabled>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Generate PyContracts
                    </button>
                </div>

                <!-- Status Section -->
                <div class="status-section">
                    <div id="status" class="status-info">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                            <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Ready to analyze your Python code for ML contract violations.
                    </div>
                </div>
            </div>

            <!-- Results Panel -->
            <div class="results-panel">
                <!-- File Results Section -->
                <div id="fileResultsSection" class="result-section" style="display: none;">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H6A2 2 0 0 0 4 4V20A2 2 0 0 0 6 22H18A2 2 0 0 0 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Analysis Summary
                        </h3>
                    </div>
                    <div id="fileResultsList" class="file-results-list">
                        <!-- File results will be populated here -->
                    </div>
                </div>

                <!-- Violations Section -->
                <div id="violationsSection" class="result-section" style="display: none;">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2"/>
                                <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2"/>
                            </svg>
                            Detected Violations
                        </h3>
                    </div>
                    <div id="violationsList" class="violations-list">
                        <!-- Violations will be populated here -->
                    </div>
                </div>

                <!-- Contracts Section -->
                <div id="contractsSection" class="result-section" style="display: none;">
                    <div class="section-header">
                        <h3>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H6A2 2 0 0 0 4 4V20A2 2 0 0 0 6 22H18A2 2 0 0 0 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Generated PyContracts
                        </h3>
                    </div>
                    <div id="contractsList" class="contracts-list">
                        <!-- Contracts will be populated here -->
                    </div>
                </div>

            </div>

            <!-- Help Panel -->
            <div class="help-panel">
                <div class="help-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                            <path d="M9.09 9A3 3 0 0 1 12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        How to Use
                    </h3>
                </div>
                <div class="help-content">
                    <div class="help-step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <strong>Open Python File</strong>
                            <p>Open a Python file with ML code (TensorFlow, Keras, PyTorch, etc.)</p>
                        </div>
                    </div>
                    <div class="help-step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <strong>Detect Violations</strong>
                            <p>Click "Detect Violations" to analyze your code for contract issues</p>
                        </div>
                    </div>
                    <div class="help-step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <strong>Review Results</strong>
                            <p>Examine detected violations and their detailed classifications</p>
                        </div>
                    </div>
                    <div class="help-step">
                        <div class="step-number">4</div>
                        <div class="step-content">
                            <strong>Generate Contracts</strong>
                            <p>Click "Generate PyContracts" to create executable contract specifications</p>
                        </div>
                    </div>
                    <div class="help-step">
                        <div class="step-number">5</div>
                        <div class="step-content">
                            <strong>Apply Fixes</strong>
                            <p>Apply the generated contracts to your code automatically</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        <!-- Violation Details Modal -->
        <div id="violationDetailsModal" class="modal" style="display: none;">
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                            <path d="M9.09 9A3 3 0 0 1 12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Contract Violation Details
                    </h3>
                    <button id="closeViolationModalBtn" class="modal-close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="violationDetailsContent">
                        <!-- Violation details will be populated here -->
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="closeViolationDetailsBtn" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Close
                    </button>
                </div>
            </div>
        </div>

        <!-- Paste Code Modal -->
        <div id="pasteCodeModal" class="modal" style="display: none;">
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke="currentColor" stroke-width="2"/>
                            <path d="M16 4H18C19.1 4 20 4.9 20 6V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V6C4 4.9 4.9 4 6 4H8" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        Paste Python Code
                    </h3>
                    <button id="closeModalBtn" class="modal-close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="modal-description">
                        <p>Paste your Python code below for ML contract violation analysis. The code will be analyzed for potential contract violations without needing to save it to a file.</p>
                    </div>
                    <div class="code-input-section">
                        <label for="codeTextarea">Python Code:</label>
                        <textarea id="codeTextarea" placeholder="Paste your Python code here...

Example:
import tensorflow as tf
import numpy as np

def create_model():
    model = tf.keras.Sequential([
        tf.keras.layers.Dense(64, activation='relu', input_shape=(10,)),
        tf.keras.layers.Dense(1, activation='sigmoid')
    ])
    return model

def train_model():
    model = create_model()
    model.compile(optimizer='adam', loss='binary_crossentropy')
    
    # Generate sample data
    X_train = np.random.random((1000, 10))
    y_train = np.random.randint(0, 2, (1000, 1))
    
    # Train model
    model.fit(X_train, y_train, epochs=10, batch_size=32)
    
    # Potential violation: predict without proper input validation
    X_test = np.random.random((100, 10))
    predictions = model.predict(X_test)
    
    return predictions"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancelPasteBtn" class="btn btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Cancel
                    </button>
                    <button id="analyzePastedCodeBtn" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
                            <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Analyze Code
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;

        class MLContractDashboard {
            constructor() {
                this.violations = [];
                this.contracts = [];
                this.initializeEventListeners();
            }

            initializeEventListeners() {
                document.getElementById('detectBtn').addEventListener('click', () => {
                    this.detectViolations();
                });

                document.getElementById('generateBtn').addEventListener('click', () => {
                    this.generateContracts();
                });

                document.getElementById('pasteCodeBtn').addEventListener('click', () => {
                    this.openPasteCodeModal();
                });

                document.getElementById('closeModalBtn').addEventListener('click', () => {
                    this.closePasteCodeModal();
                });

                document.getElementById('cancelPasteBtn').addEventListener('click', () => {
                    this.closePasteCodeModal();
                });

                document.getElementById('analyzePastedCodeBtn').addEventListener('click', () => {
                    this.analyzePastedCode();
                });

                document.getElementById('fileNameInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.detectViolations();
                    }
                });

                document.getElementById('pasteCodeModal').addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-overlay')) {
                        this.closePasteCodeModal();
                    }
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closePasteCodeModal();
                        this.closeViolationDetailsModal();
                    }
                });

                document.getElementById('closeViolationModalBtn').addEventListener('click', () => {
                    this.closeViolationDetailsModal();
                });

                document.getElementById('closeViolationDetailsBtn').addEventListener('click', () => {
                    this.closeViolationDetailsModal();
                });

                // Close violation modal on overlay click
                document.getElementById('violationDetailsModal').addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-overlay')) {
                        this.closeViolationDetailsModal();
                    }
                });

                window.addEventListener('message', (event) => {
                    console.log('Dashboard: Received message from extension:', event.data);
                    const message = event.data;
                    switch (message.type) {
                        case 'updateUI':
                            console.log('Dashboard: updateUI message received, violations:', message.violations);
                            this.updateUI(message.violations, message.contracts);
                            break;
                        case 'showError':
                            this.showError(message.message);
                            break;
                        case 'showSuccess':
                            this.showSuccess(message.message);
                            break;
                        case 'showViolationDetails':
                            this.showViolationDetailsModal(message.violation);
                            break;
                    }
                });
            }

            detectViolations() {
                console.log('Detect violations button clicked');
                
                const fileNameInput = document.getElementById('fileNameInput');
                const fileName = fileNameInput.value.trim();
                
                if (!fileName) {
                    this.showError('Please enter a file name');
                    fileNameInput.focus();
                    return;
                }
                
                if (!fileName.endsWith('.py')) {
                    this.showError('File must be a Python file (.py)');
                    fileNameInput.focus();
                    return;
                }
                
                this.updateStatus('🔍 Detecting contract violations...', 'info');
                this.sendMessage({ 
                    type: 'detectViolations',
                    fileName: fileName
                });
            }

            generateContracts() {
                console.log('Generate contracts button clicked');
                this.updateStatus('⚡ Generating PyContracts...', 'info');
                this.sendMessage({ type: 'generateContracts' });
            }

            async generateContractsFromViolations() {
                if (!this.violations || this.violations.length === 0) {
                    this.showError('No violations found. Please run "Detect Contract Violations" first.');
                    return;
                }

                try {
                    this.updateStatus('⚡ Generating PyContracts...', 'info');
                    
                    const contracts = await this.ragService.generateContracts(this.violations);
                    
                    this.contracts = contracts;
                    this.updateUI();
                    
                    this.updateStatus('Generated ' + contracts.length + ' PyContracts!', 'success');
                    
                } catch (error) {
                    console.error('Error generating contracts:', error);
                    this.showError('Error generating contracts: ' + error.message);
                }
            }

            sendMessage(message) {
                console.log('Attempting to send message:', message);
                if (window.vscode && window.vscode.postMessage) {
                    window.vscode.postMessage(message);
                    console.log('Message sent successfully');
                } else {
                    console.error('VS Code API not available. Available objects:', Object.keys(window));
                    // Try alternative method
                    if (window.parent && window.parent.postMessage) {
                        window.parent.postMessage(message, '*');
                        console.log('Message sent via parent window');
                    }
                }
            }

            updateUI(violations, contracts, fileResults) {
                this.violations = Array.isArray(violations) ? violations : (violations ? [violations] : []);
                this.contracts = Array.isArray(contracts) ? contracts : (contracts ? [contracts] : []);
                this.fileResults = fileResults || [];

                this.updateViolationsSection();
                this.updateContractsSection();
                this.updateFileResultsSection();
                this.updateButtons();
                this.updateStatus();
            }

            updateViolationsSection() {
                const section = document.getElementById('violationsSection');
                const list = document.getElementById('violationsList');

                console.log('Updating violations section, violations:', this.violations);
                console.log('Violations length:', this.violations.length);

                if (!this.violations || this.violations.length === 0) {
                    section.style.display = 'none';
                    return;
                }

                section.style.display = 'block';
                list.innerHTML = '';

                this.violations.forEach((violation, index) => {
                    console.log('Creating violation element for:', violation);
                    const violationElement = this.createViolationElement(violation, index);
                    list.appendChild(violationElement);
                });
            }

            updateContractsSection() {
                const section = document.getElementById('contractsSection');
                const list = document.getElementById('contractsList');

                if (this.contracts.length === 0) {
                    section.style.display = 'none';
                    return;
                }

                section.style.display = 'block';
                list.innerHTML = '';

                this.contracts.forEach((contract, index) => {
                    const contractElement = this.createContractElement(contract, index);
                    list.appendChild(contractElement);
                });
            }

            updateFileResultsSection() {
                const section = document.getElementById('fileResultsSection');
                const list = document.getElementById('fileResultsList');

                if (!this.fileResults || this.fileResults.length === 0) {
                    section.style.display = 'none';
                    return;
                }

                section.style.display = 'block';
                list.innerHTML = '';

                this.fileResults.forEach((fileResult, index) => {
                    const fileElement = this.createFileResultElement(fileResult, index);
                    list.appendChild(fileElement);
                });
            }

            createViolationElement(violation, index) {
                const div = document.createElement('div');
                div.className = 'violation-item';
                
                const labels = violation.labels || {};
                const codeAnalysis = violation.codeAnalysis || {};
                const mlAPIs = codeAnalysis.mlAPIs || [];
                const sourceFile = violation.sourceFile || 'Current file';
                
                div.innerHTML = \`
                    <div class="violation-header">
                        <h4>Violation \${index + 1}</h4>
                    </div>
                    <div class="violation-details">
                        <div class="violation-grid">
                            <div class="violation-section">
                                <h5>Contract Classification</h5>
                                <div class="label-grid">
                                    <div class="label-item">
                                        <span class="label-name">Level 1:</span>
                                        <span class="label-value">\${labels.level1 || 'Not specified'}</span>
                                    </div>
                                    <div class="label-item">
                                        <span class="label-name">Level 2:</span>
                                        <span class="label-value">\${labels.level2 || 'Not specified'}</span>
                                    </div>
                                    <div class="label-item">
                                        <span class="label-name">Level 3:</span>
                                        <span class="label-value">\${labels.level3 || 'Not specified'}</span>
                                    </div>
                                    <div class="label-item">
                                        <span class="label-name">Leaf Category:</span>
                                        <span class="label-value">\${labels.leafContractCategory || 'Not specified'}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="violation-section">
                                <h5>Violation Analysis</h5>
                                <div class="label-grid">
                                    <div class="label-item">
                                        <span class="label-name">Root Cause:</span>
                                        <span class="label-value">\${labels.rootCause || 'Not specified'}</span>
                                    </div>
                                    <div class="label-item">
                                        <span class="label-name">Effect:</span>
                                        <span class="label-value">\${labels.effect || 'Not specified'}</span>
                                    </div>
                                    <div class="label-item">
                                        <span class="label-name">Location:</span>
                                        <span class="label-value">\${labels.contractViolationLocation || 'Not specified'}</span>
                                    </div>
                                    <div class="label-item">
                                        <span class="label-name">Detection:</span>
                                        <span class="label-value">\${labels.detectionTechnique || 'Not specified'}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="violation-section">
                                <h5>Technical Details</h5>
                                <div class="label-grid">
                                    <div class="label-item full-width">
                                        <span class="label-name">ML APIs:</span>
                                        <span class="label-value">\${mlAPIs.length > 0 ? mlAPIs.join(', ') : 'None detected'}</span>
                                    </div>
                                    <div class="label-item full-width">
                                        <span class="label-name">Source:</span>
                                        <span class="label-value">\${sourceFile}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="violation-actions">
                        <button class="btn btn-small btn-info" onclick="dashboard.showViolationDetails(\${index})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                <path d="M9.09 9A3 3 0 0 1 12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            View Details
                        </button>
                    </div>
                \`;
                return div;
            }

            createFileResultElement(fileResult, index) {
                const div = document.createElement('div');
                div.className = 'file-result-item';
                
                const statusIcon = fileResult.error ? '❌' : 
                                 fileResult.violationCount > 0 ? '⚠️' : 
                                 fileResult.hasMLCode ? '✅' : 'ℹ️';
                
                const statusText = fileResult.error ? 'Error' :
                                 fileResult.violationCount > 0 ? fileResult.violationCount + ' violations' :
                                 fileResult.hasMLCode ? 'No violations' : 'No ML code';
                
                div.innerHTML = \`
                    <div class="file-result-header">
                        <h4>\${statusIcon} \${fileResult.fileName}</h4>
                        <span class="file-status">\${statusText}</span>
                    </div>
                    <div class="file-result-details">
                        <div class="detail-row">
                            <strong>Path:</strong> \${fileResult.filePath}
                        </div>
                        \${fileResult.error ? \`
                        <div class="detail-row error">
                            <strong>Error:</strong> \${fileResult.error}
                        </div>
                        \` : ''}
                    </div>
                \`;
                return div;
            }

            createContractElement(contract, index) {
                const div = document.createElement('div');
                div.className = 'contract-item';
                div.innerHTML = \`
                    <div class="contract-header">
                        <h4>Contract \${index + 1}</h4>
                        <div class="contract-badge">
                            <span class="contract-type">Contract Violation (Level 1): \${contract.violation.labels.level1} | Contract Violation (Level 2): \${contract.violation.labels.level2}</span>
                            \${contract.autoImproved ? '<span class="auto-improved-badge">🔄 Auto-Improved</span>' : ''}
                        </div>
                    </div>
                    <div class="contract-content">
                        <div class="code-comparison">
                            <div class="code-column buggy-column">
                                <h5>🐛 Buggy Code (Violates Contract)</h5>
                                <pre><code>\${this.escapeHtml(contract.buggyCode)}</code></pre>
                            </div>
                            <div class="code-column fixed-column">
                                <h5>✅ Fixed Code (Satisfies Contract)</h5>
                                <pre><code>\${this.escapeHtml(contract.fixedCode)}</code></pre>
                            </div>
                        </div>
                        <div class="contract-details">
                            <div class="contract-nlp">
                                <h5>📋 Contract Description:</h5>
                                <p>\${this.escapeHtml(contract.nlpContract)}</p>
                            </div>
                            <div class="contract-insight">
                                <h5>💡 Actionable Insight:</h5>
                                <p>\${this.escapeHtml(contract.actionableInsight)}</p>
                            </div>
                        </div>
                    </div>
                    <div class="contract-actions">
                        <button class="btn btn-small btn-danger" onclick="dashboard.runBuggyCode(\${index})">
                            🐛 Apply Buggy Code
                        </button>
                        <button class="btn btn-small btn-success" onclick="dashboard.runFixedCode(\${index})">
                            ✅ Apply Fixed Code
                        </button>
                        <button class="btn btn-small" onclick="dashboard.copyContract(\${index})">
                            📋 Copy Fixed Code
                        </button>
                    </div>
                \`;
                return div;
            }

            updateButtons() {
                const detectBtn = document.getElementById('detectBtn');
                const generateBtn = document.getElementById('generateBtn');

                // Enable generate button if violations are detected
                generateBtn.disabled = this.violations.length === 0;
            }

            updateStatus() {
                const status = document.getElementById('status');
                
                if (this.violations.length === 0 && this.contracts.length === 0) {
                    status.textContent = 'Ready to analyze your Python code for ML contract violations.';
                    status.className = 'status-info';
                } else if (this.violations.length > 0 && this.contracts.length === 0) {
                    status.textContent = \`Found \${this.violations.length} potential contract violations. Click "Generate PyContracts" to create specifications.\`;
                    status.className = 'status-warning';
                } else if (this.contracts.length > 0) {
                    status.textContent = \`Generated \${this.contracts.length} PyContracts. Review and apply them to your code.\`;
                    status.className = 'status-success';
                }
            }

            showViolationDetails(index) {
                const violation = this.violations[index];
                if (violation) {
                    this.showViolationDetailsModal(violation);
                } else {
                    console.error('Violation not found at index:', index);
                }
            }

            runBuggyCode(index) {
                const contract = this.contracts[index];
                if (!contract || !contract.buggyCode) {
                    this.showError('No buggy code available to run');
                    return;
                }
                
                this.updateStatus('Running buggy code in terminal...', 'info');
                this.sendMessage({
                    type: 'runCode',
                    code: contract.buggyCode,
                    codeType: 'buggy'
                });
            }

            runFixedCode(index) {
                const contract = this.contracts[index];
                if (!contract || !contract.fixedCode) {
                    this.showError('No fixed code available to run');
                    return;
                }
                
                this.updateStatus('Running fixed code in terminal...', 'info');
                this.sendMessage({
                    type: 'runCode',
                    code: contract.fixedCode,
                    codeType: 'fixed'
                });
            }

            applyContract(index) {
                const contract = this.contracts[index];
                if (!contract || !contract.fixedCode) {
                    this.showError('No contract code available to apply');
                    return;
                }
                
                this.updateStatus('Applying contract to file...', 'info');
                this.sendMessage({
                    type: 'applyContract',
                    contract: contract.fixedCode
                });
            }

            copyContract(index) {
                const contract = this.contracts[index];
                navigator.clipboard.writeText(contract.fixedCode).then(() => {
                    this.showSuccess('Fixed code copied to clipboard!');
                }).catch(err => {
                    this.showError('Failed to copy code: ' + err.message);
                });
            }


            openPasteCodeModal() {
                const modal = document.getElementById('pasteCodeModal');
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
                
                // Focus on textarea after modal opens
                setTimeout(() => {
                    document.getElementById('codeTextarea').focus();
                }, 100);
            }

            closePasteCodeModal() {
                const modal = document.getElementById('pasteCodeModal');
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
                
                // Clear the textarea
                document.getElementById('codeTextarea').value = '';
            }

            analyzePastedCode() {
                const codeTextarea = document.getElementById('codeTextarea');
                const code = codeTextarea.value.trim();
                
                if (!code) {
                    this.showError('Please paste some Python code to analyze');
                    codeTextarea.focus();
                    return;
                }
                
                // Close the modal
                this.closePasteCodeModal();
                
                this.updateStatus('🔍 Analyzing pasted code for contract violations...', 'info');
                
                this.sendMessage({
                    type: 'analyzePastedCode',
                    code: code
                });
            }

            showError(message) {
                this.updateStatus('❌ ' + message, 'error');
            }

            showSuccess(message) {
                this.updateStatus('✅ ' + message, 'success');
            }

            showViolationDetailsModal(violation) {
                console.log('Showing violation details:', violation);
                
                // Open the modal
                const modal = document.getElementById('violationDetailsModal');
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
                
                // Populate the modal content
                this.populateViolationDetails(violation);
            }

            closeViolationDetailsModal() {
                const modal = document.getElementById('violationDetailsModal');
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }

            populateViolationDetails(violation) {
                const content = document.getElementById('violationDetailsContent');
                
                console.log('Populating violation details:', violation);
                
                if (!violation || !violation.labels) {
                    console.error('Invalid violation data:', violation);
                    content.innerHTML = '<p>No violation details available</p>';
                    return;
                }

                // Get label explanations
                const labelExplanations = this.getLabelExplanations();
                
                const details = '<div class="violation-details">' +
                    '<div class="violation-section">' +
                        '<h4>Classification Labels</h4>' +
                        '<div class="label-grid">' +
                            '<div class="label-item">' +
                                '<strong>Contract Violation (Level 1):</strong>' +
                                '<span class="label-value">' + (violation.labels.level1 || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.level1, 'level1', labelExplanations) +
                            '</div>' +
                            '<div class="label-item">' +
                                '<strong>Contract Violation (Level 2):</strong>' +
                                '<span class="label-value">' + (violation.labels.level2 || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.level2, 'level2', labelExplanations) +
                            '</div>' +
                            '<div class="label-item">' +
                                '<strong>Contract Violation (Level 3):</strong>' +
                                '<span class="label-value">' + (violation.labels.level3 || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.level3, 'level3', labelExplanations) +
                            '</div>' +
                            '<div class="label-item">' +
                                '<strong>Leaf Contract Category:</strong>' +
                                '<span class="label-value">' + (violation.labels.leafContractCategory || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.leafContractCategory, 'leafContractCategory', labelExplanations) +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    '<div class="violation-section">' +
                        '<h4>Analysis Details</h4>' +
                        '<div class="analysis-grid">' +
                            '<div class="analysis-item">' +
                                '<strong>Root Cause:</strong>' +
                                '<span>' + (violation.labels.rootCause || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.rootCause, 'rootCause', labelExplanations) +
                            '</div>' +
                            '<div class="analysis-item">' +
                                '<strong>Effect:</strong>' +
                                '<span>' + (violation.labels.effect || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.effect, 'effect', labelExplanations) +
                            '</div>' +
                            '<div class="analysis-item">' +
                                '<strong>Location:</strong>' +
                                '<span>' + (violation.labels.contractViolationLocation || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.contractViolationLocation, 'location', labelExplanations) +
                            '</div>' +
                            '<div class="analysis-item">' +
                                '<strong>Detection:</strong>' +
                                '<span>' + (violation.labels.detectionTechnique || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.detectionTechnique, 'detection', labelExplanations) +
                            '</div>' +
                            '<div class="analysis-item">' +
                                '<strong>ML Library:</strong>' +
                                '<span>' + (violation.labels.mlLibrary || 'Not specified') + '</span>' +
                                this.getLabelExplanation(violation.labels.mlLibrary, 'mlLibrary', labelExplanations) +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    '<div class="violation-section">' +
                        '<h4>LLM Reasoning</h4>' +
                        '<div class="reasoning-content">' +
                            '<p>' + (violation.labels.reasonsForLabeling || 'No reasoning provided') + '</p>' +
                        '</div>' +
                    '</div>' +
                    
                    '<div class="violation-section">' +
                        '<h4>Source</h4>' +
                        '<p>Based on empirical study of 413 ML API specifications from Stack Overflow (Khairunnesa et al., 2023)</p>' +
                    '</div>' +
                '</div>';
                
                content.innerHTML = details;
            }

            getLabelExplanations() {
                return {
                    level1: {
                        'SAM': 'Single API Method - Violations that occur within a single API method, typically related to argument constraints or method-specific requirements',
                        'AMO': 'API Method Order - Violations related to the correct sequence of API method calls',
                        'HYBRID': 'Hybrid - Violations that involve a combination of different contract types'
                    },
                    level2: {
                        'DT': 'Data Type - Violations concerning the expected data types of arguments or return values',
                        'BET': 'Boolean Expression Type - Violations involving boolean expressions, often related to conditions or flags',
                        'G': 'Always - Conditions that must always hold true, regardless of the state or context',
                        'F': 'Eventually - Conditions that must hold true at some point in the future',
                        'SAI': 'SAM-AMO Interdependency - Violations where the correctness of a single API method depends on the order of method calls',
                        'SELECTION': 'Selection - Choice-based constraints involving multiple valid options'
                    },
                    level3: {
                        'PT': 'Primitive Type - Violations related to basic data types like integers, floats, etc.',
                        'BIT': 'Built-in Type - Violations concerning standard data structures or types, such as arrays or lists',
                        'RT': 'Reference Type - Violations involving object references or custom data structures',
                        'MT': 'ML Type - Violations specific to machine learning contexts, such as mismatched tensor shapes or incompatible model configurations',
                        'IC-1': 'Intra-argument Contract - Violations within a single argument, such as invalid values or out-of-range numbers',
                        'IC-2': 'Inter-argument Contract - Violations between multiple arguments, where the combination of argument values is invalid',
                        'SAM ∧ AMO': 'Combination of SAM and AMO - Violations that involve both single API method constraints and API method order constraints',
                        'SAM': 'Single API Method component in hybrid violation',
                        'AMO': 'API Method Order component in hybrid violation',
                        'PT, IC-2': 'Combination of Primitive Type and Inter-argument Contract violations'
                    },
                    leafContractCategory: {
                        'PT': 'Primitive Type - Violations related to basic data types like integers, floats, etc.',
                        'BIT': 'Built-in Type - Violations concerning standard data structures or types, such as arrays or lists',
                        'RT': 'Reference Type - Violations involving object references or custom data structures',
                        'MT': 'ML Type - Violations specific to machine learning contexts, such as mismatched tensor shapes or incompatible model configurations',
                        'IC-1': 'Intra-argument Contract - Violations within a single argument, such as invalid values or out-of-range numbers',
                        'IC-2': 'Inter-argument Contract - Violations between multiple arguments, where the combination of argument values is invalid',
                        'SAM ∧ AMO': 'Combination of SAM and AMO - Violations that involve both single API method constraints and API method order constraints',
                        'SAM': 'Single API Method component in hybrid violation',
                        'AMO': 'API Method Order component in hybrid violation',
                        'PT, IC-2': 'Combination of Primitive Type and Inter-argument Contract violations'
                    },
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
                    effect: {
                        'Crash': 'Program terminates with runtime error',
                        'IF': 'Incorrect Functionality - Program runs but produces wrong results',
                        'BP': 'Bad Performance - Program runs but with degraded performance',
                        'MOB': 'Model Output Bias - Model produces biased or incorrect predictions',
                        'Unknown': 'Effect cannot be determined from available information'
                    },
                    location: {
                        'Model Construction': 'Violation occurs during model architecture definition',
                        'Train': 'Violation occurs during model training phase',
                        'Model Evaluation': 'Violation occurs during model evaluation/testing',
                        'Data Preprocessing': 'Violation occurs during data preparation',
                        'Prediction': 'Violation occurs during model inference/prediction',
                        'Load': 'Violation occurs during model loading',
                        'Model Initialization': 'Violation occurs during model setup'
                    },
                    detection: {
                        'Static': 'Can be detected through static code analysis',
                        'Runtime Checking': 'Requires runtime execution to detect',
                        'Dynamic': 'Detected during program execution',
                        'Contract': 'Detected through contract violation checking'
                    },
                    mlLibrary: {
                        'TensorFlow': 'TensorFlow-specific violations and constraints',
                        'Scikit-learn': 'Scikit-learn-specific violations and constraints',
                        'Keras': 'Keras-specific violations and constraints',
                        'PyTorch': 'PyTorch-specific violations and constraints'
                    }
                };
            }

            getLabelExplanation(label, category, explanations) {
                if (!label || !explanations[category] || !explanations[category][label]) {
                    return '';
                }
                
                const explanation = explanations[category][label];
                return '<div class="label-explanation">' + explanation + '</div>';
            }


            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }


        }

        // Initialize dashboard when DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            window.dashboard = new MLContractDashboard();
        });
    </script>
</body>
</html>`;
    }

    getViolations() {
        return this.violations || [];
    }

    getContracts() {
        return this.contracts || [];
    }

    setViolations(violations) {
        this.violations = violations || [];
    }

    setContracts(contracts) {
        this.contracts = contracts || [];
    }

    async generateContractsFromViolations() {
        if (!this.violations || this.violations.length === 0) {
            throw new Error('No violations found. Please run "Detect Contract Violations" first.');
        }

        try {
            const contracts = await this.ragService.generateContracts(this.violations);
            
            this.contracts = contracts;
            
            return contracts;
        } catch (error) {
            console.error('Error generating contracts:', error);
            throw error;
        }
    }

    async handleApplyContract(contract) {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this.showError('No active editor found');
                return;
            }

            // Insert the contract at the top of the file
            const position = new vscode.Position(0, 0);
            await editor.edit(editBuilder => {
                editBuilder.insert(position, contract + '\n\n');
            });

            this.showSuccess('Contract applied successfully!');
        } catch (error) {
            this.showError('Error applying contract: ' + error.message);
        }
    }

    showViolationDetails(violation) {
        const details = `
Violation Details:
- Level 1: ${violation.labels.level1}
- Level 2: ${violation.labels.level2}
- Level 3: ${violation.labels.level3}
- Root Cause: ${violation.labels.rootCause}
- Effect: ${violation.labels.effect}
- Location: ${violation.labels.contractViolationLocation}
- Detection: ${violation.labels.detectionTechnique}
- Reason: ${violation.labels.reasonsForLabeling}
        `;

        vscode.window.showInformationMessage(details);
    }

    updateViolations(violations) {
        console.log('DashboardProvider: updateViolations called with:', violations);
        console.log('DashboardProvider: violations type:', typeof violations);
        console.log('DashboardProvider: violations length:', violations ? violations.length : 'undefined');
        this.violations = violations;
        this.updateUI();
    }

    updateContracts(contracts) {
        this.contracts = contracts;
        this.updateUI();
    }
}

module.exports = DashboardProvider;
