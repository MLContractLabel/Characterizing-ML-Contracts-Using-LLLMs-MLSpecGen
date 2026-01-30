
import fs from "fs";
import csvParser from "csv-parser";
import axios from "axios";

const MODEL = "nomic-embed-text";
const INPUT_CSV = "tensorflow_seen.csv";
const OUTPUT_JSON = "tensorembedded_examples.json";
const OLLAMA_URL = "http://127.0.0.1:11434/api/embeddings";
const EXPECTED_DIM = 768;


const MAX_EMBED_CHARS = 12000;
const NUM_CTX = 8192;

// HTML Markdown 

function htmlToMarkdown(html) {
  let s = (html || "").toString();

  s = s.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m, code) =>
    `\n\`\`\`python\n${code
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")}\n\`\`\`\n`
  );

  s = s.replace(/<code>(.*?)<\/code>/gi, (_m, code) =>
    "`" + code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") + "`"
  );

  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href, text) =>
    `[${text}](${href})`
  );

  s = s.replace(/<img [^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*\/?>/gi, (_m, alt, src) =>
    `![${alt}](${src})`
  );

  s = s.replace(/<p>/gi, "\n")
       .replace(/<\/p>/gi, "\n")
       .replace(/<br\s*\/?>/gi, "\n");

  s = s.replace(/<[^>]+>/g, "")
       .replace(/&nbsp;/g, " ")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&amp;/g, "&");

  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

//Utilities 

function pick(row, names) {
  for (const n of names) {
    if (row[n] != null && row[n] !== "") return row[n];
  }
  return "";
}

async function readCSV(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file)
      .pipe(csvParser())
      .on("data", r => rows.push(r))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function clampText(s, maxChars) {
  s = (s || "").toString().replace(/\u0000/g, "").trim();
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}

function isContextLengthError(err) {
  const msg = err?.response?.data?.error || err?.response?.data || err?.message || "";
  const m = typeof msg === "string" ? msg : JSON.stringify(msg);
  return m.toLowerCase().includes("exceeds the context length");
}

//Ollama Embedding 

async function embedOnce(text) {
  if (!text || text.trim().length < 30) {
    throw new Error("Embedding input text too short.");
  }

  const resp = await axios.post(
    OLLAMA_URL,
    {
      model: MODEL,
      prompt: text,
      options: { num_ctx: NUM_CTX }
    },
    { timeout: 30000 }
  );

  const embedding = resp.data?.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Empty embedding returned from Ollama.");
  }
  if (embedding.length !== EXPECTED_DIM) {
    console.warn(`⚠️ Unexpected embedding size: ${embedding.length} (expected ${EXPECTED_DIM})`);
  }

  return embedding;
}

// Adaptive truncation 
async function getEmbeddingAdaptive(textRaw, { minChars = 200, maxTries = 30 } = {}) {
  let raw = (textRaw || "").toString().replace(/\u0000/g, "").trim();
  if (raw.length < 30) throw new Error("Embedding input text too short.");


  let hiFail = null;
  let loOk = null;


  let startLen = Math.min(raw.length, MAX_EMBED_CHARS);
  let curLen = startLen;

 
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const curText = raw.slice(0, curLen);
    try {
      const embedding = await embedOnce(curText);
      loOk = curLen;              // we found a working length
      break;
    } catch (err) {
      if (!isContextLengthError(err)) throw err; // real error -> bubble up

      hiFail = curLen; // this length failed due to context

      // shrink aggressively
      curLen = Math.floor(curLen * 0.8);

      if (curLen < minChars) {
        const e = new Error(`Even after truncation below ${minChars} chars, still exceeds context length.`);
        e.cause = err;
        throw e;
      }
    }
  }

  if (loOk == null) {
    throw new Error("Could not find a working truncation length within retry limit.");
  }


  if (hiFail == null) {
    return { embedding: await embedOnce(raw.slice(0, loOk)), usedLen: loOk };
  }

  let lo = loOk;
  let hi = hiFail; 

  while (hi - lo > 50) { 
    const mid = Math.floor((lo + hi) / 2);
    try {
      await embedOnce(raw.slice(0, mid));
      lo = mid; 
    } catch (err) {
      if (!isContextLengthError(err)) throw err;
      hi = mid;
    }
  }

  const finalLen = lo;
  const finalText = raw.slice(0, finalLen);
  const finalEmbedding = await embedOnce(finalText);

  return { embedding: finalEmbedding, usedLen: finalLen };
}



function buildInputText({ api, title, question, answer }) {
  return [
    api ? `ML API Name: ${api}` : "",
    title ? `Title: ${title}` : "",
    "Question:",
    (question || "").trim(),
    "",
    "Answer:",
    (answer || "").trim()
  ].join("\n").trim();
}


(async () => {
  const rows = await readCSV(INPUT_CSV);
  const out = [];

  console.log(`🔹 Loaded ${rows.length} rows from CSV`);
  console.log(`🔹 Embedding model: ${MODEL}`);
  console.log(`🔹 Initial cap (MAX_EMBED_CHARS): ${MAX_EMBED_CHARS}`);
  console.log(`🔹 Per-request num_ctx: ${NUM_CTX}`);
  console.log("");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const postURL = pick(row, ["SO Post URL", "so_post_url", "url", "Post URL"]);
    const title = pick(row, ["Title", "title"]);
    const api = pick(row, ["ML API Name", "ml_api_name", "API", "api"]);

    const question = htmlToMarkdown(pick(row, ["Question", "question", "question_html"]));
    const answer = htmlToMarkdown(pick(row, ["Answer", "answer", "answer_html"]));

    const inputTextRaw = buildInputText({ api, title, question, answer });

    let embedding;
    let usedLen = inputTextRaw.length;

    try {
      const res = await getEmbeddingAdaptive(inputTextRaw);
      embedding = res.embedding;
      usedLen = res.usedLen;

      if (usedLen < inputTextRaw.length) {
        console.warn(
          `⚠️ Auto-truncated to context limit for row ${i + 1}: ${inputTextRaw.length} -> ${usedLen} chars`
        );
      }
    } catch (err) {
      const status = err?.response?.status;
      const endpoint = err?.config?.url;
      const data = err?.response?.data;

      console.error(`❌ Failed embedding row ${i + 1}: ${err.message}`);
      if (postURL) console.error(`   Post URL: ${postURL}`);
      if (status) console.error(`   HTTP status: ${status}`);
      if (endpoint) console.error(`   Endpoint: ${endpoint}`);
      if (data) {
        const msg = typeof data === "string" ? data : JSON.stringify(data);
        console.error(`   Response: ${msg.slice(0, 800)}`);
      }
      continue; 
    }

    out.push({
      postURL,
      title,
      question,
      answer,
      mlApiName: api,
      embedding,
      label: {
        level1: pick(row, ["Level 1 (Central Contract Category)", "level1", "Level 1"]),
        level2: pick(row, ["Level 2", "level2"]),
        level3: pick(row, ["Level 3 (Hybrid Patterns)", "level3", "Level 3"]),
        leafContractCategory:
          pick(row, ["Leaf Contract Category", "leafContractCategory"]) ||
          pick(row, ["Level 3 (Hybrid Patterns)", "level3", "Level 3"]),
        rootCause: pick(row, ["Root Cause", "rootCause"]),
        effect: pick(row, ["Effect", "effect"]),
        mlLibrary: pick(row, ["ML Library", "mlLibrary"]),
        contractViolationLocation: pick(row, ["Contract Violation Location", "contractViolationLocation"]),
        detectionTechnique: pick(row, ["Detection Technique", "detectionTechnique"]),
        reasonsForNotLabeling:
          pick(row, ["Reasons for not labelling", "reasonsForNotLabeling"]) || "NA",
        reasonsForLabeling: pick(row, ["Reasons for labeling", "reasonsForLabeling"])
      }
    });

    console.log(`✅ ${i + 1}/${rows.length} embedded`);
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(out, null, 2));
  console.log(`\n💾 Saved ${out.length} embedded examples to ${OUTPUT_JSON}`);
})();
