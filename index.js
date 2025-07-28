import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://assessment.ksensetech.com/api";

// ----------------- FETCH PATIENT DATA -----------------
async function fetchPatients() {
  let patients = [];
  let page = 1;
  let hasNext = true;
  let retryCount = 0;
  const MAX_RETRIES = 5;

  while (hasNext) {
    try {
      const response = await fetch(`${BASE_URL}/patients?page=${page}&limit=10`, {
        headers: { "x-api-key": API_KEY }
      });

      if (response.status === 429) {
        console.warn("Rate limited, retrying in 2 seconds...");
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const data = await response.json();
      if (!data.data || !Array.isArray(data.data)) throw new Error("Invalid data structure");

      patients.push(...data.data);
      hasNext = data.pagination.hasNext;
      page++;
      retryCount = 0; // reset retry after success
    } catch (err) {
      retryCount++;
      console.error(`Error fetching page ${page}: ${err.message}, retrying... (${retryCount})`);
      if (retryCount >= MAX_RETRIES) {
        console.error("Max retries reached. Stopping fetch.");
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

// ----------------- PROCESS PATIENTS (IMPROVED) -----------------
function processPatients(patients) {
  const highRisk = [];
  const feverPatients = [];
  const dataIssues = [];

  patients.forEach(p => {
    const bpScore = calculateBPScore(p.blood_pressure);
    const tempScore = calculateTempScore(p.temperature);
    const ageScore = calculateAgeScore(p.age);

    // ✅ Fever detection
    if (typeof p.temperature === "number" && p.temperature >= 99.6) {
      feverPatients.push(p.patient_id);
    }

    // ✅ Improved high-risk logic
    if (bpScore >= 4 || (bpScore >= 3 && tempScore >= 1)) {
      highRisk.push(p.patient_id);
    }

    // ✅ Data quality checks
    const invalidBP = !p.blood_pressure || !/^\d{2,3}\/\d{2,3}$/.test(p.blood_pressure);
    const invalidAge = typeof p.age !== "number" || p.age < 0 || p.age > 120;
    const invalidTemp = typeof p.temperature !== "number" || p.temperature < 90 || p.temperature > 110;

    if (invalidBP || invalidAge || invalidTemp) {
      dataIssues.push(p.patient_id);
    }
  });

  return {
    high_risk_patients: highRisk,
    fever_patients: feverPatients,
    data_quality_issues: dataIssues
  };
}

// ----------------- SUBMIT RESULTS -----------------
async function submitResults(results) {
  const res = await fetch(`${BASE_URL}/submit-assessment`, {
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
  console.log(`Fetched ${patients.length} patients.`);

  const results = processPatients(patients);
  console.log("Prepared Results:", results);

  await submitResults(results);
})();
