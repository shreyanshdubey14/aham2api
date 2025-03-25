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
  }
};

// Fetch and update samura models
async function updateSamuraModels() {
  try {
    const response = await axios.get(apiConfig.samura.modelsEndpoint, {
      timeout: apiConfig.samura.timeout
    });
    
    if (response.data && Array.isArray(response.data.data)) {
      apiConfig.samura.models = new Set(response.data.data.map(model => model.id));
      console.log('Updated samura models:', [...apiConfig.samura.models]);
    }
  } catch (error) {
    console.error('Failed to fetch samura models:', error.message);
  }
}

// Fetch and update groq models
async function updateGroqModels() {
  try {
    const response = await axios.get(apiConfig.groq.modelsEndpoint, {
      headers: apiConfig.groq.headers,
      timeout: apiConfig.groq.timeout
    });
    
    if (response.data && Array.isArray(response.data.data)) {
      apiConfig.groq.models = new Set(response.data.data.map(model => model.id));
      console.log('Updated groq models:', [...apiConfig.groq.models]);
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
  
  if (apiConfig.samura.models.has(model)) return { target: 'samura', model };
  if (apiConfig.typegpt.models.has(model)) return { target: 'typegpt', model };
  if (apiConfig.groq.models.has(model)) return { target: 'groq', model };
  
  return null;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    samura_models_loaded: apiConfig.samura.models.size > 0,
    groq_models_loaded: apiConfig.groq.models.size > 0
  });
});

// Models listing endpoint
app.get('/v1/models', (req, res) => {
  const allModels = [
    ...[...apiConfig.samura.models].map(id => ({
      id: `samu/${id}`,
      object: 'model',
      provider: 'samura'
    })),
    ...[...apiConfig.typegpt.models].map(id => ({
      id: `type/${id}`,
      object: 'model',
      provider: 'typegpt'
    })),
    ...[...apiConfig.groq.models].map(id => ({
      id: `groq/${id}`,
      object: 'model',
      provider: 'groq'
    })),
    // Also include non-prefixed versions
    ...[...apiConfig.samura.models].map(id => ({
      id,
      object: 'model',
      provider: 'samura'
    })),
    ...[...apiConfig.typegpt.models].map(id => ({
      id,
      object: 'model',
      provider: 'typegpt'
    })),
    ...[...apiConfig.groq.models].map(id => ({
      id,
      object: 'model',
      provider: 'groq'
    }))
  ];

  res.json({
    object: 'list',
    data: allModels
  });
});

// Chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
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
          groq: [...apiConfig.groq.models].map(m => `groq/${m}`),
          ...Object.entries(apiConfig).reduce((acc, [key, config]) => {
            acc[key] = [...config.models];
            return acc;
          }, {})
        }
      });
    }

    const { target, model: actualModel } = targetInfo;
    const config = apiConfig[target];
    
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
