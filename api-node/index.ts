import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { safeParse } from "valibot";
import { RequestSchema } from "./schemas.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    const secretKey = process.env.SECRET_KEY;
    console.log("SECRET_KEY:", process.env.SECRET_KEY ? process.env.SECRET_KEY : "Missing ❌");
    console.log("DATA_SECRET:", data.secret ? data.secret : "Missing ❌");

    // If the server-side secret isn't configured, return a helpful error so it's obvious
    if (!secretKey) {
      return res.status(500).json({ error: "Server secret not configured (process.env.SECRET_KEY is missing)" });
    }

    if (data.secret != secretKey) {
      return res.status(401).json({ error: "Invalid secret key" });
    }

    data.evaluationurl = String(data.evaluationurl);

    res.status(200).json({
      response: "Request received and parsed successfully",
      data_received: data
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;
