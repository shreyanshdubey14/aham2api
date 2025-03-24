const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Model configuration
const apiConfig = {
  'original': {
    endpoint: 'https://gs.aytsao.cn/v1/chat/completions',
    apiKey: process.env.ORIGINAL_API_KEY,
    models: new Set([
      'gpt-4o', 'o1', 'o3-mini-high', 'claude-3-7-sonnet',
      'claude-3-7-sonnet-thinking', 'claude-3-5-haiku',
      'gemini-2.0-flash', 'deep-seek-v3', 'deep-seek-r1'
    ])
  },
  'openrouter': {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: process.env.OPENROUTER_API_KEY,
    models: new Set([
      'google/gemma-3-12b-it:free',
      'google/gemma-3-1b-it:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'openai/gpt-4o'
    ])
  }
};

// Helper function to determine API target
const getApiTarget = (model) => {
  if (apiConfig.original.models.has(model)) return 'original';
  if (apiConfig.openrouter.models.has(model)) return 'openrouter';
  if (model.includes('/')) return 'openrouter'; // For other OpenRouter models
  return null;
};

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model } = req.body;
    const target = getApiTarget(model);

    if (!target) {
      return res.status(400).json({ error: 'Invalid model specified' });
    }

    const config = apiConfig[target];
    const response = await axios({
      method: 'post',
      url: config.endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...(target === 'openrouter' && {
          'HTTP-Referer': 'https://yourdomain.com', // Required by OpenRouter
          'X-Title': 'Your API Name'                // Optional for OpenRouter
        })
      },
      data: req.body
    });

    // Transform response to your format
    const transformedResponse = {
      id: response.data.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.data.model,
      choices: response.data.choices,
      usage: response.data.usage,
      suggestions: null,
      system_fingerprint: null
    };

    res.json(transformedResponse);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
