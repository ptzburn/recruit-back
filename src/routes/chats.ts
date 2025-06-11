import { Router, Response, Request } from "express";
import chatService from "../services/chatService";
import { errorMiddleware } from "../middlewares/middlewares";
import { ChatRequestBody } from "../types";

const chatRouter = Router();

chatRouter.post(
  "/",
  async (req: Request<unknown, unknown, ChatRequestBody>, res: Response) => {
    const { message } = req.body;
    const response = await chatService.startNewChat(message);
    console.log(response);
    res.status(200).json(response);
  },
);

chatRouter.post(
  "/:threadId",
  async (
    req: Request<{ threadId: string }, unknown, ChatRequestBody>,
    res: Response,
  ) => {
    const { message } = req.body;
    const response = await chatService.continueChat(
      message,
      req.params.threadId,
    );
    res.status(200).json(response);
  },
);

chatRouter.get("/", async (_req: Request, res: Response) => {
  const threads = await chatService.listChats();
  console.log("threads", threads);
  res.status(200).json(threads);
});

chatRouter.use(errorMiddleware);

export default chatRouter;
