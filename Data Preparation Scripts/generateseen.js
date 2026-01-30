import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";

const inputCSV = "Keras_Original_dataset.csv";        // Your full labeled dataset
const outputSeenCSV = "keras_Seen.csv";       // Output file
const MAX_PER_LABEL = 5;                       // Increase to get more examples per label

// Read and filter rows with valid labels
async function readCleanData() {
  const rows = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputCSV)
      .pipe(csvParser())
      .on("data", (row) => {
        if (
          row["Level 1 (Central Contract Category)"] &&
          row["Level 2"] &&
          row["Level 3 (Hybrid Patterns)"] &&
          row["Level 1 (Central Contract Category)"].trim() !== "0" &&
          row["Level 2"].trim() !== "0" &&
          row["Level 3 (Hybrid Patterns)"].trim() !== "0"
        ) {
          rows.push(row);
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// Sample up to N rows for each unique label
function sampleByLabel(data, labelField, max) {
  const byLabel = {};
  data.forEach((row) => {
    const label = row[labelField];
    if (!byLabel[label]) byLabel[label] = [];
    if (byLabel[label].length < max) {
      byLabel[label].push(row);
    }
  });
  return Object.values(byLabel).flat();
}

// Write final examples to CSV
async function writeSeenCSV(rows) {
  const header = Object.keys(rows[0]).map((key) => ({ id: key, title: key }));
  const writer = createObjectCsvWriter({ path: outputSeenCSV, header });
  await writer.writeRecords(rows);
  console.log(`✅ Saved ${rows.length} examples to ${outputSeenCSV}`);
}

// Main process
async function main() {
  const data = await readCleanData();

  const l1 = sampleByLabel(data, "Level 1 (Central Contract Category)", MAX_PER_LABEL);
  const l2 = sampleByLabel(data, "Level 2", MAX_PER_LABEL);
  const l3 = sampleByLabel(data, "Level 3 (Hybrid Patterns)", MAX_PER_LABEL);

  // Combine without over-deduplicating
  const combined = [...l1, ...l2, ...l3];

  // Optional: de-dupe only exact row duplicates
  const jsonStrings = new Set();
  const unique = combined.filter((row) => {
    const json = JSON.stringify(row);
    if (jsonStrings.has(json)) return false;
    jsonStrings.add(json);
    return true;
  });

  await writeSeenCSV(unique);
}

main();
