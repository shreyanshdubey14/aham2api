const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Model mapping validation
const validModels = new Set([
    'gpt-4o', 'o1', 'o3-mini-high', 
    'claude-3-7-sonnet', 'claude-3-7-sonnet-thinking',
    'claude-3-5-haiku', 'gemini-2.0-flash',
    'deep-seek-v3', 'deep-seek-r1'
]);

// Main proxy endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        // Validate model
        if (!validModels.has(req.body.model)) {
            return res.status(400).json({ error: 'Invalid model specified' });
        }

        // Forward request to target API
        const response = await axios({
            method: 'post',
            url: 'https://gs.aytsao.cn/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-genspark2api'
            },
            data: req.body
        });

        // Forward the response
        res.json({
            ...response.data,
            // Add any custom modifications here
            suggestions: null,
            system_fingerprint: null
        });

    } catch (error) {
        // Error handling
        console.error('Proxy error:', error);
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
