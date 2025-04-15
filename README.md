# My Coding Agent

A coding assistant AI agent built with Google's Gemini Pro.

## Features

- Interactive CLI chat interface
- File operations (read, write, list)
- Shell command execution
- User confirmation for system-modifying operations
- Built with TypeScript and Node.js

## Prerequisites

- Node.js (v16+)
- Google API key for Gemini Pro

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the example environment file and add your Google API key:
   ```
   cp .env.example .env
   ```
   Then add your Google API key to the `.env` file.

## Usage

Start the coding agent:

```
npx tsx src/index.ts
```

## Commands

- Type your programming questions or requests in natural language
- Type `exit` to quit the application

## Security

- The agent asks for confirmation before executing commands or writing files
- Never share your API keys in public repositories