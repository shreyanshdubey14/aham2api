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

// Hardcoded exposed models
const exposedModels = {
  'samura': [
    'deepseek-r1',
    'gpt-4o',
    'claude-3-5-sonnet',
    'llama-3.1-405b'
  ],
  'groq': [
    'llama3-70b-8192',
    'llama3-8b-8192'
  ],
  'typegpt': [
    'gpt-4o-mini-2024-07-18',
    'deepseek-r1'
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

// Enhanced message validation
function validateMessages(messages) {
  if (!Array.isArray(messages) return false;
  
  for (const msg of messages) {
    if (!msg.role || !msg.content) return false;
    if (!['system', 'user', 'assistant'].includes(msg.role)) return false;
    if (typeof msg.content !== 'string') return false;
  }
  
  return true;
}

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature = 0.7, max_tokens = 2000, stream = false } = req.body;
    
    // Enhanced validation
    if (!model) {
      return res.status(400).json({
        error: {
          message: "'model' is required",
          type: 'invalid_request_error',
          param: 'model',
          code: 'model_required'
        }
      });
    }

    if (!validateMessages(messages)) {
      return res.status(400).json({
        error: {
          message: "'messages' must be a non-empty array of message objects with 'role' and 'content'",
          type: 'invalid_request_error',
          param: 'messages',
          code: 'invalid_messages_format'
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

    // Prepare request data with conversation history
    const requestData = {
      model: target.baseModel,
      messages,  // Pass through the full message history
      temperature: Math.min(Math.max(temperature, 0), 2),
      max_tokens: Math.min(Math.max(max_tokens, 1), 4000),
      stream
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

    // Return standardized response
    res.json({
      id: `chatcmpl-${Math.random().toString(36).slice(2)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: `${target.prefix}${target.baseModel}`,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: response.data.choices?.[0]?.message?.content || ""
        },
        finish_reason: "stop"
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    });

  } catch (error) {
    console.error('API Error:', error.message);
    const status = error.response?.status || 500;
    const data = error.response?.data || {
      error: {
        message: error.message,
        type: 'api_error',
        code: null
      }
    };
    res.status(status).json(data);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
