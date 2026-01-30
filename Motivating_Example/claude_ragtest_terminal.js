//claude version of the contract labeling script.
//To run the motivatinng example use this link: https://stackoverflow.com/questions/47665391
//Generated Buggy and Fixed contract files may need refinement. You may execute the refined scripts:Claude_post_47665391_BUGGY.py and Claude_post_47665391_FIXED.py


import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import readlineSync from "readline-sync";
import { createObjectCsvWriter } from "csv-writer";

dotenv.config();

const researchPaperPath = "rcontext.txt";                    // research context
const actionableExamplesPath = "actionable_examples.txt";    //actionable insights context
const pycontractDocPath1 = "pycontracts_doc.txt";            //pycontract documentaiton context
const pycontractDocPath2 = "pycontracts_deep.txt";           //pycontract deep learning context
const embeddedExamplesPath = "kerasembedded_examples.json";  //embedded examples form the embedder

const EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL = "claude-3-7-sonnet-20250219"; // Claude model
const TOP_K = 5;

// === outputs ===
const OUTPUT_BUGGY = "terminal_pycontract_buggy.py";
const OUTPUT_FIXED = "terminal_pycontract_fixed.py";
const OUTPUT_CSV = "terminal_output.csv";

// set SHOW_PY_PROMPT=1 in env if you want to print the full Py prompt
const SHOW_PY_PROMPT = process.env.SHOW_PY_PROMPT === "1";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ---------- helpers ----------
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const norm = x => Math.sqrt(x.reduce((sum, val) => sum + val * val, 0));
  return dot / (norm(a) * norm(b));
}

function extractLabel(response, field, singleWord = false) {
  const regex = new RegExp(field + ":[ \\t]*(.+)", "i");
  const match = response.match(regex);
  if (!match) return "";
  const fullText = match[1].trim();
  return singleWord ? fullText.split(/,|;|\/| and /)[0].trim() : fullText;
}

function betweenTags(s, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = s.match(re);
  return m ? m[1].trim() : "";
}

function extractCodeFromFenced(block) {
  let m = block.match(/```python([\s\S]*?)```/i);
  if (m) return m[1].trim();
  m = block.match(/```([\s\S]*?)```/);
  if (m) return m[1].trim();
  return block.trim();
}

function extractPyContractOutput(content) {
  const buggySection = betweenTags(content, "BUGGY_CODE");
  const fixedSection = betweenTags(content, "FIXED_CODE");
  const nlpTagged = betweenTags(content, "NLP_CONTRACT");
  const insightTagged = betweenTags(content, "ACTIONABLE_INSIGHT");

  const oldSingleCode = content.match(/```python([\s\S]*?)```/);
  const nlpOld = content.match(/NLP Contract:\s*-\s*([\s\S]*?)\n(?:Actionable Insight:|$)/i);
  const insightOld = content.match(/Actionable Insight:\s*-\s*([\s\S]*)/i);

  return {
    buggyCode: buggySection ? extractCodeFromFenced(buggySection)
              : (oldSingleCode ? oldSingleCode[1].trim() : ""),
    fixedCode: fixedSection ? extractCodeFromFenced(fixedSection) : "",
    nlpContract: nlpTagged || (nlpOld ? nlpOld[1].trim() : "Not found"),
    insight: insightTagged || (insightOld ? insightOld[1].trim() : "Not found")
  };
}

function htmlToMarkdown(html) {
  let s = html || "";

  s = s.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m, code) =>
    `\n\`\`\`python\n${code
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")}\n\`\`\`\n`
  );

  s = s.replace(/<code>(.*?)<\/code>/gi, (_m, code) =>
    "`" + code
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&") + "`"
  );

  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi,
    (_m, href, text) => `[${text}](${href})`
  );

  s = s.replace(/<img [^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*\/?>/gi,
    (_m, alt, src) => `![${alt}](${src})`
  );

  s = s.replace(/<p>/gi, "\n").replace(/<\/p>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");

  s = s.replace(/<[^>]+>/g, "")
       .replace(/&nbsp;/g, " ")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&amp;/g, "&");

  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

async function getEmbedding(text) {
  const response = await axios.post("http://127.0.0.1:11434/api/embeddings", {
    model: EMBED_MODEL,
    input: text
  });
  const body = response.data;
  if (Array.isArray(body?.data) && body.data[0]?.embedding) return body.data[0].embedding;
  if (Array.isArray(body?.embedding)) return body.embedding;
 throw new Error("Unexpected embeddings response shape from Ollama.");
}

async function fetchPostContent(postURL) {
  function parseQuestionIdFromUrl(url) {
    const m = url.match(/\/questions\/(\d+)/i);
    if (m) return m[1];
    const parts = url.split("/");
    return parts[4] || "";
  }

  const questionId = parseQuestionIdFromUrl(postURL);
  if (!questionId) throw new Error(`Could not parse question ID from URL: ${postURL}`);

  const site = "stackoverflow";

  const questionRes = await axios.get(
    `https://api.stackexchange.com/2.3/questions/${questionId}`,
    { params: { site, filter: "withbody" } }
  );
  const qItem = questionRes.data.items?.[0] || {};
  const title = qItem.title || "";
  const questionHtml = qItem.body || "";

  const answerRes = await axios.get(
    `https://api.stackexchange.com/2.3/questions/${questionId}/answers`,
    { params: { site, sort: "votes", order: "desc", filter: "withbody" } }
  );
  const items = Array.isArray(answerRes.data.items) ? answerRes.data.items : [];
  const accepted = items.find(a => a.is_accepted);

  if (!accepted) {
    console.warn("⚠️ No accepted answer for this post; proceeding with empty answer.");
  }

  const answerMarkdown = accepted ? htmlToMarkdown(accepted.body) : "";

  return {
    postURL,
    title,
    question: htmlToMarkdown(questionHtml),
    answer: answerMarkdown
  };
}

