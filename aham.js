const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API configurations with direct keys
const apiConfig = {
  'genspark': {
    endpoint: 'https://gs.aytsao.cn/v1/chat/completions',
    apiKey: 'sk-genspark2api', // Directly integrated Genspark key
    models: new Set([
      'gpt-4o', 'o1', 'o3-mini-high', 'claude-3-7-sonnet',
      'claude-3-7-sonnet-thinking', 'claude-3-5-haiku',
      'gemini-2.0-flash', 'deep-seek-v3', 'deep-seek-r1'
    ])
  },
  'openrouter': {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: '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',
    models: new Set([
      'google/gemma-3-12b-it:free',
      'google/gemma-3-1b-it:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'openai/gpt-4o'
    ])
  }
};

// ... [rest of the code remains identical to previous version] ...

// Model router
const getApiTarget = (model) => {
  if (apiConfig.genspark.models.has(model)) return 'genspark';
  if (apiConfig.openrouter.models.has(model)) return 'openrouter';
  if (model.includes('/')) return 'openrouter';
  return null;
};

// Proxy endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model } = req.body;
    const target = getApiTarget(model);

    if (!target) {
      return res.status(400).json({ error: 'Invalid model specified' });
    }

    const { endpoint, apiKey } = apiConfig[target];
    const response = await axios({
      method: 'post',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(target === 'openrouter' && {
          'HTTP-Referer': 'https://aham2api-3.onrender.com',
          'X-Title': 'Aham2 API Proxy'
        })
      },
      data: req.body
    });

    // Standardize response format
    const standardizedResponse = {
      id: response.data.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.data.model,
      choices: response.data.choices?.map(choice => ({
        index: 0,
        message: {
          role: "assistant",
          content: choice.message?.content || ""
        },
        finish_reason: choice.finish_reason,
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
