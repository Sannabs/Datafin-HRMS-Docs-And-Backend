# Deploying the backend on Render (with Puppeteer/Chrome)

This backend uses Puppeteer to generate payslip PDFs. On Render, Chrome must be installed at build time and the start command must expose it. Follow these steps in the **Render dashboard** for your backend Web Service.

## 1. Root directory (if applicable)

If your repo root contains both `frontend` and `backend`, set **Root Directory** to `backend` so the build and start commands run from the backend folder.

## 2. Build command

Run the Chrome install script, then install dependencies (and run Prisma generate if you use it):

```bash
chmod +x render-build.sh && ./render-build.sh && npm install && npx prisma generate
```

If you don't use Prisma generate in the build, use:

```bash
chmod +x render-build.sh && ./render-build.sh && npm install
```

## 3. Start command

Prepend Chrome to `PATH`, then start the app:

```bash
export PATH="/opt/render/project/.render/chrome/opt/google/chrome:$PATH" && npm start
```

Or with Node directly:

```bash
export PATH="/opt/render/project/.render/chrome/opt/google/chrome:$PATH" && node ./bin/index.js
```

## 4. Environment variables (optional)

- **`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`** = `true`  
  Prevents Puppeteer from downloading its own Chromium; the app will use the Chrome installed by `render-build.sh`. Saves build time and disk.

- **`PUPPETEER_EXECUTABLE_PATH`** = `/opt/render/project/.render/chrome/opt/google/chrome/google-chrome`  
  Optional. The code already uses this path when `RENDER` is set; only add this if you use a different install path.

## 5. Deploy

Commit and push; Render will run the build command (installing Chrome and npm deps), then the start command. Payslip PDF generation and download should work after deploy.
