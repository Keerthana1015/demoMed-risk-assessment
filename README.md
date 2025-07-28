# demoMed-risk-assessment

## Overview
This project connects to the DemoMed Healthcare API to:
- Fetch patient data (with pagination and error handling)
- Calculate patient risk scores based on blood pressure, temperature, and age
- Identify high-risk patients, fever patients, and data quality issues
- Submit results back to the assessment API

## Features
- Handles API rate limiting and intermittent failures with retry logic
- Processes inconsistent or missing data gracefully
- Implements all scoring rules as per assessment requirements
- Outputs detailed submission response with scoring feedback

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/Keerthana1015/demoMed-risk-assessment.git
cd demoMed-risk-assessment
