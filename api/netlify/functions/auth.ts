import serverless from "serverless-http";
import app from "../../src/app.js";

// Netlify needs "handler"
export const handler = serverless(app);
