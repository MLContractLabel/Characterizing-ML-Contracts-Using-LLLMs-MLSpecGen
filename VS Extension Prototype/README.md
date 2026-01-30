# ML Contract Violation Detector - MLSpecGen

![ML Contract Violation Detector](../figures/Fig6.png)

A VS Code extension that detects ML API contract violations and generates executable PyContracts using RAG (Retrieval-Augmented Generation) and GPT-4o.

## Overview

ML Contract Violation Detector - MLSpecGen is a VS Code extension that automatically detects and fixes Machine Learning API contract violations in Python code. It uses Retrieval-Augmented Generation (RAG) with a curated dataset to identify common ML API misuse patterns, then generates executable PyContract specifications that validate function parameters and return values.

## What It Does

- **Detects Contract Violations**: Analyzes Python code for ML library usage (TensorFlow, Keras, PyTorch, Scikit-learn) and identifies potential API misuse patterns using a hierarchical taxonomy (SAM/AMO/Hybrid classifications)
- **Generates PyContracts**: Creates executable `@contract` decorators for both buggy and fixed code versions, ensuring minimal code changes while adding contract validation
- **Automated Testing**: Creates and runs an automated testing environment to verify that buggy code fails with contract violations and fixed code passes validation
- **Persistent Environment**: Manages a persistent Python virtual environment with compatible library versions (TensorFlow 2.10.0, Keras 2.10.0, NumPy 1.21.6, PyContracts 1.8.12)

### Built With

- **VS Code Extension API**: Native VS Code extension framework
- **Node.js/JavaScript**: Core extension logic and webview management
- **RAG (Retrieval-Augmented Generation)**: Semantic search using embeddings to retrieve relevant examples from a curated dataset
- **OpenAI GPT-4o**: Large Language Model for contract violation classification and PyContract generation
- **PyContracts**: Python library for runtime contract checking with `@contract` decorators
- **Python Virtual Environment**: Isolated environment for executing generated code with compatible ML library versions
- **Embeddings**: Vector-based similarity search for RAG context retrieval

## Features

- **Live Code Analysis**: Analyzes Python files for ML API patterns in real-time
- **Contract Violation Detection**: Identifies potential ML API misuse patterns
- **Multi-level Classification**: Uses hierarchical taxonomy to classify violations
- **PyContract Generation**: Generates executable contract specifications
- **Interactive Dashboard**: UI to view violations and apply contracts
- **One-click Application**: Apply generated contracts directly to your code

## How It Works

1. **Code Analysis**: Scans your Python code for ML library usage (TensorFlow, Keras, PyTorch, Scikit-learn)
2. **RAG Retrieval**: Uses embeddings to find similar patterns from a curated dataset
3. **AI Classification**: GPT-4o classifies violations using a multi-level taxonomy
4. **Contract Generation**: Creates executable PyContract specifications
5. **Interactive Dashboard**: Shows results and allows contract application

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp env.example .env
   # Edit .env with your OpenAI API key
   ```
4. Build the extension:
   ```bash
   npm run esbuild
   ```
5. Install in VS Code:
   - Press `F5` to run in Extension Development Host
   - Or package and install: `vsce package`

## Configuration

### Environment Variables

Create a `.env` file with:

```env
OPENAI_API_KEY=your-openai-api-key-here
OUTPUT_DIR=ml-contract-outputs
```

### Ollama Setup (Optional)

For local embeddings, install and run Ollama:

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull the embedding model
ollama pull nomic-embed-text

# Start Ollama server
ollama serve
```

## Usage

1. **Open a Python file** with ML code (TensorFlow, Keras, PyTorch, etc.)
2. **Open the Dashboard**: 
   - Use Command Palette: `ML Contract: Open Dashboard`
   - Or right-click in editor → `ML Contract: Open Dashboard`
3. **Detect Violations**: Click "Detect Contract Violations"
4. **Generate Contracts**: Click "Generate PyContracts"
5. **Apply Contracts**: Review and apply generated contracts to your code

**Note**: Generated contracts may require manual iteration for compatibility with your specific codebase, library versions, and use cases. Review and test contracts before deploying to production.

## Dashboard Features

### Action Buttons
- **Detect Contract Violations**: Analyzes current file for ML API patterns
- **Generate PyContracts**: Creates executable contract specifications

### Violation Display
- **Multi-level Classification**: Shows Level 1/2/3 taxonomy labels
- **Root Cause Analysis**: Identifies why the violation occurs
- **Effect Prediction**: Shows potential impact (Crash, Incorrect Functionality, etc.)
- **Location Detection**: Pinpoints where in the ML pipeline the issue occurs

