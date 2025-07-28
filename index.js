const fetch = require("node-fetch");
require("dotenv").config();

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://assessment.ksensetech.com/api";

if (!API_KEY) {
  console.error("ERROR: API_KEY not found. Please create a .env file with your API_KEY.");
  process.exit(1);
}

// ----------------- FETCH PATIENT DATA -----------------
async function fetchPatients() {
  let patients = [];
  let page = 1;
  let hasNext = true;
  const maxRetries = 5;
  let retryCount = 0;

  while (hasNext) {
    try {
      const response = await fetch(\`\${BASE_URL}/patients?page=\${page}&limit=10\`, {
        headers: { "x-api-key": API_KEY }
      });

      if (response.status === 429) {
        console.warn("Rate limited, retrying in 2 seconds...");
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);

      const data = await response.json();
      patients.push(...data.data);
      hasNext = data.pagination.hasNext;
      page++;
      retryCount = 0; // reset retry count on success
    } catch (err) {
      retryCount++;
      console.error(\`Error fetching page \${page}: \${err.message}, retrying... (\${retryCount})\`);
      if (retryCount >= maxRetries) {
        console.error("Max retries reached. Exiting fetch.");
        break;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return patients;
}

// ----------------- SCORING FUNCTIONS -----------------
function calculateBPScore(bp) {
  if (!bp || typeof bp !== "string" || !bp.includes("/")) return 0;
  const [systolic, diastolic] = bp.split("/").map(Number);
  if (isNaN(systolic) || isNaN(diastolic)) return 0;

  if (systolic < 120 && diastolic < 80) return 1;
  if (systolic >= 120 && systolic <= 129 && diastolic < 80) return 2;
  if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) return 3;
  if (systolic >= 140 || diastolic >= 90) return 4;
  return 0;
}

function calculateTempScore(temp) {
  if (typeof temp !== "number") return 0;
  if (temp <= 99.5) return 0;
  if (temp >= 99.6 && temp <= 100.9) return 1;
  if (temp >= 101.0) return 2;
  return 0;
}

function calculateAgeScore(age) {
  if (typeof age !== "number") return 0;
  if (age < 40) return 1;
  if (age >= 40 && age <= 65) return 1;
  if (age > 65) return 2;
  return 0;
}

// ----------------- PROCESS PATIENTS -----------------
function processPatients(patients) {
  const highRisk = [];
  const feverPatients = [];
  const dataIssuesSet = new Set();

  patients.forEach(p => {
    const bpScore = calculateBPScore(p.blood_pressure);
    const tempScore = calculateTempScore(p.temperature);
    const ageScore = calculateAgeScore(p.age);
    const totalScore = bpScore + tempScore + ageScore;

    if (totalScore >= 4) highRisk.push(p.patient_id);
    if (typeof p.temperature === "number" && p.temperature >= 99.6) feverPatients.push(p.patient_id);

    if (bpScore === 0 && (!p.blood_pressure || !p.blood_pressure.includes("/"))) dataIssuesSet.add(p.patient_id);
    if (tempScore === 0 && typeof p.temperature !== "number") dataIssuesSet.add(p.patient_id);
    if (ageScore === 0 && typeof p.age !== "number") dataIssuesSet.add(p.patient_id);
  });

  return {
    high_risk_patients: highRisk,
    fever_patients: feverPatients,
    data_quality_issues: Array.from(dataIssuesSet)
  };
}

// ----------------- SUBMIT RESULTS -----------------
async function submitResults(results) {
  const res = await fetch(\`\${BASE_URL}/submit-assessment\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify(results)
  });

  const data = await res.json();
  console.log("Submission Response:", JSON.stringify(data, null, 2));
}

// ----------------- MAIN EXECUTION -----------------
(async () => {
  console.log("Fetching patients...");
  const patients = await fetchPatients();
  console.log(\`Fetched \${patients.length} patients.\`);

  const results = processPatients(patients);
  console.log("Prepared Results:", results);

  await submitResults(results);
})();
