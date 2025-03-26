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
    headers: { 'Content-Type': 'application/json' },
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
    models: new Set(['gpt-4o-mini-2024-07-18', 'deepseek-r1', 'deepseek-v3']),
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
  }
};

// Hardcoded exposed models
const exposedModels = {
  'samura': new Set([
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
  'groq': new Set(['qwen-2.5-32b', 'qwen-qwq-32b']),
  'typegpt': new Set(['gpt-4o-mini-2024-07-18', 'deepseek-r1', 'deepseek-v3'])
};

// Model management functions
async function updateSamuraModels() {
  try {
    const response = await axios.get(apiConfig.samura.modelsEndpoint, {
      timeout: apiConfig.samura.timeout
    });
    if (response.data?.data) {
      apiConfig.samura.models = new Set(response.data.data.map(m => m.id));
    }
  } catch (error) {
    console.error('Failed to fetch samura models:', error.message);
  }
}

async function updateGroqModels() {
  try {
    const response = await axios.get(apiConfig.groq.modelsEndpoint, {
      headers: apiConfig.groq.headers,
      timeout: apiConfig.groq.timeout
    });
    if (response.data?.data) {
      apiConfig.groq.models = new Set(response.data.data.map(m => m.id));
    }
  } catch (error) {
    console.error('Failed to fetch groq models:', error.message);
  }
}

// Initial model loading
updateSamuraModels();
updateGroqModels();
setInterval(updateSamuraModels, 5 * 60 * 1000);
setInterval(updateGroqModels, 5 * 60 * 1000);

// Model resolution with case insensitivity
const getApiTarget = (model) => {
  if (!model) return null;
  const lowerModel = model.toLowerCase();

  // Check prefixed models first
  const prefixMap = {
    'samu/': 'samura',
    'type/': 'typegpt',
    'groq/': 'groq'
  };

  for (const [prefix, target] of Object.entries(prefixMap)) {
    if (lowerModel.startsWith(prefix)) {
      const actualModel = lowerModel.replace(prefix, '');
      if (apiConfig[target].models.has(actualModel)) {
        return { target, model: actualModel };
      }
    }
  }

  // Check non-prefixed models
  for (const [provider, models] of Object.entries(exposedModels)) {
    if (models.has(lowerModel)) {
      return { target: provider, model: lowerModel };
    }
  }

  return null;
};

// OpenAI-compatible models endpoint
app.get('/v1/models', (req, res) => {
  const models = Array.from(new Set([
    ...exposedModels.samura,
    ...exposedModels.typegpt,
    ...exposedModels.groq
  ])).map(id => ({ id, object: 'model' }));

  res.json({ object: 'list', data: models });
});

// Enhanced chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature } = req.body;
    const targetInfo = getApiTarget(model);

    if (!targetInfo) {
      return res.status(400).json({
        error: 'Invalid model specified',
        available_models: {
          samura: [...exposedModels.samura],
          typegpt: [...exposedModels.typegpt],
          groq: [...exposedModels.groq]
        }
      });
    }

    const { target, model: actualModel } = targetInfo;
    const config = apiConfig[target];
    
    // Prepare request payload
    const requestData = {
      model: actualModel,
      messages,
      temperature: temperature || 0.7,
      stream: false
    };

    // Make upstream API request
    const response = await axios.post(config.endpoint, requestData, {
      headers: config.headers,
      timeout: config.timeout
    });

    // Process DeepSeek-R1 specific response
    const choice = response.data.choices?.[0];
    if (!choice) return res.status(500).json({ error: 'No choices returned' });

    // Extract reasoning and final answer
    const content = choice.message?.content || '';
    const [reasoning, answer] = content.split('</think>\n').map(s => s.trim());

    // Standard OpenAI format
    const standardizedResponse = {
      id: response.data.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: actualModel,
      choices: [{
        index: 0,
        message: {
          role: choice.message?.role || "assistant",
          content: answer || ""
        },
        finish_reason: choice.finish_reason || "stop"
      }],
      usage: response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    res.json(standardizedResponse);
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = {
      error: error.message,
      ...(error.response?.data && { details: error.response.data })
    };
    res.status(statusCode).json(errorData);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
