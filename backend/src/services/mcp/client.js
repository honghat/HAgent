import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { registerTool } from "../tools/registry.js";
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from "../../config.js";

const clients = new Map();

export async function loadMcpServers() {
  const mcpConfigPath = path.join(PROJECT_ROOT, '.mcp.json');
  if (!fs.existsSync(mcpConfigPath)) {
    console.log('[MCP] No .mcp.json found');
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    const mcpServers = config.mcpServers || {};

    for (const [name, serverConfig] of Object.entries(mcpServers)) {
      await connectToMcpServer(name, serverConfig);
    }
  } catch (err) {
    console.error('[MCP] Error loading .mcp.json:', err.message);
  }
}

export async function connectToMcpServer(name, config) {
  console.log(`[MCP] Connecting to server: ${name}...`);
  
  let transport;
  if (config.command) {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...(config.env || {}) }
    });
  } else if (config.url) {
    transport = new SSEClientTransport(new URL(config.url));
  } else {
    console.error(`[MCP] Invalid config for server ${name}: missing command or url`);
    return;
  }

  const client = new Client({
    name: "HAgent-MCP-Client",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  try {
    await client.connect(transport);
    clients.set(name, client);

    const { tools } = await client.listTools();
    console.log(`[MCP] Connected to ${name}. Found ${tools.length} tools.`);

    for (const tool of tools) {
      const toolName = `${name}__${tool.name}`;
      registerTool({
        name: toolName,
        description: `[MCP: ${name}] ${tool.description}`,
        parameters: tool.inputSchema,
        handler: async (args) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: args
          });
          return formatMcpResult(result);
        },
        label: `Đang chạy MCP tool ${tool.name}...`
      });
    }
  } catch (err) {
    console.error(`[MCP] Failed to connect to server ${name}:`, err.message);
  }
}

function formatMcpResult(result) {
  if (!result || !result.content) return "No result from MCP tool.";
  
  return result.content.map(c => {
    if (c.type === 'text') return c.text;
    if (c.type === 'image') return `[Image: ${c.data.slice(0, 50)}...]`;
    return JSON.stringify(c);
  }).join('\n');
}

export function getMcpClients() {
  return clients;
}
