import { GoogleGenerativeAI } from '@google/generative-ai';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { readFile, writeFile, listFiles, readFileSchema, writeFileSchema, listFilesSchema } from './tools/filesystem';
import { executeCommand, executeCommandSchema } from './tools/shell';

dotenv.config();

// Initialize the Google API client
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('Missing GOOGLE_API_KEY in .env file');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// System prompt that defines the agent's capabilities
const systemPrompt = `
You are a coding assistant that can help users write code, fix bugs, and understand programming concepts.
You have access to the following tools:

1. readFile - Read content from a file
2. writeFile - Write content to a file (requires user confirmation)
3. listFiles - List files in a directory
4. executeCommand - Execute shell commands (requires user confirmation)

For any file or command operations that modify the system, you should:
1. Explain what you're going to do
2. Ask for confirmation before proceeding
3. Execute the operation only after receiving confirmation

Think step by step when solving problems, and consider best practices for the programming language in use.
`;

// Tool definitions
const tools = [
  {
    name: 'readFile',
    description: 'Read content from a file',
    schema: readFileSchema,
    execute: readFile
  },
  {
    name: 'writeFile',
    description: 'Write content to a file (requires user confirmation)',
    schema: writeFileSchema,
    execute: async (args: any) => {
      console.log(`\nI want to write to file: ${args.path}`);
      console.log(`Content preview: ${args.content.slice(0, 100)}${args.content.length > 100 ? '...' : ''}`);
      
      return new Promise((resolve) => {
        rl.question('Do you want to proceed? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            const result = await writeFile(args);
            resolve(result);
          } else {
            resolve({ cancelled: true, message: 'File write operation cancelled by user' });
          }
        });
      });
    }
  },
  {
    name: 'listFiles',
    description: 'List files in a directory',
    schema: listFilesSchema,
    execute: listFiles
  },
  {
    name: 'executeCommand',
    description: 'Execute shell commands (requires user confirmation)',
    schema: executeCommandSchema,
    execute: async (args: any) => {
      console.log(`\nI want to execute command: ${args.command}`);
      
      return new Promise((resolve) => {
        rl.question('Do you want to proceed? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            const result = await executeCommand(args);
            resolve(result);
          } else {
            resolve({ cancelled: true, message: 'Command execution cancelled by user' });
          }
        });
      });
    }
  }
];

// Function to handle tool execution
async function executeTool(toolName: string, args: any) {
  const tool = tools.find(t => t.name === toolName);
  if (!tool) {
    return { error: `Tool ${toolName} not found` };
  }
  
  try {
    return await tool.execute(args);
  } catch (error) {
    return { error: `Failed to execute tool ${toolName}: ${(error as Error).message}` };
  }
}

// Main chat loop
async function startChat() {
  console.log('Coding Assistant initialized. Type "exit" to quit.');
  
  let chatHistory = [
    { role: 'system', parts: [{ text: systemPrompt }] }
  ];
  
  const askQuestion = () => {
    rl.question('\nYou: ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }
      
      // Add user message to chat history
      chatHistory.push({ role: 'user', parts: [{ text: userInput }] });
      
      try {
        // Send the conversation to the model
        const result = await model.generateContentStream({
          contents: chatHistory,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
          tools: tools.map(tool => ({
            functionDeclarations: [{
              name: tool.name,
              description: tool.description,
              parameters: tool.schema.shape,
            }]
          })),
        });
        
        let aiResponse = '';
        let toolCalls: any[] = [];
        
        // Process the response stream
        console.log('\nAssistant: ');
        for await (const chunk of result.stream) {
          const content = chunk.text();
          if (content) {
            process.stdout.write(content);
            aiResponse += content;
          }
          
          // Check for function calls
          const functionCalls = chunk.functionCalls();
          if (functionCalls.length > 0) {
            toolCalls = functionCalls;
          }
        }
        console.log('\n');
        
        // Add AI response to chat history
        chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
        
        // Handle tool calls
        if (toolCalls.length > 0) {
          console.log('\nExecuting tool calls...');
          
          for (const toolCall of toolCalls) {
            const toolName = toolCall.name;
            const args = JSON.parse(toolCall.args);
            
            console.log(`\nExecuting tool: ${toolName}`);
            const result = await executeTool(toolName, args);
            console.log('Tool result:', JSON.stringify(result, null, 2));
            
            // Add tool result to chat history
            chatHistory.push({ 
              role: 'tool', 
              parts: [{ text: JSON.stringify(result) }],
              toolMetadata: { toolName }
            });
          }
        }
        
        // Continue the conversation
        askQuestion();
      } catch (error) {
        console.error('Error:', error);
        askQuestion();
      }
    });
  };
  
  askQuestion();
}

// Start the chat
startChat();