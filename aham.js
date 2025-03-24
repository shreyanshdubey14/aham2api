const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API configurations
const apiConfig = {
  'genspark': {
    endpoint: 'https://gs.aytsao.cn/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-genspark2api'
    },
    models: new Set([
      'gpt-4o', 'o1', 'o3-mini-high', 'claude-3-7-sonnet',
      'claude-3-7-sonnet-thinking', 'claude-3-5-haiku',
      'gemini-2.0-flash', 'deep-seek-v3', 'deep-seek-r1'
    ])
  },
  'groq': {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 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'
    },
    models: new Set([
      'deepseek-r1-distill-llama-70b',
      'llama3-70b-8192',
      'mixtral-8x7b-32768'
    ])
  }
};

const getApiTarget = (model) => {
  if (apiConfig.genspark.models.has(model)) return 'genspark';
  if (apiConfig.groq.models.has(model)) return 'groq';
  return null;
};

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model } = req.body;
    const target = getApiTarget(model);

    if (!target) {
      return res.status(400).json({ error: 'Invalid model specified' });
    }

    const response = await axios({
      method: 'post',
      url: apiConfig[target].endpoint,
      headers: apiConfig[target].headers,
      data: req.body
    });

    // Standardize response format
    const standardizedResponse = {
      id: response.data.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: response.data.model,
      choices: response.data.choices.map(choice => ({
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
