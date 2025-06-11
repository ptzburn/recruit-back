import express, { Express } from "express";
import { PORT } from "../config/env";
import connectToDatabase from "./database/mongodb";
import chatRouter from "./routes/chats";

const app: Express = express();

app.use(express.json());
app.use("/api/chat", chatRouter);

app.get("/api", (_req, res) => {
  res.send("LangGraph Agent Server");
});

const startServer = async () => {
  await connectToDatabase();
  app.listen(PORT || 3000, () => {
    console.log(`Server started on port ${PORT || process.env.PORT}`);
  });
};

void startServer();
