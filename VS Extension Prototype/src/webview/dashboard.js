// Dashboard JavaScript for ML Contract Extension

class MLContractDashboard {
    constructor() {
        this.violations = [];
        this.contracts = [];
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Detect violations button
        document.getElementById('detectBtn').addEventListener('click', () => {
            this.detectViolations();
        });

        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateContracts();
        });

        // Listen for messages from the extension
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
            }
        });
    }

    detectViolations() {
        console.log('Detect violations button clicked');
        this.updateStatus('🔍 Detecting contract violations...', 'info');
        this.sendMessage({ type: 'detectViolations' });
    }

    generateContracts() {
        console.log('Generate contracts button clicked');
        this.updateStatus('⚡ Generating PyContracts...', 'info');
        this.sendMessage({ type: 'generateContracts' });
    }

    sendMessage(message) {
        // Send message to the extension
        console.log('Attempting to send message:', message);
        if (window.vscode && window.vscode.postMessage) {
            window.vscode.postMessage(message);
            console.log('Message sent successfully');
        } else {
            console.error('VS Code API not available. Available objects:', Object.keys(window));
            if (window.parent && window.parent.postMessage) {
                window.parent.postMessage(message, '*');
                console.log('Message sent via parent window');
            }
        }
    }

    updateUI(violations, contracts) {
        this.violations = Array.isArray(violations) ? violations : (violations ? [violations] : []);
        this.contracts = Array.isArray(contracts) ? contracts : (contracts ? [contracts] : []);

        this.updateViolationsSection();
        this.updateContractsSection();
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

    createViolationElement(violation, index) {
        const div = document.createElement('div');
        div.className = 'violation-item';
        
        const labels = violation.labels || {};
        const codeAnalysis = violation.codeAnalysis || {};
        const mlAPIs = codeAnalysis.mlAPIs || [];
        
        div.innerHTML = `
            <div class="violation-header">
                <h4>Violation ${index + 1}</h4>
                <span class="violation-type">${labels.level1 || 'Unknown'} - ${labels.level2 || 'Unknown'}</span>
            </div>
            <div class="violation-details">
                <div class="detail-row">
                    <strong>Root Cause:</strong> ${labels.rootCause || 'Not specified'}
                </div>
                <div class="detail-row">
                    <strong>Effect:</strong> ${labels.effect || 'Not specified'}
                </div>
                <div class="detail-row">
                    <strong>Location:</strong> ${labels.contractViolationLocation || 'Not specified'}
                </div>
                <div class="detail-row">
                    <strong>ML APIs:</strong> ${mlAPIs.length > 0 ? mlAPIs.join(', ') : 'None detected'}
                </div>
            </div>
            <div class="violation-actions">
                <button class="btn btn-small" onclick="dashboard.showViolationDetails(${index})">
                    View Details
                </button>
            </div>
        `;
        return div;
    }

    createContractElement(contract, index) {
        const div = document.createElement('div');
        div.className = 'contract-item';
        div.innerHTML = `
            <div class="contract-header">
                <h4>Contract ${index + 1}</h4>
                <span class="contract-type">${contract.violation.labels.level1} - ${contract.violation.labels.level2}</span>
            </div>
            <div class="contract-content">
                <div class="contract-spec">
                    <h5>PyContract Specification:</h5>
                    <pre><code>${this.escapeHtml(contract.contractSpec)}</code></pre>
                </div>
                <div class="contract-explanation">
                    <h5>Explanation:</h5>
                    <p>${this.escapeHtml(contract.explanation)}</p>
                </div>
                <div class="contract-insight">
                    <h5>Actionable Insight:</h5>
                    <p>${this.escapeHtml(contract.actionableInsight)}</p>
                </div>
            </div>
            <div class="contract-actions">
                <button class="btn btn-small btn-primary" onclick="dashboard.applyContract(${index})">
                    Apply Contract
                </button>
                <button class="btn btn-small" onclick="dashboard.copyContract(${index})">
                    Copy Contract
                </button>
            </div>
        `;
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
            status.textContent = `Found ${this.violations.length} potential contract violations. Click "Generate PyContracts" to create specifications.`;
            status.className = 'status-warning';
        } else if (this.contracts.length > 0) {
            status.textContent = `Generated ${this.contracts.length} PyContracts. Review and apply them to your code.`;
            status.className = 'status-success';
        }
    }

    showViolationDetails(index) {
        const violation = this.violations[index];
        this.sendMessage({
            type: 'showViolationDetails',
            violation: violation
        });
    }

    applyContract(index) {
        const contract = this.contracts[index];
        this.sendMessage({
            type: 'applyContract',
            contract: contract.contractSpec
        });
    }

    copyContract(index) {
        const contract = this.contracts[index];
        navigator.clipboard.writeText(contract.contractSpec).then(() => {
            this.showSuccess('Contract copied to clipboard!');
        }).catch(err => {
            this.showError('Failed to copy contract: ' + err.message);
        });
    }

    showError(message) {
        this.updateStatus('❌ ' + message, 'error');
    }

    showSuccess(message) {
        this.updateStatus('✅ ' + message, 'success');
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
