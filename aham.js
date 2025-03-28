const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// API configurations
const apiConfig = {
  'samura': {
    endpoint: 'https://api-provider-b5s7.onrender.com/v1/chat/completions',
    modelsEndpoint: 'https://api-provider-b5s7.onrender.com/v1/models',
    headers: {
      'Content-Type': 'application/json'
    },
    models: new Set(),
    timeout: 30000,
    prefix: 'samu/'
  },
  'typegpt': {
    endpoint: 'https://api.typegpt.net/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-5Sichm5uRiWUz5KNav8x8AUEpf11UqqzDsph5palyybb0B3i'
    },
    models: new Set([
      'gpt-4o-mini-2024-07-18',
      'deepseek-r1',
      'deepseek-v3'
    ]),
    timeout: 30000,
    prefix: 'type/'
  },
  'groq': {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelsEndpoint: 'https://api.groq.com/openai/v1/models',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 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'
    },
    models: new Set(),
    timeout: 30000,
    prefix: 'groq/'
  },
  'openrouter': {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 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',
      'HTTP-Referer': 'https://aham2api-3.onrender.com',
      'X-Title': 'Aham API Proxy'
    },
    models: new Set([
      'deepseek/deepseek-chat-v3-0324:free'
    ]),
    timeout: 30000,
    prefix: 'openrouter/'
  }
};

// Hardcoded models that we want to expose through our /v1/models endpoint
const exposedModels = {
  'samura': new Set([
    'deepseek-r1',
    'gpt-4o',
    'gpt-4o-latest',
    'chatgpt-4o-latest',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-flash-2.0',
    'gemini-1.5-flash',
    'claude-3-5-sonnet',
    'claude-3-5-sonnet-20240620',
    'anthropic/claude-3.5-sonnet',
    'mistral-large',
    'deepseek-v3',
    'llama-3.1-405b',
    'Meta-Llama-3.1-405B-Instruct-Turbo',
    'Meta-Llama-3.3-70B-Instruct-Turbo',
    'grok-2',
    'qwen-plus-latest',
    'qwen-turbo-latest',
    'dbrx-instruct',
    'claude',
    'qwen-2.5-32b',
    'qwen-2.5-coder-32b',
    'qwen-qwq-32b',
    'gemma2-9b-it',
    'deepseek-r1-distill-llama-70b',
    'o3-mini',
    'Claude-sonnet-3.7'
  ]),
  'groq': new Set([
    'qwen-2.5-32b',
    'qwen-qwq-32b'
  ]),
  'typegpt': new Set([
    'gpt-4o-mini-2024-07-18',
    'deepseek-r1',
    'deepseek-v3'
  ]),
  'openrouter': new Set([
    'deepseek/deepseek-chat-v3-0324:free'
  ])
};

// Fetch and update samura models (for internal use)
async function updateSamuraModels() {
  try {
    const response = await axios.get(apiConfig.samura.modelsEndpoint, {
      timeout: apiConfig.samura.timeout
    });
    if (response.data && Array.isArray(response.data.data)) {
      apiConfig.samura.models = new Set(response.data.data.map(model => model.id));
      console.log('Updated internal samura models:', [...apiConfig.samura.models]);
    }
  } catch (error) {
    console.error('Failed to fetch samura models:', error.message);
  }
}

// Fetch and update groq models (for internal use)
async function updateGroqModels() {
  try {
    const response = await axios.get(apiConfig.groq.modelsEndpoint, {
      headers: apiConfig.groq.headers,
      timeout: apiConfig.groq.timeout
    });
    if (response.data && Array.isArray(response.data.data)) {
      apiConfig.groq.models = new Set(response.data.data.map(model => model.id));
      console.log('Updated internal groq models:', [...apiConfig.groq.models]);
    }
  } catch (error) {
    console.error('Failed to fetch groq models:', error.message);
  }
}

// Initial fetch
updateSamuraModels();
updateGroqModels();

// Refresh every 5 minutes
setInterval(updateSamuraModels, 5 * 60 * 1000);
setInterval(updateGroqModels, 5 * 60 * 1000);

