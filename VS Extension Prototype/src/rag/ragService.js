const axios = require('axios');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const embeddedData = require('./embeddedData');
// dotenv is loaded in extension.js with correct path

class RAGService {
    constructor(extensionUri) {
        console.log('RAG Service initializing...');
        console.log('API Key available:', !!process.env.OPENAI_API_KEY);
        console.log('API Key starts with:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 10) + '...' : 'NOT SET');
        
        this.openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY
        });
        this.EMBED_MODEL = "nomic-embed-text";
        this.CHAT_MODEL = "gpt-4o";
        this.TOP_K = 5;
        
        this.loadContextSync();
    }

    async loadContext() {
        try {
            console.log('Loading embedded context data...');
            
            this.context = {
                researchPaper: embeddedData.researchContext,
                actionableExamples: embeddedData.actionableExamples,
                pycontractDoc: embeddedData.pycontractsDoc + "\n\n" + embeddedData.pycontractsDeep,
                embeddedExamples: embeddedData.embeddedExamples
            };

            console.log('RAG Service context loaded successfully');
            console.log('Embedded examples count:', this.context.embeddedExamples.length);
            console.log('Research context length:', this.context.researchPaper.length);
            console.log('Actionable examples length:', this.context.actionableExamples.length);
        } catch (error) {
            console.error('Error loading RAG context:', error);
            console.error('Error details:', error.message);
            
            this.context = {
                researchPaper: '',
                actionableExamples: '',
                pycontractDoc: '',
                embeddedExamples: []
            };
        }
    }

    loadContextSync() {
        try {
            console.log('Loading embedded context data...');
            
            this.context = {
                researchPaper: embeddedData.researchContext,
                actionableExamples: embeddedData.actionableExamples,
                pycontractDoc: embeddedData.pycontractsDoc + "\n\n" + embeddedData.pycontractsDeep,
                embeddedExamples: embeddedData.embeddedExamples
            };

            console.log('RAG Service context loaded successfully');
            console.log('Embedded examples count:', this.context.embeddedExamples.length);
            console.log('Research context length:', this.context.researchPaper.length);
            console.log('Actionable examples length:', this.context.actionableExamples.length);
        } catch (error) {
            console.error('Error loading RAG context:', error);
            console.error('Error details:', error.message);
            
            this.context = {
                researchPaper: '',
                actionableExamples: '',
                pycontractDoc: '',
                embeddedExamples: []
            };
        }
    }

    cosineSimilarity(a, b) {
        const dot = a.reduce((s, v, i) => s + v * b[i], 0);
        const norm = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0));
        return dot / (norm(a) * norm(b));
    }

    async getEmbedding(text) {
        try {
            console.log('Creating embedding with Ollama for text:', text.substring(0, 100) + '...');
            const resp = await axios.post("http://127.0.0.1:11434/api/embeddings", {
                model: this.EMBED_MODEL,
                input: text
            }, { timeout: 10000 });
            
            const body = resp.data;
            if (Array.isArray(body?.data) && body.data[0]?.embedding) {
                console.log('Ollama embedding created successfully, dimension:', body.data[0].embedding.length);
                return body.data[0].embedding;
            }
            if (Array.isArray(body?.embedding)) {
                console.log('Ollama embedding created successfully, dimension:', body.embedding.length);
                return body.embedding;
            }
            throw new Error("Unexpected embeddings response shape from Ollama.");
        } catch (error) {
            console.warn('Ollama embedding failed, trying OpenAI:', error.message);
            
            try {
                const e = await this.openai.embeddings.create({ 
                    model: "text-embedding-3-small", 
                    input: text 
                });
                console.log('OpenAI fallback embedding created, dimension:', e.data[0].embedding.length);
                return e.data[0].embedding;
            } catch (openaiError) {
                throw new Error(`Both Ollama and OpenAI embeddings failed: ${openaiError.message}`);
            }
        }
    }

    extractLabel(response, field, singleWord = false) {
        const regex = new RegExp(field + ":[ \\t]*(.+)", "i");
        const match = response.match(regex);
        if (!match) return "";
        const full = match[1].trim();
        
        
        return singleWord ? full.split(/,|;|\/| and /)[0].trim() : full;
    }

    extractBothCodes(content) {
        const tag = (name) => {
            const r = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i").exec(content);
            return r ? r[1].trim() : "";
        };
        const buggyTag = tag("BUGGY_CODE");
        const fixedTag = tag("FIXED_CODE");
        const nlp = tag("NLP_CONTRACT") || (content.match(/NLP Contract:\s*-\s*([\s\S]*?)\n(?:Actionable Insight:|$)/i)?.[1] || "Not found").trim();
        const insight = tag("ACTIONABLE_INSIGHT") || (content.match(/Actionable Insight:\s*-\s*([\s\S]*)/i)?.[1] || "Not found").trim();

        const fenced = (blk) => {
            if (!blk) return "";
            const mLang = /```python([\s\S]*?)```/i.exec(blk);
            if (mLang) return mLang[1].trim();
            const mAny = /```([\s\S]*?)```/i.exec(blk);
            return mAny ? mAny[1].trim() : blk.trim();
        };

        let buggy = fenced(buggyTag);
        let fixed = fenced(fixedTag);

        if (!buggy || !fixed) {
            const blocks = [...content.matchAll(/```(?:python)?([\s\S]*?)```/gi)].map(m => m[1].trim());
            buggy ||= blocks[0] || "";
            fixed ||= blocks[1] || "";
        }

        return { buggy, fixed, nlpContract: nlp, insight };
    }


    buildLabelingPrompt(examples, codeAnalysis) {
        return `
You are an expert at labeling Stack Overflow posts according to a predefined taxonomy described in the research paper below.

--- RESEARCH PAPER ---
${this.context.researchPaper}

--- ACTIONABLE INSIGHT EXAMPLES ---
${this.context.actionableExamples}

--- LABELED POST EXAMPLES ---
${examples.map((ex, i) => `
Example ${i + 1}:
Post URL: ${ex.postURL}
Question: ${ex.question}
Answer: ${ex.answer}
Labels:
  - Level 1: ${ex.label.level1}
  - Level 2: ${ex.label.level2}
  - Level 3: ${ex.label.level3}
  - Leaf Contract Category: ${ex.label.leafContractCategory}
  - Root Cause: ${ex.label.rootCause}
  - Effect: ${ex.label.effect}
  - Contract Violation Location: ${ex.label.contractViolationLocation}
  - Detection Technique: ${ex.label.detectionTechnique}
  - Reasons for not labelling: ${ex.label.reasonsForNotLabeling}
  - Reasons for labeling: ${ex.label.reasonsForLabeling}
`).join("\n")}

--- NEW POST TO LABEL---
URL: ${codeAnalysis.filePath}
Title: ML Code Analysis
Question: ${codeAnalysis.snippets.map(s => s.code).join('\n\n')}
Answer: This code contains ML API usage that may have contract violations.

Please carefully consider the guidelines below when assigning labels:

Guidelines:
- Level 1 (Central Contract Category): 
    - SAM: Single API Method — Contracts involving a single API method, typically focusing on preconditions and postconditions.
    - AMO: API Method Order — Contracts that specify the required order of API method calls.
    - Hybrid: Combination of behavioral (SAM) and temporal (AMO) contracts.
- Level 2: 
    - DT: Data Type — Contracts related to the expected data types of API arguments.
    - BET: Boolean Expression Type — Contracts involving boolean expressions or conditions on API arguments.
    - G: Always — Temporal contracts that must always hold during execution.
    - F: Eventually — Temporal contracts that must hold at some point during execution.
    - SAI — Use this label for contracts involving interdependence between behavioral (SAM) and temporal (AMO) aspects.
    - SL: Selection — Contracts that involve selecting among multiple valid API usage patterns.
- Level 3 (Hybrid Patterns): 
    - PT: Primitive Type — Contracts expecting primitive data types (e.g., int, float).
    - BIT: Built-in Type — Contracts expecting built-in data structures (e.g., list, dict).
    - RT: Reference Type — Contracts expecting references to objects or classes.
    - MT: ML Type — Contracts expecting machine learning-specific types (e.g., tensors).
    - IC-1: Intra-argument Contract — Contracts involving conditions within a single API argument.
    - IC-2: Inter-argument Contract — Contracts involving conditions between multiple API arguments.
- Root Cause: Unacceptable Input Type, Unacceptable Input Value, Missing Options, Missing Input Value/Type Dependency, Missing Input value-Method order Dependency, Missing Required Method Order, Missing Required State-specific Method Order
- Effect: Crash, IF, BP, MOB, Unknown
- ML Library: TensorFlow, Keras, PyTorch, Scikit-learn
- Contract Violation Location: Model Construction, Train, Model Evaluation, Data Preprocessing, Prediction, Load, Model Initialization
- Detection Technique: Static, Runtime Checking
- Reasons for not labelling: NA, NI, IM
- Reasons for labeling: Provide exactly 2-3 sentences explaining why these labels were chosen

For each label field, please follow these rules:
- Level 1: Choose only one best-fitting label.
- Level 2: Choose only one best-fitting label.
- Level 3: You may return multiple labels if appropriate. Separate them with commas.
- Leaf Contract Category: Should match Level 3 — one or more values.

If you're uncertain, pick the single closest match based on the guidelines for Level 1 and Level 2.

Respond in this format:

Level 1: [your choice]  
Level 2: [your choice]  
Level 3: [your choice]  
Leaf Contract Category: [your choice]  
Root Cause: [your choice]  
Effect: [your choice]  
Contract Violation Location: [your choice]  
Detection Technique: [your choice]  
Reasons for not labelling: [your choice]  
Reasons for labeling: [exactly 2-3 sentences explaining your choices].
`;
    }

    buildPyPrompt(codeAnalysis, label) {
        console.log('buildPyPrompt - codeAnalysis:', codeAnalysis);
        console.log('buildPyPrompt - codeAnalysis.snippets:', codeAnalysis.snippets);
        
        return `
You are an expert Python engineer and ML contract verifier.

--- RESEARCH CONTEXT ---
${this.context.researchPaper}

--- PYCONTRACT DOCUMENTATION ---
${this.context.pycontractDoc}

--- ACTIONABLE INSIGHT EXAMPLES ---
${this.context.actionableExamples}

--- STACK OVERFLOW POST ---
URL: ${codeAnalysis.filePath}
Title: ML Code Analysis
Question:
${(codeAnalysis.snippets || []).map(s => s.code).join('\n\n')}

Answer:
This code contains ML API usage that may have contract violations.

--- CLASSIFICATION LABELS FOR THIS POST ---
Level 1: ${label.level1}
Level 2: ${label.level2}
Level 3: ${label.level3}
Root Cause: ${label.rootCause}
Effect: ${label.effect}
Contract Violation Location: ${label.contractViolationLocation}
Detection Technique: ${label.detectionTechnique}
Reasons for Labeling: ${label.reasonsForLabeling}

--- TARGET ENVIRONMENT (MUST GENERATE CODE FOR THESE EXACT VERSIONS) ---
- Python: 3.10–3.11
- Contracts library: PyPI package "PyContracts" (import as: from contracts import ...), version 1.8.12
  * CRITICAL: Generate PyContracts code compatible with PyContracts 1.8.12 syntax
  * Use simple format: 'array(float32)', 'array(int32)', 'list(str)' - NOT complex syntax
  * Avoid 'inst(...)' and lowercase 'callable' - these break in PyContracts 1.8.12
- NumPy: 1.21.6 (use np.int32, np.float32, np.bool_ - NOT np.int, np.float, np.bool)
  * CRITICAL: np.int(), np.float(), np.bool() are DEPRECATED in NumPy 1.21.6
- TensorFlow: 2.10.0 (use tf.compat.v1.* for TF 1.x APIs, tf.keras.* for Keras)
  * CRITICAL: Code must work with TensorFlow 2.10.0 specifically
- Keras: 2.10.0 (use tf.keras.* or import tensorflow.keras, NOT standalone keras package)
  * CRITICAL: Keras 2.10.0 is bundled with TensorFlow 2.10.0
- PyTorch: 1.13.1 (if used in post)
  * CRITICAL: Code must work with PyTorch 1.13.1 specifically
- Scikit-learn: 1.1.3 (if used in post)
  * CRITICAL: Code must work with Scikit-learn 1.1.3 specifically
- Other libs: only those mentioned in the post; prefer CPU builds; avoid unnecessary deps

IMPORTANT: All generated code MUST be compatible with these EXACT versions. The code will be executed in a virtual environment with these specific versions installed.

--- LIBRARY-SPECIFIC COMPATIBILITY RULES ---

For TensorFlow 2.10.0:
- Use tf.compat.v1.Session() instead of tf.Session()
- Use tf.compat.v1.placeholder() instead of tf.placeholder()
- Use tf.compat.v1.global_variables_initializer() instead of tf.initialize_all_variables()
- Use tf.compat.v1.train.* for queue-based input pipelines
- Use tf.keras.* for Keras APIs (preferred) or tf.compat.v1.keras.*
- Add tf.compat.v1.disable_eager_execution() at top if using graph mode (Session, placeholder)
- Use tf.random.normal() instead of tf.random_normal()
- Use tf.random.uniform() instead of tf.random_uniform()

For Keras 2.10.0:
- Use tf.keras.* (preferred) or import tensorflow.keras as keras
- Do NOT use standalone keras package (from keras import *)
- Use tf.keras.Model, tf.keras.layers.*, tf.keras.optimizers.*
- Use tf.keras.utils.to_categorical() for one-hot encoding

For NumPy 1.21.6:
- Use np.int32() instead of np.int() (deprecated)
- Use np.float32() instead of np.float() (deprecated)
- Use np.bool_() instead of np.bool() (deprecated)
- Use np.array(data, dtype=np.float32) for float arrays
- Use np.array(data, dtype=np.int32) for int arrays

For PyTorch 1.13.1 (if used):
- Use torch.Tensor, torch.nn.*, torch.optim.*
- Use torch.device('cpu') or torch.device('cuda')
- Use .to(device) for tensor device placement

--- TASK ---
0) Replicate the question's code verbatim when possible. Only replace APIs that are deprecated/removed or incompatible with the TARGET ENVIRONMENT. For each such change, add an inline comment:
   # [REPLACED] <old> -> <new> (reason)
   (Preserve variable names and structure; do not "improve" logic beyond reproducing the error.)
   
   NOTE: A code transformer will automatically handle common API compatibility issues during execution,
   but you should still generate compatible code when possible. Focus on contract logic and correctness.
1) From the "STACK OVERFLOW POST" section, identify:
   a) the failing API call (the method that raises), and
   b) the specific precondition that would prevent that failure (infer from the accepted answer and/or traceback).
2) Complete the post's code into a self-contained, deterministic Python module that reproduces the same failure scenario.
3) Create PyContract decorators to check the preconditions that would prevent the failure.
   - Use @contract decorators with proper type specifications.
   - Focus on the specific ML API contract violations identified.
   - IMPORTANT: For ML training data, use these exact contract specifications:
     * X_train: 'array(float32)' for numpy arrays with float32 dtype
     * y_train: 'array(int32)' for numpy arrays with int32 dtype
     * For single samples: X_train: 'array(float32)' for numpy arrays
   - Examples (CORRECT PyContracts syntax - SIMPLE FORMAT):
     * For training: @contract(X_train='array(float32)', y_train='array(int32)')
     * For single prediction: @contract(X='array(float32)', y='int32')
     * For model fitting: @contract(model='keras.Model', X_train='array(float32)', y_train='array(int32)')
     * For string data: @contract(text='str', words='list(str)')
     * For mixed data: @contract(data='list(str|float32)', labels='array(int32)')
     * For basic numpy arrays: @contract(image='array(uint8)')
   - WRONG syntax (DO NOT USE): 'array[N,M](float32)', 'array[N](int32)', 'array[*,*](float32)', 'list(string)', 'float', 'int'
   - CORRECT syntax (USE THESE): 'array(float32)', 'array(int32)', 'list(str)', 'float32', 'int32'
   - CRITICAL: The contract specifications must match the actual data being passed:
     * Analyze the actual data types and shapes in the code before writing contracts
     * For string data: use 'str', 'list(str)', or 'array(str)' (NOT 'array(string)')
     * For numeric data: use 'float32', 'int32', 'array(float32)', 'array(int32)' based on actual types
     * For arrays: use 'array(dtype)' syntax (SIMPLE FORMAT - no dimensions or constraints)
     * For ML APIs: use appropriate types like 'keras.Model', 'tensorflow.Tensor', etc.
     * ALWAYS match the contract to the actual data being passed, not what you think it should be
     * IMPORTANT: PyContracts syntax - use 'str' not 'string', 'float32' not 'float', 'int32' not 'int', 'array(dtype)' SIMPLE format
4) Produce TWO modules using the SAME PyContract validation:
   - BUGGY: reproduces the failure, showing the contract violation.
   - FIXED: satisfies the contract and exits successfully.
   - CRITICAL: The FIXED version must use proper numpy arrays with correct dtypes (float32 for features, int32 for labels).
5) In each module, include an if __name__ == "__main__": block:
   - BUGGY: demonstrate the buggy usage so the contract fails.
   - FIXED: demonstrate the corrected usage that passes the contract.
6) Constraints:
  - Deterministic: no network/downloads; use small synthetic data; set random seeds where relevant.
  - Stay within the libraries mentioned in the post; only minimal dependencies.
  - Keep function names/signatures stable (to enable automated repairs).
  - CRITICAL: Ensure the code runs under the TARGET ENVIRONMENT above with EXACT versions specified.
  - CRITICAL: Generated code will be executed in a venv with PyContracts 1.8.12, TensorFlow 2.10.0, Keras 2.10.0, NumPy 1.21.6, PyTorch 1.13.1, Scikit-learn 1.1.3.
  - USE PyContracts 1.8.12 compatible syntax with @contract decorators for proper contract validation.
   - For Keras/TensorFlow: X_train must be numpy array with float32 dtype, y_train must be numpy array with int32 dtype.
   - Use np.array(data, dtype=np.float32) for features and np.array(labels, dtype=np.int32) for labels.
   - CRITICAL: Ensure data shapes match the contract specifications:
     * X_train should be 2D: (n_samples, n_features) for training, 1D: (n_features,) for single prediction
     * y_train should be 1D: (n_samples,) for training, scalar for single prediction

8) Output exactly in this format (NO extra prose):

<BUGGY_CODE>
\`\`\`python
# full module that reproduces the failure as a contract violation
\`\`\`
</BUGGY_CODE>

<FIXED_CODE>
\`\`\`python
# full module that satisfies the same contract and exits successfully
\`\`\`
</FIXED_CODE>

<NLP_CONTRACT>
- Plain-English preconditions/postconditions and the exact failure the contract prevents.
</NLP_CONTRACT>

<ACTIONABLE_INSIGHT>
- 1–2 concrete actionable insights for the developers.
</ACTIONABLE_INSIGHT>

Notes:
- Prefer Python types in @contract (e.g., model=tf.keras.Model) and collections.abc.Callable for callables.
- CRITICAL: Avoid 'inst(...)' and lowercase 'callable' strings; these break in PyContracts 1.8.12.
- CRITICAL: All code must be compatible with the EXACT versions in TARGET ENVIRONMENT (PyContracts 1.8.12, TF 2.10.0, Keras 2.10.0, NumPy 1.21.6, etc.).
- When replacing deprecated APIs, add [REPLACED] comments with reason (e.g., # [REPLACED] tf.Session() -> tf.compat.v1.Session() (TF 2.x compatibility))
- For ML data types: Use 'array(float32)' or 'array(int32)' for numpy arrays, not 'list(float)' or 'list(int)'.
- For TensorFlow/Keras: Training data should be numpy arrays with correct dtypes (float32 for features, int32 for labels).
- For data validation: Use 'array(float32)' for X_train, 'array(int32)' for y_train arrays.
- For multi-dimensional arrays: Use 'array(float32)' without dimension constraints for flexibility.
- For shape validation: Use 'array(float32)' for general numpy arrays.
- CRITICAL: Always use compatible APIs for the TARGET ENVIRONMENT versions listed above.
- For TensorFlow: If code uses TF 1.x APIs (Session, placeholder), add tf.compat.v1.disable_eager_execution() at top.
- For NumPy: Always use np.int32, np.float32, np.bool_ (NOT np.int, np.float, np.bool).
- For Keras: Always use tf.keras.* or import tensorflow.keras (NOT standalone keras package).
- Avoid overly strict dimension constraints that might break with different input shapes.
- For data type violations: Ensure contracts validate that input data is numeric (float/int) and not string or mixed types.
- For string data violations: Use 'array[float]' to enforce numeric data, preventing string inputs that cause ML model failures.
- For mixed data type violations: Use 'array[float]' to ensure all array elements are numeric, preventing mixed string/numeric arrays.
`;
    }

    // Run GPT prompt
    async runChatPrompt(prompt) {
        const res = await this.openai.chat.completions.create({
            model: this.CHAT_MODEL,
            messages: [
                { role: "system", content: "You are an expert in ML contract violations and PyContracts." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3
        });
        return res.choices[0].message.content;
    }

    async detectViolations(codeAnalysis) {
        try {
            if (!this.context || !this.context.embeddedExamples) {
                console.error('Context not loaded properly');
                throw new Error('RAG context not loaded. Please check if all resource files are available.');
            }

            console.log('Starting violation detection...');
            console.log('Code analysis:', codeAnalysis);

            const codeText = codeAnalysis.snippets.map(s => s.code).join('\n\n');
            console.log('Code text for embedding:', codeText.substring(0, 200) + '...');
            
            const embedding = await this.getEmbedding(codeText);
            console.log('Embedding created, dimension:', embedding.length);

            console.log('Finding similar examples from', this.context.embeddedExamples.length, 'total examples');
            const topK = this.context.embeddedExamples
                .map(ex => ({ ...ex, score: this.cosineSimilarity(embedding, ex.embedding) }))
                .sort((a, b) => b.score - a.score)
                .slice(0, this.TOP_K);
            
            console.log('Top K examples found:', topK.length);

            const labelingPrompt = this.buildLabelingPrompt(topK, codeAnalysis);
            const labelingResponse = await this.runChatPrompt(labelingPrompt);

            console.log('Raw labeling response:', labelingResponse);
            console.log('Response length:', labelingResponse.length);

            const labelFields = {
                level1: this.extractLabel(labelingResponse, "Level 1", true),
                level2: this.extractLabel(labelingResponse, "Level 2", true),
                level3: this.extractLabel(labelingResponse, "Level 3"),
                leafContractCategory: this.extractLabel(labelingResponse, "Leaf Contract Category") || this.extractLabel(labelingResponse, "Level 3"),
                rootCause: this.extractLabel(labelingResponse, "Root Cause"),
                effect: this.extractLabel(labelingResponse, "Effect"),
                contractViolationLocation: this.extractLabel(labelingResponse, "Contract Violation Location"),
                detectionTechnique: this.extractLabel(labelingResponse, "Detection Technique"),
                reasonsForNotLabeling: this.extractLabel(labelingResponse, "Reasons for not labelling"),
                reasonsForLabeling: this.extractLabel(labelingResponse, "Reasons for labeling") || 
                                   this.extractLabel(labelingResponse, "Reasons for labeling:") ||
                                   this.extractLabel(labelingResponse, "Reasoning:") ||
                                   this.extractLabel(labelingResponse, "Explanation:") ||
                                   this.extractLabel(labelingResponse, "Reason:") ||
                                   this.extractLabel(labelingResponse, "Why:") ||
                                   this.extractLabel(labelingResponse, "Justification:")
            };

            console.log('Extracted labels:', labelFields);
            console.log('Testing individual extractions:');
            console.log('Level 1 match:', labelingResponse.match(/Level 1:[ \\t]*(.+)/i));
            console.log('Level 2 match:', labelingResponse.match(/Level 2:[ \\t]*(.+)/i));
            console.log('Reasons for labeling match:', labelingResponse.match(/Reasons for labeling:[ \\t]*(.+)/i));
            console.log('Reasons for labeling extracted:', labelFields.reasonsForLabeling);
            console.log('Full response for debugging:', labelingResponse.substring(0, 500) + '...');
            console.log('Looking for reasoning patterns in response...');
            console.log('Contains "Reasons for labeling":', labelingResponse.includes('Reasons for labeling'));
            console.log('Contains "Reasoning:":', labelingResponse.includes('Reasoning:'));
            console.log('Contains "Explanation:":', labelingResponse.includes('Explanation:'));

            // Return as an array with one violation object
            return [{
                codeAnalysis,
                labels: labelFields,
                similarExamples: topK,
                rawResponse: labelingResponse
            }];

        } catch (error) {
            console.error('Error detecting violations:', error);
            throw error;
        }
    }

    // Get LLM feedback for code execution results
    async getLLMFeedback(feedbackPrompt) {
        try {
            console.log('Getting LLM feedback for execution results...');
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert ML engineer and code reviewer. Analyze execution results and provide specific, actionable feedback for improving ML contract implementations."
                    },
                    {
                        role: "user",
                        content: feedbackPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 2000
            });

            const feedback = response.choices[0].message.content.trim();
            console.log('LLM feedback received:', feedback);
            
            return feedback;
        } catch (error) {
            console.error('Error getting LLM feedback:', error);
            throw new Error(`Failed to get LLM feedback: ${error.message}`);
        }
    }

    // Generate PyContracts for violations with automatic feedback loop
    async generateContracts(violations, feedbackService = null) {
        console.log('generateContracts called with violations:', violations);
        const contracts = [];

        for (const violation of violations) {
            try {
                console.log('Processing violation:', violation);
                console.log('Violation labels:', violation.labels);
                console.log('Violation codeAnalysis:', violation.codeAnalysis);
                
                const pyPrompt = this.buildPyPrompt(violation.codeAnalysis, violation.labels);
                console.log('PyContract prompt generated, calling LLM...');
                
                const pyResponse = await this.runChatPrompt(pyPrompt);
                console.log('PyContract LLM response received:', pyResponse.substring(0, 200) + '...');

                const both = this.extractBothCodes(pyResponse);

                let finalBuggyCode = both.buggy;
                let finalFixedCode = both.fixed;
                let feedbackIterations = 0;

                if (feedbackService && both.buggy && both.fixed) {
                    console.log('Running automatic feedback loop for contract improvement...');
                    try {
                        const feedbackResult = await feedbackService.runIterativeImprovement(
                            violation.codeAnalysis.originalCode || '',
                            both.buggy,
                            both.fixed,
                            violation,
                            this, // ragService for LLM feedback
                            2 // max iterations for automatic feedback
                        );
                        if (feedbackResult.success) {
                            console.log('Feedback loop successful, using improved code');
                            finalBuggyCode = feedbackResult.finalBuggyCode;
                            finalFixedCode = feedbackResult.finalFixedCode;
                            feedbackIterations = feedbackResult.totalIterations;
                        } else {
                            console.log('Feedback loop completed but not fully successful, using original code');
                            feedbackIterations = feedbackResult.totalIterations;
                        }
                    } catch (feedbackError) {
                        console.warn('Feedback loop failed, using original generated code:', feedbackError.message);
                    }
                } else {
                    console.log('Using generated code directly (no feedback service or missing code)');
                }

                contracts.push({
                    violation,
                    buggyCode: finalBuggyCode,
                    fixedCode: finalFixedCode,
                    nlpContract: both.nlpContract,
                    actionableInsight: both.insight,
                    rawResponse: pyResponse,
                    feedbackIterations: feedbackIterations,
                    autoImproved: feedbackIterations > 0
                });

            } catch (error) {
                console.error('Error generating contract for violation:', error);
                contracts.push({
                    violation,
                    buggyCode: '',
                    fixedCode: '',
                    nlpContract: 'Error generating contract',
                    actionableInsight: 'Please try again or check your code',
                    error: error.message
                });
            }
        }

        console.log('Generated contracts with automatic feedback:', contracts);
        return contracts;
    }
}

module.exports = RAGService;
