# Task 5 — Medical Diagnosis and Reports

This package is designed for the `5D-Hospital_Managment_System` repository and the branch
`feature/medical-diagnosis-reports`.

## 1. Back up first
From the repository root, run:
```bat
copy backend\server.js backend\server.js.task5-backup
copy frontend\src\App.jsx frontend\src\App.jsx.task5-backup
```

## 2. Extract the package
Extract this ZIP into the repository root, so `apply-task5-patch.mjs` and the `task5-files` folder sit next to `backend` and `frontend`.

## 3. Install the upload dependency
```bat
cd backend
npm install multer
cd ..
```

## 4. Apply the changes
Run from the repository root:
```bat
node apply-task5-patch.mjs
```
The script adds protected Task 5 API routes to `backend/server.js`, replaces `frontend/src/App.jsx`,
and creates `frontend/src/DoctorDashboard.jsx` and `frontend/src/DoctorDashboard.css`.
It checks a marker before adding routes to avoid inserting them twice.

## 5. Configure a demo doctor login
Open `backend/.env` locally in your editor. Do NOT paste its contents into chat or commit it.
Keep the existing `JWT_SECRET` line. Add these lines, using your own local values:
```dotenv
DOCTOR_ID=DOC001
DOCTOR_EMAIL=doctor@example.com
DOCTOR_PASSWORD=choose-a-unique-local-demo-password
```
Use a password that is not used for any real account. This is a simple demo login for the assignment,
not production-grade identity management. The current demo setup configures one doctor account (DOC001).

## 6. Add private upload folder to .gitignore
Create or edit `.gitignore` at repository root and ensure it includes:
```gitignore
backend/.env
backend/node_modules/
backend/private-reports/
backend/server.js.task5-backup
frontend/node_modules/
frontend/dist/
```
Note: `.gitignore` does not remove files already tracked by Git. Your repository currently appears to track
`backend/.env` and `backend/node_modules`; those need a separate cleanup commit. If a real secret was pushed,
rotate it, because deleting the file in a later commit does not erase it from Git history.

## 7. Run and test
Terminal 1:
```bat
cd backend
npm run dev
```
Terminal 2:
```bat
cd frontend
npm run dev
```
Open the Vite URL. Use the normal patient login for patients. Use the new **Doctor login** link for the doctor
account configured above. A doctor can see appointments assigned to DOC001, enter a diagnosis and notes,
record required reports/scans, and optionally attach a PDF/JPG/PNG up to 5 MB.

## 8. Build checks
From the repository root:
```bat
cd frontend
npm run build
npm run lint
cd ..\backend
node --check server.js
```

## Important limitations
- Existing patients, appointments, diagnoses, and report metadata are stored in in-memory arrays. They disappear
  when the backend restarts. Uploaded files remain on disk but their metadata is lost after restart, so a database
  is required for a reliable version.
- Upload validation checks file MIME type and size; production systems should also inspect file signatures,
  scan uploads for malware, use a database, enforce audit logging, and use real per-doctor accounts.
- Do not use this demo for real patient/medical data.
