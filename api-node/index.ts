import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { safeParse } from "valibot";
import { RequestSchema } from "./schemas.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const SECRET_KEY = process.env.SECRET_KEY?.trim();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "API is working" });
});

app.post("/make", async (req: Request, res: Response) => {
  try {
    const parsed = safeParse(RequestSchema, req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.issues
      });
    }

    const data = parsed.output;

    if (!SECRET_KEY) {
      return res.status(500).json({ error: "Server secret not configured (process.env.SECRET_KEY is missing)" });
    }

    // Normalize and strictly compare secrets to avoid type-coercion surprises
    const providedSecret = String(data.secret ?? "").trim();
    if (providedSecret !== SECRET_KEY) {
      return res.status(401).json({ error: "Invalid secret key" });
    }

    res.status(200).json({
      response: "Request received and parsed successfully",
      data_received: data
    });
  } catch (err) {
    const e = err as Error;
    return res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : e.message });
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: unknown) => {
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : (err as Error).message;
  res.status(500).json({ error: message });
});

if (process.env.NODE_ENV !== "production") {
  const PORT = Number(process.env.PORT) || 3000;
  console.log("SECRET_KEY configured:", Boolean(SECRET_KEY));
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
