/**
 * Simple MCP Server Test Script
 *
 * Tests the MCP server by sending initialize and list tools requests.
 */

import { spawn } from 'child_process';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: any;
}

async function testMCPServer() {
  console.log('Starting MCP server test...\n');

  // Start the MCP server process
  const serverProcess = spawn('node', ['dist/mcpServer.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let responseBuffer = '';
  let requestId = 1;

  // Handle server output
  serverProcess.stdout.on('data', (data) => {
    responseBuffer += data.toString();

    // Try to parse complete JSON-RPC messages
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response: MCPResponse = JSON.parse(line);
          console.log('✓ Received response:', JSON.stringify(response, null, 2));
        } catch (err) {
          // Ignore parse errors for incomplete messages
        }
      }
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const message = data.toString();
    if (message.includes('[MCP] Server started')) {
      console.log('✓ Server started successfully\n');
    }
  });

  // Wait for server to initialize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Send initialize request
  console.log('Sending initialize request...');
  const initRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
  };
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Send initialized notification
  console.log('\nSending initialized notification...');
  const initializedNotification = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  };
  serverProcess.stdin.write(JSON.stringify(initializedNotification) + '\n');

  await new Promise((resolve) => setTimeout(resolve, 500));

  // List tools
  console.log('\nRequesting tools list...');
  const listToolsRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/list',
  };
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // List resources
  console.log('\nRequesting resources list...');
  const listResourcesRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'resources/list',
  };
  serverProcess.stdin.write(JSON.stringify(listResourcesRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test a tool call
  console.log('\nTesting get_filter_examples tool...');
  const callToolRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: 'get_filter_examples',
      arguments: {},
    },
  };
  serverProcess.stdin.write(JSON.stringify(callToolRequest) + '\n');

  // Wait for final responses
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Cleanup
  console.log('\n\n✓ Test complete! Shutting down server...');
  serverProcess.kill();
  process.exit(0);
}

testMCPServer().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