async function loadContext() {
  const [researchPaper, actionableExamples, py1, py2, embeddedExamples] = await Promise.all([
    fs.promises.readFile(researchPaperPath, "utf-8"),
    fs.promises.readFile(actionableExamplesPath, "utf-8"),
    fs.promises.readFile(pycontractDocPath1, "utf-8"),
    fs.promises.readFile(pycontractDocPath2, "utf-8"),
    fs.promises.readFile(embeddedExamplesPath, "utf-8")
  ]);
  return {
    researchPaper,
    actionableExamples,
    pycontractDoc: py1 + "\n\n" + py2,
    embeddedExamples: JSON.parse(embeddedExamples)
  };
}


function buildLabelingPrompt(research, actionable, examples, post) {
    return ` You are an expert at labeling Stack Overflow posts according to a predefined taxonomy described in the research paper below.
  
  --- RESEARCH PAPER ---
  ${research}
  
  --- ACTIONABLE INSIGHT EXAMPLES ---
  ${actionable}
  
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
  URL: ${post.postURL}
  Title: ${post.title}
  Question: ${post.question}
  Answer: ${post.answer}
  
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
  - Reasons for labeling: Provide a clear explanation
  
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
  Reasons for labeling: [your explanation].
  `;
  }
  
  function buildPyPrompt(ctx, post, label) {
    return `
  You are an expert Python engineer and ML contract verifier.
  
  --- RESEARCH CONTEXT ---
  ${ctx.researchPaper}
  
  --- PYCONTRACT DOCUMENTATION ---
  ${ctx.pycontractDoc}
  
  --- ACTIONABLE INSIGHT EXAMPLES ---
  ${ctx.actionableExamples}
  
  --- STACK OVERFLOW POST ---
  URL: ${post.postURL}
  Title: ${post.title}
  Question:
  ${post.question}
  
  Answer:
  ${post.answer}
  
  --- CLASSIFICATION LABELS FOR THIS POST ---
  Level 1: ${label.level1}
  Level 2: ${label.level2}
  Level 3: ${label.level3}
  Root Cause: ${label.rootCause}
  Effect: ${label.effect}
  Contract Violation Location: ${label.contractViolationLocation}
  Detection Technique: ${label.detectionTechnique}
  Reasons for Labeling: ${label.reasonsForLabeling}
  
  --- TARGET ENVIRONMENT ---
  - Python: 3.10–3.11
  - Contracts library: PyPI package "PyContracts" (import as: from contracts import ...), version 1.8.x
  - Other libs: only those mentioned in the post; prefer CPU builds; avoid unnecessary deps
  
  --- TASK ---
  0) Replicate the question’s code verbatim when possible. Only replace APIs that are deprecated/removed or incompatible with the TARGET ENVIRONMENT. For each such change, add an inline comment:
     # [REPLACED] <old> -> <new> (reason)
     (Preserve variable names and structure; do not “improve” logic beyond reproducing the error.)
  1) From the “STACK OVERFLOW POST” section, identify:
     a) the failing API call (the method that raises), and
     b) the specific precondition that would prevent that failure (infer from the accepted answer and/or traceback).
  2) Complete the post’s code into a self-contained, deterministic Python module that reproduces the same failure scenario.
  3) Introduce a thin wrapper function around the failing API with @contract (from 'contracts') where you encode that precondition.
     - Use @contract for types/shapes and an inline assert for stateful requirements.
     - Avoid @new_contract unless strictly necessary; if used, give it a name and make it return a boolean.
  4) Produce TWO modules using the SAME contract(s):
     - BUGGY: reproduces the failure, but the failure is a contract violation (not a generic crash).
     - FIXED: satisfies the same contract and exits successfully.
  5) In each module, include an if __name__ == "__main__": block:
     - BUGGY: demonstrate the buggy usage so the contract triggers (contract violation).
     - FIXED: demonstrate the corrected usage that passes under the same contract.
  6) Constraints:
     - Deterministic: no network/downloads; use small synthetic data; set random seeds where relevant.
     - Stay within the libraries mentioned in the post; only minimal dependencies.
     - Keep function names/signatures stable (to enable automated repairs).
     - Ensure the code runs under the TARGET ENVIRONMENT above.
     - Do NOT use the "contracts" PyPI package (different project); use PyContracts (from contracts import ...).
  
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
  - Avoid 'inst(...)' and lowercase 'callable' strings; these can break on newer PyContracts.
  - When replacing deprecated APIs (e.g., keras.wrappers.scikit_learn -> scikeras.wrappers), add [REPLACED] comments.
  `;
  }


