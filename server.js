const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
// The browser sends the raw CSV text as the request body
app.use(express.text({ type: "*/*", limit: "5mb" }));

// ---------- Data map helpers ----------
const PROGRAMS = {
  BSIT: "Bachelor of Science in Information Technology",
  BSCS: "Bachelor of Science in Computer Science",
};

const capitalize = (str) =>
  str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const toProgram = (code) => {
  const key = code.trim().toUpperCase();
  return PROGRAMS[key] || code.trim(); // fall back to the original value
};

// ---------- Minimal CSV parser (handles quotes, commas, CRLF) ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  text = text.replace(/^\uFEFF/, ""); // strip BOM if present

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// ---------- Transform CSV rows -> JSON objects ----------
function transform(rows) {
  const [header, ...data] = rows;
  const cols = header.map((h) => h.trim());
  const required = [
    "student_id",
    "first_name",
    "last_name",
    "course",
    "year_level",
    "email",
    "tuition_balance",
  ];
  const missing = required.filter((r) => !cols.includes(r));
  if (missing.length) {
    throw new Error("Missing column(s): " + missing.join(", "));
  }

  return data.map((values) => {
    const r = {};
    cols.forEach((c, i) => (r[c] = (values[i] ?? "").trim()));

    return {
      studentId: parseInt(r.student_id, 10),
      firstName: capitalize(r.first_name),
      lastName: capitalize(r.last_name),
      program: toProgram(r.course),
      yearLevel: parseInt(r.year_level, 10),
      emailAddress: r.email.toLowerCase(),
      outstandingBalance: Number(parseFloat(r.tuition_balance || "0").toFixed(2)),
    };
  });
}

// JSON.stringify drops trailing zeros (5000.00 -> 5000), so we mark the
// balance and swap it back in as a real number with 2 decimal places.
function stringify(records) {
  const marked = records.map((rec) => ({
    ...rec,
    outstandingBalance: `__NUM__${rec.outstandingBalance.toFixed(2)}__`,
  }));
  return JSON.stringify(marked, null, 2).replace(/"__NUM__(.*?)__"/g, "$1");
}

// ---------- Route ----------
app.post("/convert", (req, res) => {
  try {
    if (typeof req.body !== "string" || !req.body.trim()) {
      return res.status(400).json({ error: "Empty or invalid CSV." });
    }
    const rows = parseCSV(req.body);
    if (rows.length < 2) {
      return res.status(400).json({ error: "CSV has no data rows." });
    }
    res.type("application/json").send(stringify(transform(rows)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
