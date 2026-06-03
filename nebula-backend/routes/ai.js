import { Router } from 'express';
import OpenAI from 'openai';
import { verifyToken } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import db from '../db/database.js';
import { generateTaskHTML } from '../templates/task-template.js';

const router = Router();

// ─── Initialize NVIDIA-hosted OpenAI client ───
const client = new OpenAI({
    baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// ─── Available Models ───
const MODELS = [
    {
        id: 'openai/gpt-oss-120b',
        name: 'GPT-OSS 120B',
        provider: 'NVIDIA',
        description: 'Open-source GPT model with 120B parameters, hosted on NVIDIA',
        maxTokens: 4096,
        default: true,
    },
];

// ─── GET /api/models — List available models ───
router.get('/models', (req, res) => {
    res.json({ models: MODELS });
});

// ─── POST /api/chat — Streaming chat completion ───
router.post('/chat', async (req, res) => {
    try {
        const { messages, model, temperature, maxTokens } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const selectedModel = model || process.env.DEFAULT_MODEL || 'openai/gpt-oss-120b';

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const stream = await client.chat.completions.create({
            model: selectedModel,
            messages: messages,
            temperature: temperature ?? 0.7,
            top_p: 1,
            max_tokens: maxTokens || 4096,
            stream: true,
        });

        for await (const chunk of stream) {
            if (!chunk.choices || chunk.choices.length === 0) {
                continue;
            }

            const delta = chunk.choices[0].delta;

            // NOTE: Reasoning/thinking display is disabled for now.
            // Uncomment below when using a model that supports proper chain-of-thought.
            // if (delta.reasoning_content) {
            //     res.write(`data: ${JSON.stringify({ type: 'reasoning', content: delta.reasoning_content })}\n\n`);
            // }

            // Handle regular content
            if (delta.content) {
                res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
            }

            // Handle finish
            if (chunk.choices[0].finish_reason) {
                res.write(`data: ${JSON.stringify({ type: 'done', reason: chunk.choices[0].finish_reason })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err) {
        console.error('Chat API error:', err);

        // If headers haven't been sent yet, send JSON error
        if (!res.headersSent) {
            return res.status(500).json({
                error: 'Failed to get response from AI model',
                details: err.message,
            });
        }

        // If already streaming, send error event
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    }
});

// ─── POST /api/chat/sync — Non-streaming (for simple requests) ───
router.post('/chat/sync', async (req, res) => {
    try {
        const { messages, model, temperature, maxTokens } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const selectedModel = model || process.env.DEFAULT_MODEL || 'openai/gpt-oss-120b';

        const completion = await client.chat.completions.create({
            model: selectedModel,
            messages: messages,
            temperature: temperature ?? 0.7,
            top_p: 1,
            max_tokens: maxTokens || 4096,
            stream: false,
        });

        res.json({
            content: completion.choices[0]?.message?.content || '',
            model: selectedModel,
            usage: completion.usage,
            finishReason: completion.choices[0]?.finish_reason,
        });

    } catch (err) {
        console.error('Chat sync error:', err);
        res.status(500).json({
            error: 'Failed to get response from AI model',
            details: err.message,
        });
    }
});

// ─── Tool Definitions for Agent ───
const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file at the given path. Use this to understand existing code before making changes.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the file to read' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_implementation_plan',
            description: 'Generate a rich, interactive implementation plan UI artifact (.nebula) to explain technical architecture and proposed file changes to the user.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'The overall title of the implementation plan.' },
                    summary: { type: 'string', description: 'A short 1-2 sentence description of the problem and the proposed solution.' },
                    changes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                component: { type: 'string', description: 'The logical group or folder name.' },
                                files: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            type: { type: 'string', enum: ['[NEW]', '[MODIFY]', '[DELETE]'] },
                                            path: { type: 'string', description: 'The absolute file path.' },
                                            description: { type: 'string', description: 'A bullet point explaining what changes.' }
                                        },
                                        required: ['type', 'path', 'description']
                                    }
                                }
                            },
                            required: ['component', 'files']
                        }
                    },
                    verification: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'A list of steps explaining how this implementation will be tested and verified.'
                    }
                },
                required: ['title', 'summary', 'changes', 'verification']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create a new file or overwrite an existing file with the given content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to write the file to' },
                    content: { type: 'string', description: 'The full content to write to the file' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'edit_file',
            description: 'Edit a file by replacing a specific string with new content. Use read_file first to see the current content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the file' },
                    old_text: { type: 'string', description: 'The exact text to find and replace (must match exactly)' },
                    new_text: { type: 'string', description: 'The new text to replace it with' }
                },
                required: ['path', 'old_text', 'new_text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Run a shell command and return its output. Use for running tests, installing packages, git operations, etc.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The shell command to execute' },
                    cwd: { type: 'string', description: 'Working directory (optional, defaults to home)' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_files',
            description: 'Search for files by name pattern in a directory. Returns matching file paths.',
            parameters: {
                type: 'object',
                properties: {
                    directory: { type: 'string', description: 'Directory to search in' },
                    pattern: { type: 'string', description: 'File name pattern (glob), e.g. "*.ts" or "server*"' }
                },
                required: ['directory', 'pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'grep_search',
            description: 'Search for text patterns inside files. Returns matching lines with file paths and line numbers.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Text or regex pattern to search for' },
                    path: { type: 'string', description: 'File or directory to search in' }
                },
                required: ['query', 'path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List files and subdirectories in a given directory.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the directory to list' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_task_plan',
            description: 'Create a rich UI interactive task plan. Use this instead of writing a _tasks.md file. Provide the title and array of phases.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Overall title for the task plan' },
                    phases: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Phase name' },
                                tasks: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            text: { type: 'string', description: 'Task description' },
                                            done: { type: 'boolean', description: 'Task completion status' }
                                        },
                                        required: ['text', 'done']
                                    }
                                }
                            },
                            required: ['name', 'tasks']
                        }
                    }
                },
                required: ['title', 'phases']
            }
        }
    }
];

// ─── Tool Execution ───
async function executeTool(name, args, options = {}) {
    try {
        switch (name) {
            case 'read_file': {
                if (!fs.existsSync(args.path)) return `Error: File not found: ${args.path}`;
                const content = fs.readFileSync(args.path, 'utf8');
                const lines = content.split('\n');
                if (lines.length > 500) {
                    return `File: ${args.path} (${lines.length} lines, showing first 500)\n\n${lines.slice(0, 500).join('\n')}\n\n... (truncated, ${lines.length - 500} more lines)`;
                }
                return `File: ${args.path} (${lines.length} lines)\n\n${content}`;
            }

            case 'write_file': {
                const dir = path.dirname(args.path);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(args.path, args.content, 'utf8');
                return `Successfully wrote ${args.content.split('\n').length} lines to ${args.path}`;
            }

            case 'edit_file': {
                if (!fs.existsSync(args.path)) return `Error: File not found: ${args.path}`;
                const fileContent = fs.readFileSync(args.path, 'utf8');
                if (!fileContent.includes(args.old_text)) {
                    return `Error: Could not find the specified text in ${args.path}. Make sure old_text matches exactly.`;
                }
                const newContent = fileContent.replace(args.old_text, args.new_text);
                fs.writeFileSync(args.path, newContent, 'utf8');
                return `Successfully edited ${args.path}`;
            }

            case 'run_command': {
                const output = execSync(args.command, {
                    cwd: args.cwd || process.env.HOME,
                    timeout: 30000,
                    encoding: 'utf8',
                    maxBuffer: 1024 * 1024,
                });
                const trimmed = output.length > 5000 ? output.slice(0, 5000) + '\n... (output truncated)' : output;
                return `Command: ${args.command}\n\n${trimmed}`;
            }

            case 'search_files': {
                const output = execSync(
                    `find "${args.directory}" -name "${args.pattern}" -type f 2>/dev/null | head -30`,
                    { encoding: 'utf8', timeout: 10000 }
                );
                return output.trim() || 'No files found matching pattern.';
            }

            case 'grep_search': {
                try {
                    const output = execSync(
                        `grep -rn --include="*" "${args.query}" "${args.path}" 2>/dev/null | head -30`,
                        { encoding: 'utf8', timeout: 10000 }
                    );
                    return output.trim() || 'No matches found.';
                } catch { return 'No matches found.'; }
            }

            case 'list_directory': {
                if (!fs.existsSync(args.path)) return `Error: Directory not found: ${args.path}`;
                const items = fs.readdirSync(args.path, { withFileTypes: true });
                return items.map(item => {
                    const icon = item.isDirectory() ? '📁' : '📄';
                    return `${icon} ${item.name}`;
                }).join('\n');
            }

            case 'create_task_plan': {
                if (!options.conversationId) return 'Error: Executing outside of conversation scope.';
                const artifactsDir = path.join(process.env.HOME, '.superluminal', 'artifacts', options.conversationId);
                if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
                const filePath = path.join(artifactsDir, 'task.nebula');
                const htmlContent = generateTaskHTML(args);
                fs.writeFileSync(filePath, htmlContent, 'utf8');
                return `Successfully created ${filePath}`;
            }

            case 'create_implementation_plan': {
                if (!options.conversationId) return 'Error: Executing outside of conversation scope.';
                const artifactsDir = path.join(process.env.HOME, '.superluminal', 'artifacts', options.conversationId);
                if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
                const filePath = path.join(artifactsDir, 'implementation_plan.nebula');
                const { generateImplementationHTML } = await import('../templates/implementation-template.js');
                const htmlContent = generateImplementationHTML(args);
                fs.writeFileSync(filePath, htmlContent, 'utf8');
                return `Successfully created ${filePath}`;
            }

            default:
                return `Unknown tool: ${name}`;
        }
    } catch (err) {
        return `Error executing ${name}: ${err.message}`;
    }
}

// ─── Conversation Helper Functions ───
function getOrCreateConversation(conversationId, workspacePath) {
    if (conversationId) {
        const existing = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
        if (existing) return existing;
    }
    // Create new conversation
    const id = conversationId || crypto.randomUUID();
    db.prepare('INSERT INTO conversations (id, workspace_path) VALUES (?, ?)').run(id, workspacePath || '');
    return { id, workspace_path: workspacePath || '', title: 'New Chat' };
}

function loadConversationHistory(conversationId) {
    const rows = db.prepare(
        'SELECT role, content, tool_calls, tool_call_id FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId);

    return rows.map(row => {
        const msg = { role: row.role, content: row.content || '' };
        if (row.tool_calls) {
            try { msg.tool_calls = JSON.parse(row.tool_calls); } catch { }
        }
        if (row.tool_call_id) {
            msg.tool_call_id = row.tool_call_id;
        }
        // tool role messages need content, not empty string
        if (row.role === 'tool' && !row.content) msg.content = '';
        return msg;
    });
}

function saveMessage(conversationId, role, content, toolCalls, toolCallId) {
    db.prepare(
        'INSERT INTO chat_messages (conversation_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)'
    ).run(
        conversationId,
        role,
        content || null,
        toolCalls ? JSON.stringify(toolCalls) : null,
        toolCallId || null
    );
    // Update conversation timestamp
    db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId);
}

function updateConversationTitle(conversationId, firstMessage) {
    const title = (firstMessage || 'New Chat').slice(0, 100);
    db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversationId);
}

// ─── GET /api/artifacts/:conversationId/:filename — Serve Nebula artifacts ───
router.get('/artifacts/:conversationId/:filename', (req, res) => {
    const { conversationId, filename } = req.params;
    const artifactsBase = path.join(process.env.HOME, '.superluminal', 'artifacts');
    // Basic path traversal prevention
    const filePath = path.normalize(path.join(artifactsBase, conversationId, filename));
    if (!filePath.startsWith(artifactsBase) || !fs.existsSync(filePath)) {
        return res.status(404).send('Artifact not found');
    }
    
    // Serve as HTML so Simple Browser renders it
    res.setHeader('Content-Type', 'text/html');
    res.send(fs.readFileSync(filePath, 'utf8'));
});

// ─── GET /api/conversations — List conversations ───
router.get('/conversations', (req, res) => {
    const { workspace } = req.query;
    let rows;
    if (workspace) {
        rows = db.prepare('SELECT * FROM conversations WHERE workspace_path = ? ORDER BY updated_at DESC').all(workspace);
    } else {
        rows = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
    }
    res.json({ conversations: rows });
});

// ─── GET /api/conversations/:id/messages — Get messages for a conversation ───
router.get('/conversations/:id/messages', (req, res) => {
    const { id } = req.params;
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const messages = db.prepare(
        'SELECT role, content, tool_calls, tool_call_id, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(id);
    res.json({ conversation, messages });
});

// ─── DELETE /api/conversations/:id — Delete a conversation ───
router.delete('/conversations/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    res.json({ success: true });
});

// ─── POST /api/chat/agent — Agentic chat with tool calling ───
router.post('/chat/agent', async (req, res) => {
    try {
        const { messages, model, temperature, maxTokens, workspacePath, conversationId: reqConversationId } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const selectedModel = model || process.env.DEFAULT_MODEL || 'openai/gpt-oss-120b';

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        console.log('[Superluminal Agent] received workspacePath:', workspacePath);

        // ─── Conversation persistence ───
        const conversation = getOrCreateConversation(reqConversationId, workspacePath);
        const conversationId = conversation.id;

        // Send conversationId to IDE so it can track it
        res.write(`data: ${JSON.stringify({ type: 'conversation_id', conversationId })}\n\n`);

        // Build conversation with system prompt
        const systemPrompt = `You are Superluminal Agent, an intelligent agentic coding assistant built into the Superluminal IDE.

You have access to these tools to help users with coding tasks:
- read_file: Read the contents of files
- write_file: Create or overwrite files
- edit_file: Edit specific parts of files (search and replace)
- run_command: Execute shell commands
- search_files: Find files by name pattern
- grep_search: Search for text patterns inside files
- list_directory: List contents of a directory
- create_task_plan: Create rich interactive UI task plans for the user. REQUIRED for any tasks requiring multiple steps.
- create_implementation_plan: Create rich interactive implementation design docs. REQUIRED during the planning phase.

${workspacePath ? `WORKSPACE: The user's project is located at: ${workspacePath}
Always use this as the base path for ALL file operations. Use absolute paths like "${workspacePath}/filename".` : `NO WORKSPACE DETECTED. Ask the user for their project folder path before doing any file operations.`}

═══════════════════════════════════════════
  YOUR WORKFLOW — FOLLOW THIS EXACTLY
═══════════════════════════════════════════

You MUST work in 3 phases for any task that involves planning or multiple steps:

━━━ PHASE 1: PLANNING ━━━
1. Analyze the user's request carefully. Use read_file or list_directory to understand their codebase first.
2. Automatically call the "create_implementation_plan" tool to generate a beautiful UI design doc explaining EXACTLY what files you will create, modify, and delete to solve their problem. You must do this so the user can see your technical approach before you write code.
3. Automatically call the "create_task_plan" tool to generate a beautiful task list. Provide a clean array of phases and tasks.
   DO NOT create flat markdown files using write_file. ALWAYS use the create_*_plan tools for these artifacts.
4. Once the tools succeed, summarize your plan to the user in the chat, then immediately move to Execution.

━━━ PHASE 2: EXECUTION ━━━
For each task in your plan, follow this cycle:
1. Try executing the actual work (writing/editing code, running terminal commands, etc).
2. As you make progress, optionally call "create_task_plan" AGAIN with the updated \`done\` booleans set to true to reflect your new progress. This updates the artifact live for the user.
3. Move on to the next task in your plan until everything is done.

IMPORTANT: 
- NEVER redo a task that is already marked done: true
- If all tasks are done: true, move to Verification

━━━ PHASE 3: VERIFICATION ━━━
1. Confirm all tasks are done.
2. Call create_task_plan one last time to ensure everything is checked as complete.
3. Run or test the code if applicable (e.g., run_command to check for errors).
4. Give the user a final summary of everything you built.

═══════════════════════════════════════════
  RULES
═══════════════════════════════════════════
1. Always use ABSOLUTE paths for all file operations
2. Read existing files BEFORE modifying them
3. Use edit_file for small changes, write_file for new files
4. If the user asks a simple question (no files needed), just answer directly — skip the phases
5. Keep task descriptions clear and specific in _tasks.md
6. NEVER repeat work that is already marked [x] in _tasks.md`;

        // Load previous conversation history from DB
        const historyMessages = loadConversationHistory(conversationId);

        // Save the new user message(s) to DB
        const lastUserMsg = messages[messages.length - 1];
        if (lastUserMsg && lastUserMsg.role === 'user') {
            saveMessage(conversationId, 'user', lastUserMsg.content);
            // Update title from first message if it's a new conversation
            if (historyMessages.length === 0) {
                updateConversationTitle(conversationId, lastUserMsg.content);
            }
        }

        // Build full conversation: system prompt + history + new messages
        let conversationMessages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            ...messages
        ];

        while (true) {
            // Call AI with tools (non-streaming for tool calls)
            let response;
            try {
                response = await client.chat.completions.create({
                    model: selectedModel,
                    messages: conversationMessages,
                    tools: AGENT_TOOLS,
                    tool_choice: 'auto',
                    temperature: temperature ?? 0.3,
                    max_tokens: maxTokens || 4096,
                    stream: false,
                });
            } catch (apiErr) {
                // If tools aren't supported, fall back to streaming without tools
                console.log('Tool calling not supported, falling back to basic chat:', apiErr.message);
                res.write(`data: ${JSON.stringify({ type: 'status', content: '⚠️ Tool calling not supported by this model. Using basic chat mode.' })}\n\n`);

                const fallbackStream = await client.chat.completions.create({
                    model: selectedModel,
                    messages: conversationMessages,
                    temperature: temperature ?? 0.7,
                    max_tokens: maxTokens || 4096,
                    stream: true,
                });

                for await (const chunk of fallbackStream) {
                    if (chunk.choices?.[0]?.delta?.content) {
                        res.write(`data: ${JSON.stringify({ type: 'content', content: chunk.choices[0].delta.content })}\n\n`);
                    }
                }
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }

            const choice = response.choices[0];
            const message = choice.message;

            // If AI wants to call tools
            if (message.tool_calls && message.tool_calls.length > 0) {
                // Add AI's message to conversation
                conversationMessages.push(message);

                // Execute each tool call
                for (const toolCall of message.tool_calls) {
                    let args;
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch {
                        args = {};
                    }

                    // Build clean, Antigravity-style tool display messages
                    const toolName = toolCall.function.name;
                    const fileName = (args.path || '').split('/').pop() || '';
                    const dirName = (args.path || args.directory || '').split('/').pop() || '';

                    // Clean tool_start message
                    let startMsg = '';
                    switch (toolName) {
                        case 'write_file':
                            const lineCount = (args.content || '').split('\n').length;
                            startMsg = `✏️ Creating \`${fileName}\` (${lineCount} lines)`;
                            break;
                        case 'edit_file':
                            startMsg = `🔧 Editing \`${fileName}\``;
                            break;
                        case 'read_file':
                            startMsg = `📄 Reading \`${fileName}\``;
                            break;
                        case 'run_command':
                            const cmd = (args.command || '').length > 60 ? (args.command || '').slice(0, 60) + '...' : (args.command || '');
                            startMsg = `💻 Running \`${cmd}\``;
                            break;
                        case 'search_files':
                            startMsg = `🔍 Searching for \`${args.pattern || '*'}\``;
                            break;
                        case 'grep_search':
                            startMsg = `🔎 Searching for "${args.query || ''}"`;
                            break;
                        case 'list_directory':
                            startMsg = `📂 Listing \`${dirName || '.'}\``;
                            break;
                        default:
                            startMsg = `🔧 ${toolName}`;
                    }

                    res.write(`data: ${JSON.stringify({
                        type: 'tool_start',
                        tool: toolName,
                        content: startMsg
                    })}\n\n`);

                    // Execute the tool
                    let result = '';
                    try {
                        result = await executeTool(toolName, args, { conversationId });
                    } catch (toolErr) {
                        result = `Error: Tool execution failed - ${toolErr.message}`;
                        res.write(`data: ${JSON.stringify({ type: 'error', error: `Tool Failure (${toolName}): ${toolErr.message}` })}\n\n`);
                    }

                    // Build clean tool_result message
                    let resultMsg = '';
                    switch (toolName) {
                        case 'create_task_plan': {
                            if (!result.startsWith('Error')) {
                                res.write(`data: ${JSON.stringify({ 
                                    type: 'artifact_created', 
                                    filename: 'task.nebula',
                                    title: args.title || 'Task Plan',
                                    url: `http://localhost:3500/api/artifacts/${conversationId}/task.nebula`
                                })}\n\n`);
                                resultMsg = `  ✅ Generated Task Plan artifact`;
                            } else {
                                resultMsg = `  ❌ ${result}`;
                            }
                            break;
                        }
                        case 'write_file': {
                            const wrote = (args.content || '').split('\n').length;
                            resultMsg = `  ✅ Created \`${fileName}\` — ${wrote} lines`;
                            break;
                        }
                        case 'edit_file':
                            resultMsg = result.startsWith('Error') ? `  ❌ ${result}` : `  ✅ Edited \`${fileName}\``;
                            break;
                        case 'read_file':
                            resultMsg = result.startsWith('Error') ? `  ❌ ${result}` : `  ✅ Read \`${fileName}\` (${result.split('\n').length} lines)`;
                            break;
                        case 'run_command': {
                            const output = result.length > 150 ? result.slice(0, 150) + '...' : result;
                            resultMsg = `  → \`${output.replace(/\n/g, ' ').trim()}\``;
                            break;
                        }
                        case 'list_directory': {
                            const items = result.split('\n').filter(l => l.trim());
                            resultMsg = `  → ${items.length} items`;
                            break;
                        }
                        case 'search_files':
                        case 'grep_search': {
                            const matches = result.split('\n').filter(l => l.trim());
                            resultMsg = result === 'No matches found.' ? '  → No matches' : `  → ${matches.length} results`;
                            break;
                        }
                        default:
                            resultMsg = result.length > 100 ? `  → ${result.slice(0, 100)}...` : `  → ${result}`;
                    }

                    res.write(`data: ${JSON.stringify({
                        type: 'tool_result',
                        tool: toolName,
                        content: resultMsg
                    })}\n\n`);

                    // Add tool result to conversation
                    conversationMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: result,
                    });
                }

                // Continue loop — AI will see tool results and decide next action
                continue;
            }

            // No tool calls — AI is done, stream the final response
            if (message.content) {
                // Save assistant's final response to DB
                saveMessage(conversationId, 'assistant', message.content);

                // Split content and stream word by word for typing effect
                const words = message.content.split(/(\s+)/);
                for (const word of words) {
                    if (word) {
                        res.write(`data: ${JSON.stringify({ type: 'content', content: word })}\n\n`);
                    }
                }
            }

            break; // Exit loop
        }

        res.write(`data: ${JSON.stringify({ type: 'done', reason: 'stop' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err) {
        console.error('Agent API error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Agent error', details: err.message });
        }
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    }
});

export default router;
