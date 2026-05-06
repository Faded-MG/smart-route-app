import express from "express";
import fs from "fs";
import path from "path";
import { CLIENT_RENEG_LIMIT } from "tls";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const distDir = path.join(__dirname, "frontend/dist");
const roadsPath = process.env.ROADS_DATA_PATH || path.join(__dirname, "../traffic-parser-bot/data/roads.json");

// Serve production build if it exists, otherwise fallback to public
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: "index.html" }));
  console.log("Serving production build from:", distDir);
} else {
  app.use(express.static(publicDir, { index: "index.html" }));
  console.log("Serving development files from:", publicDir);
}

app.get("/roads", (req, res) => {
  console.log("Looking for roads.json at:", roadsPath);
  console.log("File exists:", fs.existsSync(roadsPath));
  if (!fs.existsSync(roadsPath)) {
    res.status(404).json({ error: "roads.json not found" });
    return;
  }
  const data = fs.readFileSync(roadsPath, "utf-8");
  res.json(JSON.parse(data));
});

app.listen(3000, () => {
   console.log(`Map + static app: http://localhost:3000/`);
  console.log(`Roads API: http://localhost:3000/roads`);
  console.log(`3000 is the port number specified in the .env file or 3001 by default`);
});