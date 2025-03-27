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

// [Rest of your existing configuration remains the same...]

// Enhanced chat completions endpoint with proper OpenRouter handling
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
          samura: [...exposedModels.samura],
          typegpt: [...exposedModels.typegpt],
          groq: [...exposedModels.groq],
          openrouter: [...exposedModels.openrouter]
        }
      });
    }
    
    const { target, model: actualModel } = targetInfo;
    const config = apiConfig[target];
    
    // Prepare the request data
    const requestData = {
      ...req.body,
      model: actualModel
    };
    
    // Special handling for OpenRouter
    const headers = { ...config.headers };
    if (target === 'openrouter') {
      // Ensure required headers are present
      if (!headers['HTTP-Referer']) {
        headers['HTTP-Referer'] = 'https://aham2api-3.onrender.com';
      }
      if (!headers['X-Title']) {
        headers['X-Title'] = 'Aham API Proxy';
      }
    }
    
    // Make the request to the target API
    const response = await axios({
      method: 'post',
      url: config.endpoint,
      headers: headers,
      requestData,
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
    console.error('Error details:', error.response?.data);
    
    const statusCode = error.response?.status || 500;
    const errorData = {
      error: error.message,
      ...(error.response?.data && { details: error.response.data })
    };
    
    // Special handling for authentication errors
    if (statusCode === 401) {
      errorData.error = "Authentication failed with the API provider";
      if (targetInfo?.target === 'openrouter') {
        errorData.suggestion = "Please verify your OpenRouter API key and required headers";
      }
    }
    
    res.status(statusCode).json(errorData);
  }
});

// [Rest of your existing code remains the same...]

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
