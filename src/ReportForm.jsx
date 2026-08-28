import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Rating from '@mui/material/Rating'
import Button from '@mui/material/Button'

const API = import.meta.env.VITE_API_BASE_URL

// ReportForm — the click-commit surface for a place. Clicking a place opens this dialog
// (name/category/address in the header = the "details" the interaction rule asks for),
// plus a spot-report form. On submit it POSTs to our FastAPI service; a 201 refetches the
// reports layer so the new pin shows up. Validation lives SERVER-side (Pydantic) so the
// browser can't be the only thing enforcing the rules — see api/main.py.
export default function ReportForm({ place, onClose, onSubmitted }) {
  const [comment, setComment] = useState('')
  const [rating, setRating] = useState(3)
  const [status, setStatus] = useState(null) // last non-201 response, shown inline

  async function submit() {
    setStatus(null)
    const res = await fetch(`${API}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        place_id: place.id,
        place_name: place.name,
        comment,
        rating,
        lon: place.lon,
        lat: place.lat,
      }),
    })
    if (res.status === 201) {
      setComment('')
      setRating(3)
      onSubmitted() // App refetches GET /reports → the new report appears on the map
      onClose()
    } else {
      // Surface the server's verdict (e.g. 422 validation) instead of silently failing.
      setStatus(`Server returned ${res.status}`)
    }
  }

  // Controlled open: the dialog is open exactly when a place is selected.
  return (
    <Dialog open={Boolean(place)} onClose={onClose} fullWidth maxWidth="xs">
      {place && (
        <>
          <DialogTitle sx={{ pb: 0 }}>
            {place.name}
            <div style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>
              {place.category}
              {place.address ? ` · ${place.address}` : ''}
            </div>
          </DialogTitle>
          <DialogContent>
            <div style={{ margin: '12px 0 4px' }}>Your rating</div>
            <Rating value={rating} onChange={(_e, v) => setRating(v || 1)} />
            <TextField
              label="Comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              inputProps={{ maxLength: 280 }}
              helperText={`${comment.length}/280`}
              sx={{ mt: 1 }}
            />
            {status && <div style={{ color: '#c62828', fontSize: 13, marginTop: 8 }}>{status}</div>}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={submit}>
              Submit report
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
