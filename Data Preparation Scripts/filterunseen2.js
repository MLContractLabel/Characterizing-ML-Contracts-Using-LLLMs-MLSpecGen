import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";

const seenPath = "Keras_seen.csv";   //Seen examples file
const originalPath = "Keras_Original_Dataset.csv";   // original labeled dataset
const outputPath = "keras_unseen.csv";            //output unseen
const removedPath = "keras_removed.csv";          //removed posts

// Try these keys, case-insensitive, spaces ignored. We'll normalize headers so we can read any of them.
const URL_CANDIDATE_KEYS = [
  "so post url",
  "post url",
  "url",
  "link",
  "so url",
  "question url",
];

// --- Helpers ---
function stripBOM(s = "") {
  return s.replace(/^\uFEFF/, "");
}

function normalizeHeaderKey(k = "") {
  return stripBOM(String(k)).trim().toLowerCase();
}

function normalizeValue(v) {
  return typeof v === "string" ? v.trim() : v;
}

function canonicalizeUrl(raw) {
  if (!raw) return "";
  let s = String(raw).trim();

  // If missing protocol, assume https
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;

  try {
    const u = new URL(s);

    // Lowercase protocol + host, strip leading www.
    const protocol = "https:"; // unify http/https
    const host = u.host.replace(/^www\./i, "").toLowerCase();

    // Drop query & hash, trim trailing slashes from path
    const pathname = u.pathname.replace(/\/+$/, "");

    return `${protocol}//${host}${pathname}`;
  } catch {
    // If URL constructor fails, do a lighter normalization
    return s.toLowerCase().replace(/^https?:\/\//, "https://").replace(/^https:\/\/www\./, "https://").replace(/\/+$/, "");
  }
}

function pickUrlFromRow(row) {
  // Row keys are already normalized to lower-case by mapHeaders.
  for (const key of URL_CANDIDATE_KEYS) {
    if (key in row && row[key]) return row[key];
  }
  return "";
}

async function readURLSet(csvPath, label) {
  const set = new Set();
  let rows = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => normalizeHeaderKey(header),
          mapValues: ({ value }) => normalizeValue(value),
        })
      )
      .on("headers", (headers) => {
        console.log(`🧠 ${label} headers:`, headers);
      })
      .on("data", (row) => {
        rows++;
        const urlRaw = pickUrlFromRow(row);
        const url = canonicalizeUrl(urlRaw);
        if (url) set.add(url);
      })
      .on("end", () => {
        console.log(`✅ ${label}: ${rows} rows scanned, ${set.size} unique URLs collected`);
        console.log(`🔎 Sample ${label} URLs:`, Array.from(set).slice(0, 5));
        resolve();
      })
      .on("error", reject);
  });

  return set;
}

async function filterByURL(seenURLs) {
  const kept = [];
  const removed = [];
  const seenOriginalUrls = new Set(); // de-dupe inside scikit2.csv

  let total = 0;
  let noUrl = 0;
  let droppedAsSeen = 0;
  let droppedAsDup = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(originalPath)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => normalizeHeaderKey(header),
          mapValues: ({ value }) => normalizeValue(value),
        })
      )
      .on("headers", (headers) => {
        console.log("📋 Original headers:", headers);
      })
      .on("data", (row) => {
        total++;
        const urlRaw = pickUrlFromRow(row);
        const url = canonicalizeUrl(urlRaw);

        if (!url) {
          noUrl++;
          // Keep rows without URL (can’t filter them by URL). Comment the next line to skip them instead.
          kept.push(row);
          return;
        }

        // Drop if URL is in seen
        if (seenURLs.has(url)) {
          droppedAsSeen++;
          removed.push(row);
          return;
        }

        // De-dupe within original by URL after canonicalization
        if (seenOriginalUrls.has(url)) {
          droppedAsDup++;
          // not adding to removed; it's a within-file dup rather than a seen match
          return;
        }

        seenOriginalUrls.add(url);
        kept.push(row);
      })
      .on("end", () => {
        console.log(
          `📊 Stats — total: ${total}, no URL: ${noUrl}, removed (in seen): ${droppedAsSeen}, removed (dups in original): ${droppedAsDup}, kept: ${kept.length}`
        );
        if (kept.length) console.log("✅ Sample kept row:", kept[0]);
        if (removed.length) console.log("🗑️ Sample removed row:", removed[0]);
        resolve();
      })
      .on("error", reject);
  });

  return { kept, removed };
}

async function saveCSV(path, rows) {
  if (!rows.length) {
    console.log(`⚠️ No rows to save for ${path}`);
    return;
  }
  const header = Object.keys(rows[0]).map((key) => ({ id: key, title: key }));
  const writer = createObjectCsvWriter({ path, header });
  await writer.writeRecords(rows);
  console.log(`💾 Saved ${rows.length} rows → ${path}`);
}

async function main() {
  console.log("🚀 URL-only unseen filtering with robust normalization…");

  const seenURLs = await readURLSet(seenPath, "Seen");
  const { kept, removed } = await filterByURL(seenURLs);

  await saveCSV(outputPath, kept);
  await saveCSV(removedPath, removed);

  console.log("✅ Done.");
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
});
