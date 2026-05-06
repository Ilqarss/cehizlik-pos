import { createApp } from "./app";

const app = createApp();

if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`API running on port ${port}`);
  });
}

export default app;