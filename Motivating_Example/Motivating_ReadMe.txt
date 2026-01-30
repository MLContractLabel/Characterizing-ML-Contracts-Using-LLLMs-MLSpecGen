# PyContracts Synthesis & Repair — Quick Start (GPT & Claude)

A tiny pipeline that:
- fetches a Stack Overflow post,
- retrieves similar examples via **local embeddings** (Ollama),
- asks an LLM (**OpenAI GPT** or **Anthropic Claude**) to emit **BUGGY**/**FIXED** Python with **PyContracts**, and
- writes a CSV with a compact “Refinement” label (e.g., `contract(syntax)`, `functional(logic)`, `contract(Syntax & Logic)`, `no-change`, …).

---

1) Flow (at a glance)

StackOverflow URL
↓
Fetch Q/A + Build embedding (Ollama: nomic-embed-text)
↓
Top-K example retrieval from embedded_examples.json
↓
LLM (GPT or Claude): labeling prompt → refinement labels
↓
LLM (GPT or Claude): code prompt → <BUGGY_CODE> / <FIXED_CODE>
↓
Write files: terminal_pycontract_buggy2.py, terminal_pycontract_fixed2.py, terminal_output2.csv



---

2) Requirements

- **Node.js ≥ 18**
- **Ollama** with model `nomic-embed-text` running locally (for embeddings)
- Internet access for Stack Exchange API

Start/prepare Ollama:(Not for motivating example)

ollama pull nomic-embed-text
ollama serve    # serves http://127.0.0.1:11434
 Configure Keys (choose GPT or Claude per run)

3) Environment Setup

Before running the script, create a `.env` file in the project root and add your API credentials using the **exact variable names** below.

4) Select Your LLM Provider

```env
LLM_PROVIDER=anthropic        # or: openai
 Claude (Anthropic) — If using Claude
ANTHROPIC_API_KEY=your_anthropic_api_key_here
CHAT_MODEL=claude-3-7-sonnet-20250219
OpenAI (GPT) — If using GPT
OPENAI_API_KEY=your_openai_api_key_here
CHAT_MODEL=gpt-4o-2024-05-13
Make sure your .env file is saved in the same directory as the script and named exactly .env. The script uses the dotenv package to load these values at runtime.


5) Install & Run (local)

# from project root
node -v
npm init -y
npm install axios dotenv readline-sync csv-writer @anthropic-ai/sdk openai

To run the pycontracts scripts, you may need to install these libraries.compatible with python 3.10
pip install numpy==1.24.4 tensorflow==2.11.0 PyContracts==1.8.12


# make sure keys (above) are exported, then run:

node node gpt_ragtest_terminal.js / claude_ragtest_terminal.js
# You'll be prompted:
# 🔗 Enter Stack Overflow post URL:
# paste e.g.: https://stackoverflow.com/questions/47665391

6) Required Context Files (same folder as Contract Labeling script)

rcontext.txt
actionable_examples.txt
pycontracts_doc.txt
pycontracts_deep.txt
embedded_examples.json   # each entry must include: "embedding": [float,...]


7) Outputs per run

terminal_pycontract_buggy.py   # BUGGY_CODE with PyContracts
terminal_pycontract_fixed.py   # FIXED_CODE with PyContracts
terminal_output.csv            # labels + NLP contract + insight + output paths



8) Evaluation

To evaluate metrics like accuracy,precision,recall and F1 score of the generated labels,
run the metrics_final.js script as provided in the package.



Missing <BUGGY_CODE> / <FIXED_CODE> → Check prompt tags, raise max_tokens, set SHOW_PY_PROMPT=1.


Labels look off → Improve embedded_examples.json retrieval quality and verify CHAT_MODEL / provider selection.