### Contract Generation
- **Executable PyContracts**: Ready-to-use `@contract` decorators
- **Natural Language Explanations**: Clear descriptions of what contracts check
- **Actionable Insights**: Specific steps to fix violations
- **One-click Application**: Apply contracts directly to your code
- **Note**: Generated contracts may require manual iteration for compatibility with your specific codebase and library versions

## Taxonomy Examples

The extension uses a hierarchical taxonomy to classify ML contract violations, based on the research paper:

> S. S. Khairunnesa, S. Ahmed, S. M. Imtiaz, H. Rajan, and G. T. Leavens, "What kinds of contracts do ml apis need?" Empirical Softw. Engg., vol. 28, no. 6, Oct. 2023. [Online]. Available: https://doi.org/10.1007/s10664-023-10320-z

### Level 1: Central Contract Category
- **SAM**: Single API Method violations
- **AMO**: API Method Order violations  
- **Hybrid**: Combination of SAM and AMO

### Level 2: Contract Subcategories
- **DT**: Data Type violations
- **BET**: Boolean Expression Type violations
- **G**: Always temporal contracts
- **F**: Eventually temporal contracts
- **SAI/SL**: Selection-based contracts

### Level 3: Hybrid Patterns
- **PT**: Primitive Type violations
- **BIT**: Built-in Type violations
- **RT**: Reference Type violations
- **MT**: ML Type violations
- **IC-1**: Intra-argument Contract violations
- **IC-2**: Inter-argument Contract violations

## Supported ML Libraries

- **TensorFlow**: Model construction, training, evaluation
- **Keras**: Layer configuration, model compilation
- **PyTorch**: Module definition, training loops
- **Scikit-learn**: Model fitting, prediction, preprocessing

## Example Usage

### Before: Code with Violation

```python
import tensorflow as tf

# Potential violation: missing fit() before predict()
model = tf.keras.Sequential([
    tf.keras.layers.Dense(10, activation='relu'),
    tf.keras.layers.Dense(1)
])

# This will fail - model not trained
predictions = model.predict(X_test)
```

### After: Code with Generated Contract

```python
from contracts import contract

@contract(model='trained_model', X='array[*,*]')
def safe_predict(model, X):
    """Predict with contract validation"""
    return model.predict(X)

# Custom contract for trained model
@new_contract
def trained_model(model):
    return hasattr(model, 'history') and model.history is not None
```

## Development

### Project Structure

```
ml-contract-extension/
├── src/
│   ├── extension.js              # Main extension entry
│   ├── rag/
│   │   └── ragService.js         # RAG pipeline and GPT integration
│   ├── utils/
│   │   └── codeAnalyzer.js       # Python code analysis
│   └── webview/
│       ├── dashboardProvider.js  # Dashboard provider
│       ├── dashboard.js          # Dashboard JavaScript
│       └── dashboard.css         # Dashboard styles
├── kerasembedded_examples.json   # Embedded examples dataset
└── package.json
```

### Building

```bash
# Development build
npm run esbuild

# Watch mode
npm run esbuild-watch

# Production build
npm run vscode:prepublish
```

### Testing

```bash
# Run tests
npm test

# Lint code
npm run lint
```

## Future Work

1. **Automated Feedback Loop**: Implement a fully automated feedback loop that iteratively tests generated contracts, collects execution results, and uses LLM feedback to automatically refine and improve contract specifications until they pass validation.

2. **Multi-GenAI Model Support**: Add support for multiple generative AI models including Claude (Anthropic), Gemini (Google), and local LLMs via Ollama, allowing users to choose the best model for their use case and enabling offline functionality.

3. **Enhanced Compatibility & Iteration**: Improve automatic compatibility handling and provide better tooling for manual iteration of generated contracts to ensure they work seamlessly with different library versions and codebases.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **Taxonomy**: Based on "What kinds of contracts do ml apis need?" by Khairunnesa et al. (Empirical Software Engineering, 2023) - https://doi.org/10.1007/s10664-023-10320-z
- Uses PyContracts library for contract specifications
- Integrates OpenAI GPT-4o for AI-powered analysis
- Built with VS Code Extension API

## Support

- **Issues**: Report bugs and feature requests on GitHub
- **Documentation**: Check the wiki for detailed guides
- **Community**: Join discussions in GitHub Discussions