// Helper function to get API target
const getApiTarget = (model) => {
  if (!model) return null;
  if (model.startsWith('samu/')) {
    const actualModel = model.replace('samu/', '');
    if (apiConfig.samura.models.has(actualModel)) {
      return { target: 'samura', model: actualModel };
    }
  }
  if (model.startsWith('type/')) {
    const actualModel = model.replace('type/', '');
    if (apiConfig.typegpt.models.has(actualModel)) {
      return { target: 'typegpt', model: actualModel };
    }
  }
  if (model.startsWith('groq/')) {
    const actualModel = model.replace('groq/', '');
    if (apiConfig.groq.models.has(actualModel)) {
      return { target: 'groq', model: actualModel };
    }
  }
  if (model.startsWith('openrouter/')) {
    const actualModel = model.replace('openrouter/', '');
    if (apiConfig.openrouter.models.has(actualModel)) {
      return { target: 'openrouter', model: actualModel };
    }
  }
  if (apiConfig.samura.models.has(model)) return { target: 'samura', model };
  if (apiConfig.typegpt.models.has(model)) return { target: 'typegpt', model };
  if (apiConfig.groq.models.has(model)) return { target: 'groq', model };
  if (apiConfig.openrouter.models.has(model)) return { target: 'openrouter', model };
  return null;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    samura_models_loaded: apiConfig.samura.models.size > 0,
    groq_models_loaded: apiConfig.groq.models.size > 0,
    openrouter_ready: true
  });
});

// Models listing endpoint
app.get('/v1/models', (req, res) => {
  const allModels = [
    ...[...exposedModels.samura].map(id => ({
      id,
      object: 'model',
      provider: 'samura'
    })),
    ...[...exposedModels.typegpt].map(id => ({
      id,
      object: 'model',
      provider: 'typegpt'
    })),
    ...[...exposedModels.groq].map(id => ({
      id,
      object: 'model',
      provider: 'groq'
    })),
    ...[...exposedModels.openrouter].map(id => ({
      id,
      object: 'model',
      provider: 'openrouter'
    }))
  ];
  res.json({
    object: 'list',
    allModels
  });
});

// Chat completions endpoint with streaming support
app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { model, stream } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model parameter is required' });
    }

    const targetInfo = getApiTarget(model);
    if (!targetInfo) {
      return res.status(400).json({
        error: 'Invalid model specified',
        available_models: {
          samura: [...exposedModels.samura],
          typegpt: [...exposedModels.typegpt],
          groq: [...exposedModels.groq],
          openrouter: [...exposedModels.openrouter]
        }
      });
    }

    const { target, model: actualModel } = targetInfo;
    const config = apiConfig[target];

    // Prepare the request
    const requestData = {
      ...req.body,
      model: actualModel
    };

    // Handle streaming response
    if (stream) {
      // Set headers for SSE (Server-Sent Events)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Make the streaming request to the target API
      const response = await axios({
        method: 'post',
        url: config.endpoint,
        headers: config.headers,
        data: requestData,
        responseType: 'stream',
        timeout: config.timeout
      });

      // Forward the stream from the target API to the client
      response.data.on('data', (chunk) => {
        res.write(chunk);
      });

      response.data.on('end', () => {
        res.end();
      });

      response.data.on('error', (err) => {
        console.error('Stream error:', err);
        res.status(500).end();
      });

      return;
    }

    // Handle non-streaming response
    const response = await axios({
      method: 'post',
      url: config.endpoint,
      headers: config.headers,
      data: requestData,
      timeout: config.timeout
    });

    // Standardize the response
    const standardizedResponse = {
      id: response.data.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: response.data.created || Math.floor(Date.now() / 1000),
      model: response.data.model || actualModel,
      choices: (response.data.choices || []).map(choice => ({
        index: choice.index || 0,
        message: {
          role: choice.message?.role || "assistant",
          content: choice.message?.content || ""
        },
        finish_reason: choice.finish_reason || "stop",
        delta: {
          content: "",
          role: ""
        }
      })),
      usage: response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      suggestions: null,
      system_fingerprint: null
    };

    res.json(standardizedResponse);
  } catch (error) {
    console.error('Proxy error:', error.message);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    const statusCode = error.response?.status || 500;
    const errorData = {
      error: error.message,
      ...(error.response?.data && { details: error.response.data })
    };
    res.status(statusCode).json(errorData);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
