import { OpenAIEmbeddings } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { getClient } from "./database/mongodb";
import { z } from "zod";

export const callAgent = async (query: string, thread_id: string) => {
  // Define the MongoDB database and collection
  const client = getClient();
  const dbName = "hr_database";
  const db = client.db(dbName);
  const collection = db.collection("employees");

  const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
    }),
  });

  const employeeLookupTool = tool(
    async ({ query, n = 10 }) => {
      console.log("Employee lookup tool called");

      const dbConfig = {
        collection: collection,
        indexName: "vector_index",
        textKey: "embedding_text",
        embeddingKey: "embedding",
      };

      const vectorStore = new MongoDBAtlasVectorSearch(
        new OpenAIEmbeddings(),
        dbConfig,
      );

      const result = await vectorStore.similaritySearchWithScore(query, n);
      return JSON.stringify(result);
    },
    {
      name: "employee_lookup",
      description: "Gathers employee details from the HR database",
      schema: z.object({
        query: z.string().describe("The search query"),
        n: z
          .number()
          .optional()
          .default(10)
          .describe("Number of results to return"),
      }),
    },
  );

  const tools = [employeeLookupTool];

  // We can extract the state typing via `GraphState.State`
  const toolNode = new ToolNode<typeof GraphState.State>(tools);

  const model = new ChatAnthropic({
    model: "claude-3-5-sonnet-20240620",
    temperature: 0,
  }).bindTools(tools);

  const callModel = async (state: typeof GraphState.State) => {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an AI HR Assistant representing Recruit Agency Oy, a professional recruitment agency specializing in connecting top talent with leading companies. Your role is to engage with a representative from a real company seeking to hire additional staff. Communicate professionally, empathetically, and efficiently to understand their hiring needs and propose tailored recruitment solutions. Follow these guidelines:
1. **Introduction**: Greet the representative warmly, introduce yourself as part of Recruit Agency Oy, and express enthusiasm for assisting their company with their staffing needs.
2. **Understand Needs**: Ask targeted questions to gather details about their hiring requirements, such as the number of positions, job roles, required skills, experience levels, and any specific challenges they face in recruitment.
3. **Propose Solutions**: Offer specific candidates from our list, recruitment services (e.g., candidate sourcing, interviews, assessments) and explain how they address the company’s needs. Be concise and focus on benefits.
4. **Next Steps**: Suggest a clear action plan, such as scheduling a detailed consultation, providing a tailored proposal, or sharing candidate profiles.
5. **Tone**: Maintain a professional, collaborative, and solution-oriented tone. Be concise, avoid jargon, and show genuine interest in their success.
6. **Handle Objections**: If the representative raises concerns (e.g., cost, timelines), address them confidently with data-driven reassurances or flexible options.
Example Interaction:
- Start: "Hello [Representative Name], I'm delighted to connect with you on behalf of Recruit Agency Oy. We're excited to help [Company Name] find the perfect candidates to support your growth. Could you share more about the roles you're looking to fill and any specific requirements?"
- Questions: "What skills or experience are most critical for these positions? Are there any challenges you've faced in hiring for these roles?"
- Solution: "Based on your needs, we can source candidates with [specific skills] and conduct thorough screenings to ensure a perfect fit. Our process typically delivers qualified candidates within [timeline]."
- Close: "I’d love to schedule a call to discuss a customized recruitment plan for [Company Name]. What time works best for you?"
Adapt your responses based on the representative’s input, ensuring alignment with their goals and our recruitment capabilities. You have access to the following tools: {tool_names}.\n{system_message}\nCurrent time: {time}.`,
      ],
      new MessagesPlaceholder("messages"),
    ]);

    const formattedPrompt = await prompt.formatMessages({
      system_message: "You are helpful HR Chatbot Agent.",
      time: new Date().toISOString(),
      tool_names: tools.map((tool) => tool.name).join(", "),
      messages: state.messages,
    });

    const result = await model.invoke(formattedPrompt);

    return { messages: [result] };
  };

  const shouldContinue = (state: typeof GraphState.State) => {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    // If the LLM makes a tool call, then we route to the "tools" node
    if (lastMessage.tool_calls?.length) {
      return "tools";
    }
    // Otherwise, we stop (reply to the user)
    return "__end__";
  };

  const workflow = new StateGraph(GraphState)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  const checkpointer = new MongoDBSaver({
    client,
    dbName,
  });

  const app = workflow.compile({ checkpointer });

  const finalState = await app.invoke(
    {
      messages: [new HumanMessage(query)],
    },
    { recursionLimit: 15, configurable: { thread_id: thread_id } },
  );

  console.log(finalState.messages[finalState.messages.length - 1].content);

  return finalState.messages[finalState.messages.length - 1].content;
};
