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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

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
async function startChat(initialMessage?: string) {
  console.log('Coding Assistant initialized. Type "exit" to quit.');
  
  let chatHistory = [
    { role: 'system', parts: [{ text: systemPrompt }] }
  ];
  
  const processUserInput = async (userInput: string) => {
    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      return false;
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
        }
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
        const chunkFunctionCalls = chunk.functionCalls && chunk.functionCalls();
        if (chunkFunctionCalls && chunkFunctionCalls.length > 0) {
          toolCalls = chunkFunctionCalls;
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
            role: 'function', 
            parts: [{ text: JSON.stringify(result) }]
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error:', error);
      return true;
    }
  };
  
  // If initial message is provided, process it first
  if (initialMessage) {
    console.log(`\nYou: ${initialMessage}`);
    const shouldContinue = await processUserInput(initialMessage);
    if (!shouldContinue) return;
  }
  
  const askQuestion = () => {
    rl.question('\nYou: ', async (userInput) => {
      const shouldContinue = await processUserInput(userInput);
      if (shouldContinue) {
        askQuestion();
      }
    });
  };
  
  askQuestion();
}

// Parse command line arguments for initial message
const args = process.argv.slice(2);
const initialMessage = args.join(' ');

// Special command handling for direct file creation
if (initialMessage.startsWith('create ') && initialMessage.includes('.txt')) {
  const filename = initialMessage.replace('create ', '').trim();
  console.log(`Creating file: ${filename}`);
  
  // Auto-execute writeFile tool with empty content
  const writeArgs = {
    path: filename,
    content: ''
  };
  
  // Auto-confirm for this specific operation
  writeFile(writeArgs)
    .then(result => {
      console.log('File creation result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Error creating file:', error);
      process.exit(1);
    });
} else {
  // Start the chat with optional initial message
  startChat(initialMessage || undefined);
}