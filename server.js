import express from "express";
import { configureApp } from "./lib/app.js";

const PORT = Number(process.env.PORT) || 3000;

const app = configureApp(express());

// Vercel runs the exported app itself; everywhere else, listen on a port.
if (!process.env.VERCEL) {
  // Express 5 hands a failed bind to this callback rather than throwing.
  // Ignoring it printed "running" while an older server kept the port, which
  // is how a stale server ended up answering a new client.
  app.listen(PORT, (error) => {
    if (error) {
      console.error(`Could not start on port ${PORT}: ${error.message}`);
      process.exit(1);
    }
    console.log(`Breadcrumb running on http://localhost:${PORT}`);
  });
}

export default app;
