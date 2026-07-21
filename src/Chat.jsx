import { useState } from 'react'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { parseActions } from './mapActions'

// The system prompt. The model is told it may ONLY answer with action JSON — never
// prose. We embed the whole schema and three worked examples so a small open model
// can follow it. NOTE (CLAUDE.md): when a later part adds an action, the schema in
// mapActions.js AND this prompt must be extended together, or the model and the
// validator drift apart.
const SYSTEM_PROMPT = `You control a map of New York City. You may ONLY reply with JSON — no prose, no explanation, no markdown fences.

Reply with a JSON array of one or more action objects. Each action is one of:
- {"action":"flyTo","center":[lng,lat],"zoom":<number 0-20>}  — move the camera
- {"action":"setFilter","category":"coffee"|"food"|"culture"|"shops"|"all"}  — filter places
- {"action":"highlight","name":"<place name>"}  — emphasize a place by name
- {"action":"toggleLayer","layer":"places","visible":true|false}  — show/hide a layer
- {"action":"reset"}  — clear filters and return to the NYC overview

Coordinates are [longitude, latitude]. Use your knowledge of NYC to pick coordinates for neighborhoods and landmarks.

Examples:
User: show me coffee in Williamsburg
Assistant: [{"action":"setFilter","category":"coffee"},{"action":"flyTo","center":[-73.957,40.714],"zoom":14}]

User: take me to Central Park
Assistant: [{"action":"flyTo","center":[-73.965,40.782],"zoom":14}]

User: reset the map
Assistant: [{"action":"reset"}]`

// Chat panel: takes a user sentence, asks the model for actions, and runs each one
// through the shared dispatch (runAction, provided by App). It also renders the
// action log so you can see exactly what the model produced — including rejected
// output. There is NO error handling here; the only guard is the validation gate
// inside runAction/mapActions.js.
export default function Chat({ runAction, log }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    setBusy(true)

    // Any OpenAI-compatible /chat/completions endpoint (base URL + key from .env).
    const res = await fetch(`${import.meta.env.VITE_LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: import.meta.env.VITE_LLM_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    })
    const data = await res.json()
    const reply = data.choices[0].message.content

    // One or more candidate actions → each goes through the same runAction path
    // the chips use. Invalid ones get logged and ignored by the gate.
    parseActions(reply).forEach(runAction)
    setBusy(false)
  }

  return (
    <div className="chat">
      <Stack direction="row" spacing={1} className="chat-input">
        <TextField
          size="small"
          fullWidth
          placeholder="e.g. show me coffee in Williamsburg"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        <Button variant="contained" onClick={send} disabled={busy}>
          {busy ? '…' : 'Send'}
        </Button>
      </Stack>

      {/* The visible action log: every action the model (or a chip) produced, in
          order, with invalid ones clearly marked. This is the transparency the
          JSON action contract is built around. */}
      <div className="action-log">
        {log.length === 0 && <div className="log-empty">Actions will appear here.</div>}
        {log.map((entry, i) => (
          <div key={i} className={entry.valid ? 'log-item valid' : 'log-item invalid'}>
            <span className="log-tag">{entry.valid ? '✓' : '✗ invalid'}</span>
            <code>{entry.valid ? JSON.stringify(entry.action) : entry.detail}</code>
          </div>
        ))}
      </div>
    </div>
  )
}
