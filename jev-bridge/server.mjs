import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { buildChoiceRequest, buildNoulRequest, buildScoreRequest, callJev, listModels } from './jev-client.mjs';

const server = new McpServer({ name: 'jev-bridge', version: '1.0.0' }, {
  instructions: 'Use Jev for narrow typed judgments: yes/no, choosing among defined options, and ordered scores. Do not send secrets or unnecessary private data. Keep deterministic rules and execution in ordinary code.'
});

const common = {
  state: z.string().min(1).max(60000).describe('Only the context Jev needs for this judgment. Do not include secrets.'),
  question: z.string().min(1).max(4000).describe('One narrow judgment to make about the supplied state.'),
  model: z.string().min(1).max(100).optional().describe('Optional TypeSafe model override. Defaults to jev-latest.')
};

function result(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value
  };
}

function failure(error) {
  const message = error instanceof Error ? error.message : 'Unknown Jev error.';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

server.registerTool('jev_yes_no', {
  title: 'Jev yes/no judgment',
  description: 'Ask Jev one bounded yes/no judgment and return its probability. Sends the supplied state to TypeSafe.',
  inputSchema: {
    ...common,
    yesCriteria: z.string().max(2000).optional(),
    noCriteria: z.string().max(2000).optional()
  }
}, async args => {
  try { return result(await callJev(buildNoulRequest(args))); } catch (error) { return failure(error); }
});

server.registerTool('jev_choice', {
  title: 'Jev choice judgment',
  description: 'Ask Jev to choose one option from a defined set and return probabilities/confidence. Sends the supplied state to TypeSafe.',
  inputSchema: {
    ...common,
    options: z.array(z.object({ label: z.string().min(1).max(200), description: z.string().max(2000).optional() })).min(2).max(100)
  }
}, async args => {
  try { return result(await callJev(buildChoiceRequest(args))); } catch (error) { return failure(error); }
});

server.registerTool('jev_score', {
  title: 'Jev ordered score',
  description: 'Ask Jev to rate state against ordered descriptive levels and return probabilities/confidence. Sends the supplied state to TypeSafe.',
  inputSchema: {
    ...common,
    levels: z.array(z.string().min(1).max(2000)).min(2).max(100)
  }
}, async args => {
  try { return result(await callJev(buildScoreRequest(args))); } catch (error) { return failure(error); }
});

server.registerTool('jev_models', {
  title: 'List TypeSafe models',
  description: 'List models available to the configured TypeSafe account. Sends no user state.',
  inputSchema: {}
}, async () => {
  try { return result(await listModels()); } catch (error) { return failure(error); }
});

await server.connect(new StdioServerTransport());
console.error('Jev MCP bridge ready on stdio.');
