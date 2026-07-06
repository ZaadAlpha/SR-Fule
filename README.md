# SR Fuel Invoice - GitHub Only Version

This version works with **GitHub Pages only** for hosting.
No Vercel, Cloudflare, server, or paid hosting is required.

## Important Security Note
GitHub Pages is static, so real secure backend authentication is not possible inside GitHub only.
This fast version uses simple client-side role PINs for Entry/Admin/Owner.
Do not store OpenAI API key in GitHub files.
OpenAI key is stored in Google Apps Script Properties.

## Default Login PINs
Change these in `app.js` before uploading.

- Entry: `1111`
- Admin: `2222`
- Owner: `3333`

## Features
- Entry/Admin/Owner role UI
- Improved dashboard
- Multiple invoice items: Diesel, Petrol, custom
- Photo upload
- ChatGPT OCR through Google Apps Script
- 2-page PDF: invoice + delivery note photo
- Auto upload to Google Drive through Apps Script
- Owner record to Google Sheet
- Local browser backup records
- CSV export

## GitHub Pages Setup
1. Create a new GitHub repo.
2. Upload these files:
   - index.html
   - styles.css
   - app.js
   - apps-script.gs only as reference, do not publish as website file if you prefer.
3. Go to GitHub repo Settings > Pages.
4. Source: Deploy from branch.
5. Branch: main / root.
6. Open your GitHub Pages URL.

## Google Apps Script Setup
1. Go to https://script.google.com
2. New Project.
3. Paste code from `apps-script.gs`.
4. Create a Google Drive folder for invoices.
5. Create a Google Sheet for records.
6. In Apps Script go to Project Settings > Script Properties.
7. Add:
   - OPENAI_API_KEY = your OpenAI API key
   - DRIVE_FOLDER_ID = your Google Drive folder ID
   - SHEET_ID = your Google Sheet ID
8. Deploy > New deployment > Web app.
9. Execute as: Me.
10. Who has access: Anyone with the link.
11. Copy Web App URL.
12. Login as Admin in the website > Settings > paste the Web App URL > Save.

## Google Sheet Columns
The script automatically appends rows with:
Uploaded Time, Invoice No, Date, Customer, DO No, Items JSON, Total, PDF Link, Photo Link

## OpenAI Cost Control
The app calls ChatGPT only when user clicks **Extract with ChatGPT**.
Manual entry can be used without AI cost.

## Recommended Next Version
For stronger security later, move auth and APIs to Vercel/Supabase/Firebase.
