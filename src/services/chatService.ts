import { callAgent } from "../agent";
import { getDb } from "../database/mongodb";

const startNewChat = async (initialMessage: string) => {
  const threadId = Date.now().toString();
  const response = await callAgent(initialMessage, threadId);
  return { threadId, response };
};

const continueChat = async (message: string, threadId: string) => {
  const response = await callAgent(message, threadId);
  return { threadId, response };
};

const listChats = async () => {
  try {
    const db = getDb(); // Use existing db instance
    const collection = db.collection("checkpoints");

    // Use distinct for efficiency
    const threads = await collection
      .distinct("thread_id", {})
      .then((threadIds) => threadIds.map((threadId) => ({ threadId })));

    return threads;
  } catch (error) {
    console.error("Error listing chats:", error);
    throw error;
  }
};

export default {
  startNewChat,
  continueChat,
  listChats,
};
