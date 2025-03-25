const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// No security middleware
app.use(express.json());

// API configurations
const apiConfig = {
  'samura': {
    endpoint: 'https://api-provider-b5s7.onrender.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json'
    },
    models: new Set([
      'deepseek-r1', 'gpt-4o', 'gpt-4o-latest', 'chatgpt-4o-latest',
      'gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-flash-2.0',
      'gemini-1.5-flash', 'claude-3-5-sonnet', 'claude-3-5-sonnet-20240620',
      'anthropic/claude-3.5-sonnet', 'mistral-large', 'deepseek-v3',
      'llama-3.1-405b', 'Meta-Llama-3.1-405B-Instruct-Turbo',
      'Meta-Llama-3.3-70B-Instruct-Turbo', 'grok-2', 'qwen-plus-latest',
      'qwen-turbo-latest', 'dbrx-instruct', 'claude', 'qwen-2.5-32b',
      'qwen-2.5-coder-32b', 'qwen-qwq-32b', 'gemma2-9b-it',
      'deepseek-r1-distill-llama-70b', 'o3-mini', 'Claude-sonnet-3.7'
    ]),
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
  }
};

const getApiTarget = (model) => {
  if (!model) return null;
  
  // Check for prefixed models first
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
  
  // Fallback to direct model matching
  if (apiConfig.samura.models.has(model)) return { target: 'samura', model };
  if (apiConfig.typegpt.models.has(model)) return { target: 'typegpt', model };
  
  return null;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    // Validate request
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { model } = req.body;
    const targetInfo = getApiTarget(model);

    if (!targetInfo) {
      return res.status(400).json({ 
        error: 'Invalid model specified',
        available_models: {
          samura: [...apiConfig.samura.models].map(m => `samu/${m}`),
          typegpt: [...apiConfig.typegpt.models].map(m => `type/${m}`),
          // Also show models that can be used without prefix
          ...Object.entries(apiConfig).reduce((acc, [key, config]) => {
            acc[key] = [...config.models];
            return acc;
          }, {})
        }
      });
    }

    const { target, model: actualModel } = targetInfo;
    const config = apiConfig[target];
    
    // Create the request data with the actual model name
    const requestData = {
      ...req.body,
      model: actualModel
    };

    const response = await axios({
      method: 'post',
      url: config.endpoint,
      headers: config.headers,
      data: requestData,
      timeout: config.timeout
    });

    // Standardize response format
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
      },
      suggestions: null,
      system_fingerprint: null
    };

    res.json(standardizedResponse);

  } catch (error) {
    console.error('Proxy error:', error);
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
