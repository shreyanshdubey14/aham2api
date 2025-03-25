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
    prefix: 'samura-'
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
    prefix: 'typegpt-'
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
    prefix: 'groq-'
  }
};

// Hardcoded exposed models with consistent naming
const exposedModels = {
  'samura': [
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
  ],
  'groq': [
    'qwen-2.5-32b',
    'qwen-qwq-32b',
    'llama3-70b-8192',
    'llama3-8b-8192',
    'mixtral-8x7b-32768'
  ],
  'typegpt': [
    'gpt-4o-mini-2024-07-18',
    'deepseek-r1',
    'deepseek-v3'
  ]
};

// Initialize provider models
async function initializeModels() {
  try {
    // Initialize Samura models
    const samuraRes = await axios.get(apiConfig.samura.modelsEndpoint, {
      timeout: apiConfig.samura.timeout
    });
    if (samuraRes.data?.data) {
      apiConfig.samura.models = new Set(samuraRes.data.data.map(m => m.id));
    }

    // Initialize Groq models
    const groqRes = await axios.get(apiConfig.groq.modelsEndpoint, {
      headers: apiConfig.groq.headers,
      timeout: apiConfig.groq.timeout
    });
    if (groqRes.data?.data) {
      apiConfig.groq.models = new Set(groqRes.data.data.map(m => m.id));
    }
  } catch (error) {
    console.error('Error initializing models:', error.message);
  }
}

// Initialize and refresh models every 5 minutes
initializeModels();
setInterval(initializeModels, 5 * 60 * 1000);

// OpenAI-compatible models endpoint
app.get('/v1/models', (req, res) => {
  const models = [];
  
  // Generate model list with provider prefixes
  for (const [provider, modelIds] of Object.entries(exposedModels)) {
    for (const modelId of modelIds) {
      models.push({
        id: `${apiConfig[provider].prefix}${modelId}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: provider,
        root: `${apiConfig[provider].prefix}${modelId}`,
        parent: null,
        permission: [
          {
            id: `modelperm-${Math.random().toString(36).slice(2)}`,
            object: 'model_permission',
            created: Math.floor(Date.now() / 1000),
            allow_create_engine: false,
            allow_sampling: true,
            allow_logprobs: true,
            allow_search_indices: false,
            allow_view: true,
            allow_fine_tuning: false,
            organization: '*',
            group: null,
            is_blocking: false
          }
        ]
      });
    }
  }

  res.json({
    object: 'list',
    data: models
  });
});

// Enhanced model routing
function getApiTarget(modelId) {
  if (!modelId) return null;

  // Check for provider prefixes first
  for (const [provider, config] of Object.entries(apiConfig)) {
    if (modelId.startsWith(config.prefix)) {
      const baseModel = modelId.slice(config.prefix.length);
      if (apiConfig[provider].models.has(baseModel) || exposedModels[provider].includes(baseModel)) {
        return { 
          provider,
          baseModel,
          endpoint: config.endpoint,
          headers: config.headers,
          timeout: config.timeout
        };
      }
    }
  }

  // If no prefix, check if model exists in exactly one provider
  const matchingProviders = Object.entries(exposedModels)
    .filter(([_, models]) => models.includes(modelId))
    .map(([provider]) => provider);

  if (matchingProviders.length === 1) {
    const provider = matchingProviders[0];
    return {
      provider,
      baseModel: modelId,
      endpoint: apiConfig[provider].endpoint,
      headers: apiConfig[provider].headers,
      timeout: apiConfig[provider].timeout
    };
  }

  return null;
}

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    // Validate request
    if (!model || !messages) {
      return res.status(400).json({
        error: {
          message: "'model' and 'messages' are required fields",
          type: 'invalid_request_error',
          param: null,
          code: null
        }
      });
    }

    // Get target API configuration
    const target = getApiTarget(model);
    if (!target) {
      return res.status(400).json({
        error: {
          message: `The model '${model}' does not exist`,
          type: 'invalid_request_error',
          param: 'model',
          code: 'model_not_found'
        }
      });
    }

    // Prepare request data
    const requestData = {
      model: target.baseModel,
      messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 1000,
      stream: stream || false
    };

    // Make request to target API
    const response = await axios({
      method: 'post',
      url: target.endpoint,
      headers: target.headers,
      data: requestData,
      timeout: target.timeout,
      responseType: stream ? 'stream' : 'json'
    });

    // Handle streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      response.data.pipe(res);
      return;
    }

    // Standardize response format
    const result = response.data;
    const standardizedResponse = {
      id: result.id || `chatcmpl-${Math.random().toString(36).slice(2)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: `${target.provider}-${result.model || target.baseModel}`,
      choices: result.choices?.map(choice => ({
        index: choice.index || 0,
        message: {
          role: choice.message?.role || "assistant",
          content: choice.message?.content || ""
        },
        finish_reason: choice.finish_reason || "stop"
      })) || [],
      usage: result.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      system_fingerprint: result.system_fingerprint || null
    };

    res.json(standardizedResponse);

  } catch (error) {
    console.error('Error:', error.message);
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || {
      error: {
        message: error.message,
        type: 'api_error',
        code: null
      }
    };
    
    res.status(statusCode).json(errorData);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`OpenAI-compatible API running on port ${PORT}`);
});
