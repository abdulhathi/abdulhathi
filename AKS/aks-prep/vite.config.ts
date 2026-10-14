import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a tutor inside "AKS Worker Academy", a personal learning app about building a .NET 9 Worker Service and deploying it to Azure Kubernetes Service with an Azure DevOps CI/CD pipeline (BackgroundService pattern, Docker, ACR, AKS, Kubernetes manifests, ConfigMaps, graceful shutdown, KubernetesManifest pipeline tasks, KEDA).

The learner selected a passage from a lesson and asked a question about it. Answer in markdown, grounded in the lesson content provided. Be clear and concise — a few short paragraphs at most, with a small code example only when it genuinely helps.`

// Answers "ask about selection" questions server-side so the API key never
// reaches the browser. Reads ANTHROPIC_API_KEY from the shell env or .env.local.
function askApi(): Plugin {
  return {
    name: 'ask-api',
    configureServer(server) {
      server.middlewares.use('/api/ask', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const { selection, question, topicTitle, topicContent } = JSON.parse(body)
            if (!selection || !question) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'selection and question are required' }))
              return
            }

            const client = new Anthropic()
            const response = await client.messages.create({
              model: 'claude-opus-4-8',
              max_tokens: 16000,
              thinking: { type: 'adaptive' },
              system: SYSTEM_PROMPT,
              messages: [
                {
                  role: 'user',
                  content: `Lesson: ${topicTitle ?? 'unknown'}

<lesson_content>
${topicContent ?? '(not provided)'}
</lesson_content>

The learner selected this text:
"""
${selection}
"""

Their question: ${question}`,
                },
              ],
            })

            const answer = response.content
              .filter((b) => b.type === 'text')
              .map((b) => b.text)
              .join('\n')
            res.end(JSON.stringify({ answer }))
          } catch (err) {
            const missingKey =
              err instanceof Error && /authentication method|api.?key/i.test(err.message)
            if (missingKey && !(err instanceof Anthropic.APIError)) {
              res.statusCode = 401
              res.end(
                JSON.stringify({
                  error:
                    'No Claude API key found. Add ANTHROPIC_API_KEY=sk-ant-... to a .env.local file in the project root (or export it in your shell), then restart the dev server.',
                }),
              )
            } else if (err instanceof Anthropic.AuthenticationError) {
              res.statusCode = 401
              res.end(
                JSON.stringify({
                  error:
                    'Claude API auth failed. Set ANTHROPIC_API_KEY in your shell or .env.local (or run `ant auth login`), then restart the dev server.',
                }),
              )
            } else if (err instanceof Anthropic.RateLimitError) {
              res.statusCode = 429
              res.end(JSON.stringify({ error: 'Rate limited — wait a moment and try again.' }))
            } else if (err instanceof Anthropic.APIError) {
              res.statusCode = err.status ?? 500
              res.end(JSON.stringify({ error: `Claude API error: ${err.message}` }))
            } else {
              res.statusCode = 500
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Unexpected error',
                }),
              )
            }
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Let the user keep the key in .env.local instead of the shell env.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  }
  return {
    plugins: [react(), askApi()],
    server: { port: 5177 },
  }
})
