# Local Preview Guide for BGC-Sports

To run the website locally and test the Toffee stream integration, follow these steps. You will need two terminal windows open.

## Prerequisites
- **Node.js** (v18 or higher)
- **npm** or **pnpm**

---

## Step 1: Start the Backend
The backend is responsible for fetching Toffee data and proxying the video streams.

1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
   *The backend will run at `http://localhost:4000`.*

---

## Step 2: Start the Frontend
The frontend is the user interface where you can watch the streams.

1. Open a **second terminal** window and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend will typically run at `http://localhost:5173` (or `5174`).*

---

## Step 3: Preview and Test
1. Open your browser and go to the frontend URL (e.g., `http://localhost:5173`).
2. Scroll down to the **Toffee** section.
3. Click on any channel (e.g., "Zee Bangla" or "TOFFEE Sports").
4. The video should start playing. 

### How to verify the Proxy is working:
1. Right-click on the page and select **Inspect**.
2. Go to the **Network** tab.
3. Look for requests that start with `/api/toffee-proxy/`.
4. If you see these requests, it means the video is successfully being proxied through your backend to bypass security restrictions.

---

## Troubleshooting

### "Stream Unavailable" Error
- Make sure the backend is running.
- Check the backend terminal for logs. If you see `ENOTFOUND`, it might be a temporary DNS issue with the Toffee CDN.
- Ensure your internet connection is active.

### Port Conflicts
- If port `4000` is already in use, you can change it in `backend/src/config/index.js` or by setting a `PORT` environment variable.
- If you change the backend port, the frontend will try to detect it automatically, but you may need to update `VITE_BACKEND_URL` in a `.env` file in the frontend folder.
