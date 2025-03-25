const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// API configurations
const apiConfig = {
  'samura': {
    endpoint: 'https://api-provider-b5s7.onrender.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json'
    },
    models: [
      'deepseek-r1', 'gpt-4o', 'gpt-4o-latest', 'chatgpt-4o-latest',
      'gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-flash-2.0',
      'gemini-1.5-flash', 'claude-3-5-sonnet', 'claude-3-5-sonnet-20240620',
      'anthropic/claude-3.5-sonnet', 'mistral-large', 'deepseek-v3',
      'llama-3.1-405b', 'Meta-Llama-3.1-405B-Instruct-Turbo',
      'Meta-Llama-3.3-70B-Instruct-Turbo', 'grok-2', 'qwen-plus-latest',
      'qwen-turbo-latest', 'dbrx-instruct', 'claude', 'qwen-2.5-32b',
      'qwen-2.5-coder-32b', 'qwen-qwq-32b', 'gemma2-9b-it',
      'deepseek-r1-distill-llama-70b', 'o3-mini', 'Claude-sonnet-3.7'
    ],
    timeout: 30000,
    prefix: 'samu/',
    supportsStreaming: true
  },
  'typegpt': {
    endpoint: 'https://api.typegpt.net/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TYPEGPT_API_KEY || 'sk-5Sichm5uRiWUz5KNav8x8AUEpf11UqqzDsph5palyybb0B3i'}`
    },
    models: [
      'gpt-4o-mini-2024-07-18',
      'deepseek-r1',
      'deepseek-v3'
    ],
    timeout: 30000,
    prefix: 'type/',
    supportsStreaming: true
  }
};

// Convert to Sets for faster lookups
apiConfig.samura.modelSet = new Set(apiConfig.samura.models);
apiConfig.typegpt.modelSet = new Set(apiConfig.typegpt.models);

const getApiTarget = (model) => {
  if (!model) return null;
  
  // Force deepseek-r1 to always use TypeGPT
  if (model === 'deepseek-r1' || model === 'type/deepseek-r1') {
    return { target: 'typegpt', model: 'deepseek-r1' };
  }

  // Check prefixed models
  if (model.startsWith('samu/')) {
    const actualModel = model.replace('samu/', '');
    if (apiConfig.samura.modelSet.has(actualModel)) {
      return { target: 'samura', model: actualModel };
    }
  }
  
  if (model.startsWith('type/')) {
    const actualModel = model.replace('type/', '');
    if (apiConfig.typegpt.modelSet.has(actualModel)) {
      return { target: 'typegpt', model: actualModel };
    }
  }
  
  // Fallback to direct model matching
  if (model !== 'deepseek-r1' && apiConfig.samura.modelSet.has(model)) {
    return { target: 'samura', model };
  }
  if (apiConfig.typegpt.modelSet.has(model)) {
    return { target: 'typegpt', model };
  }
  
  return null;
};

// OpenAI-style models list endpoint
app.get('/v1/models', (req, res) => {
  const models = [];
  
  // Add SamuraAI models
  apiConfig.samura.models.forEach(model => {
    models.push({
      id: model,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'samura',
      capabilities: {
        streaming: apiConfig.samura.supportsStreaming
      }
    });
  });
  
  // Add TypeGPT models
  apiConfig.typegpt.models.forEach(model => {
    models.push({
      id: model,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'typegpt',
      capabilities: {
        streaming: apiConfig.typegpt.supportsStreaming
      }
    });
  });
  
  res.json({
    object: 'list',
    data: models
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Chat completions endpoint with streaming support
app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { model, stream } = req.body;
    const targetInfo = getApiTarget(model);

    if (!targetInfo) {
      return res.status(400).json({ 
        error: 'Invalid model specified',
        available_models: {
          samura: apiConfig.samura.models.map(m => `samu/${m}`),
          typegpt: apiConfig.typegpt.models.map(m => `type/${m}`),
          samura_models: apiConfig.samura.models,
          typegpt_models: apiConfig.typegpt.models
        }
      });
    }

    const { target, model: actualModel } = targetInfo;
    const config = apiConfig[target];
    
    // Handle streaming
    if (stream === true) {
      const response = await axios({
        method: 'post',
        url: config.endpoint,
        headers: config.headers,
        data: { ...req.body, model: actualModel },
        responseType: 'stream',
        timeout: config.timeout
      });

      // Pipe the stream directly to client
      response.data.pipe(res);
      return;
    }

    // Non-streaming response
    const response = await axios({
      method: 'post',
      url: config.endpoint,
      headers: config.headers,
      data: { ...req.body, model: actualModel },
      timeout: config.timeout
    });

    // Standardize response
    const standardizedResponse = {
      id: response.data.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.data.model || actualModel,
      choices: response.data.choices?.map(choice => ({
        index: 0,
        message: {
          role: "assistant",
          content: choice.message?.content || ""
        },
        finish_reason: choice.finish_reason || "stop",
        delta: {
          content: "",
          role: ""
        }
      })) || [],
      usage: response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    res.json(standardizedResponse);
  } catch (error) {
    console.error('Proxy error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