// --- Claude call wrapper ---
async function runPrompt(prompt) {
  const msg = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 2000,
    temperature: 0.3,
    system: "You are an expert in ML contract violations and PyContracts.",
    messages: [{ role: "user", content: prompt }]
  });
  return msg.content[0].text;
}

// ---------------- main ----------------
async function main() {
  const postURL = readlineSync.question("🔗 Enter Stack Overflow post URL: ");
  const context = await loadContext();
  const post = await fetchPostContent(postURL);

  const topK = context.embeddedExamples.slice(0, 5);

  const labelPrompt = buildLabelingPrompt(context.researchPaper, context.actionableExamples, topK, post);
  const labelResponse = await runPrompt(labelPrompt);
  console.log("\n🧾 Raw Labeling Response:\n", labelResponse);

  const labels = {
    level1: extractLabel(labelResponse, "Level 1", true),
    level2: extractLabel(labelResponse, "Level 2", true),
    level3: extractLabel(labelResponse, "Level 3"),
    leafContractCategory: extractLabel(labelResponse, "Leaf Contract Category") || extractLabel(labelResponse, "Level 3"),
    rootCause: extractLabel(labelResponse, "Root Cause"),
    effect: extractLabel(labelResponse, "Effect"),
    contractViolationLocation: extractLabel(labelResponse, "Contract Violation Location"),
    detectionTechnique: extractLabel(labelResponse, "Detection Technique"),
    reasonsForNotLabeling: extractLabel(labelResponse, "Reasons for not labelling"),
    reasonsForLabeling: extractLabel(labelResponse, "Reasons for labeling"),
    mlApiName: "N/A",
    mlLibrary: "N/A"
  };

  const pyPrompt = buildPyPrompt(context, post, labels);
  if (SHOW_PY_PROMPT) {
    console.log("\n──────── PY PROMPT (BEGIN) ────────\n");
    console.log(pyPrompt);
    console.log("\n──────── PY PROMPT (END) ────────\n");
  }

  const pyResponse = await runPrompt(pyPrompt);
  console.log("\n🧾 Raw Py Response (truncated 2k chars):\n", pyResponse.slice(0, 2000));

  const pyOut = extractPyContractOutput(pyResponse);

  if (pyOut.buggyCode) {
    fs.writeFileSync(OUTPUT_BUGGY, pyOut.buggyCode);
    console.log(`✅ BUGGY module saved to '${OUTPUT_BUGGY}'`);
  } else {
    console.warn("⚠️ BUGGY_CODE not found in model output.");
  }

  if (pyOut.fixedCode) {
    fs.writeFileSync(OUTPUT_FIXED, pyOut.fixedCode);
    console.log(`✅ FIXED module saved to '${OUTPUT_FIXED}'`);
  } else {
    console.warn("⚠️ FIXED_CODE not found in model output.");
  }

  console.log("\n📄 NLP Contract:\n", pyOut.nlpContract);
  console.log("\n💡 Actionable Insight:\n", pyOut.insight);
  console.log("\n📘 Classification Labels:\n", labels);

  const row = {
    postURL,
    ...labels,
    nlpContract: pyOut.nlpContract,
    buggySpec: pyOut.buggyCode ? `Wrote ${OUTPUT_BUGGY}` : "Missing",
    fixedSpec: pyOut.fixedCode ? `Wrote ${OUTPUT_FIXED}` : "Missing",
    insight: pyOut.insight
  };

  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_CSV,
    header: Object.keys(row).map(k => ({ id: k, title: k }))
  });

  await csvWriter.writeRecords([row]);
  console.log(`📥 All results saved to ${OUTPUT_CSV}`);
}

main();
