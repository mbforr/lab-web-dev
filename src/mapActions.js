// mapActions.js — the ONE place the AI chat (and clicks, and later search) is
// allowed to touch the map.
//
// Why this file exists (CLAUDE.md "The JSON action contract"): a language model
// produces untrusted output. If we let it call map methods directly, one bad
// reply breaks the map. Instead the model may only emit small JSON "action"
// objects. We validate each one here; valid actions are dispatched to the map,
// invalid ones are logged and ignored. The map can never be broken by bad model
// output because bad output never reaches it.
//
// Everything that moves the map goes through dispatchAction(). There is no second
// path. Chat, filter chips, and (in later parts) search all build an action object
// and hand it to the same function.

// --- The category palette ----------------------------------------------------
// The SINGLE source of truth for category colors. Both the map's circle paint and
// the FilterBar chips read from here, so the legend and the dots can never drift
// apart (CLAUDE.md design rule: "One shared constant for the 4-category palette").
// These keys MUST match the app_category values produced by the pipeline's CASE.
export const PALETTE = {
  coffee: '#6f4e37',  // coffee brown
  food: '#e8663c',    // warm orange
  culture: '#8e5bd0', // purple
  shops: '#2f9e8f',   // teal
  other: '#9aa0a6',   // neutral gray — everything that isn't a rider destination type
}

// The four rider-facing categories, in display order. 'other' is intentionally
// excluded: it exists on the map for context but is not something you filter TO.
export const CATEGORIES = ['coffee', 'food', 'culture', 'shops']

// --- The one camera helper ----------------------------------------------------
// CLAUDE.md: "All camera movement goes through one flyTo helper with consistent
// easing and duration." Fixed easing/duration lives here so every fly — chat,
// search, click-to-center — feels identical.
const FLY = { duration: 1200, essential: true }

export function flyTo(map, center, zoom) {
  // zoom is optional; keep the current zoom if the caller didn't specify one.
  map.flyTo({ center, zoom: zoom ?? map.getZoom(), ...FLY })
}

// --- The action schema + validation gate --------------------------------------
// Each entry validates the *shape* of one action type. A validator returns true
// only when every required field is present and well-typed. This is the ONLY
// error-handling guard permitted in the Part 2 app (CLAUDE.md error policy).

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isLngLat = (c) =>
  Array.isArray(c) && c.length === 2 && isNum(c[0]) && isNum(c[1]) &&
  c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90

const VALIDATORS = {
  // Move the camera. center required; zoom optional.
  flyTo: (a) => isLngLat(a.center) && (a.zoom === undefined || isNum(a.zoom)),
  // Filter the places layer to one category, or 'all' to clear.
  setFilter: (a) => a.category === 'all' || CATEGORIES.includes(a.category),
  // Show/hide a named layer. Part 2 only has the 'places' layer.
  toggleLayer: (a) => typeof a.layer === 'string' && typeof a.visible === 'boolean',
  // Emphasize the place(s) matching this name.
  highlight: (a) => typeof a.name === 'string' && a.name.trim().length > 0,
  // Geocode a place/neighborhood name and fly there. Part 3: this is the chat's
  // door into the SAME search path the SearchBox uses. It carries only text; the
  // async geocode + resulting flyTo happen in App.runAction, so the actual camera
  // move still goes through the one flyTo/dispatch path (no second way to move the map).
  search: (a) => typeof a.query === 'string' && a.query.trim().length > 0,
  // Return to the default view: no filter, no highlight, NYC overview.
  reset: () => true,
}

// Validate a raw object (already JSON-parsed). Returns a tagged result so the
// caller can log both outcomes. We never throw: a malformed action is data to be
// logged, not an exception to crash on.
export function validateAction(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'not an object', raw }
  }
  const validate = VALIDATORS[raw.action]
  if (!validate) {
    return { valid: false, error: `unknown action "${raw.action}"`, raw }
  }
  if (!validate(raw)) {
    return { valid: false, error: `invalid fields for "${raw.action}"`, raw }
  }
  return { valid: true, action: raw }
}

// --- Parsing model replies ----------------------------------------------------
// The model may answer with a single action object or an array of them (e.g.
// "show me coffee in Williamsburg" → setFilter + flyTo). This function turns the
// raw model text into a list of candidate objects to be validated one-by-one.
//
// The try/catch here is deliberate and permitted: parsing untrusted model text is
// part of the validation gate. If the text is not JSON we do NOT throw — we return
// the raw string as a single candidate, which validateAction will reject and the UI
// will log as invalid. That is exactly the "malformed reply is logged, map unchanged"
// behavior Part 2 requires.
export function parseActions(text) {
  // Models often wrap JSON in ```json fences despite instructions; strip them.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return [text] // unparseable → one candidate that will fail validation
  }
  return Array.isArray(parsed) ? parsed : [parsed]
}

// --- Dispatch -----------------------------------------------------------------
// Apply ONE validated action to the map via the map controller (the small
// imperative surface Map.jsx exposes). Keeping the action→method mapping here,
// not in the components, is what makes this the single dispatch path.
//
// `controller` is the object Map.jsx hands up once the map is ready. Its methods
// are the only map mutations in the whole app.
export function dispatchAction(action, controller) {
  switch (action.action) {
    case 'flyTo':
      controller.flyTo(action.center, action.zoom)
      break
    case 'setFilter':
      controller.setCategoryFilter(action.category)
      break
    case 'toggleLayer':
      controller.toggleLayer(action.layer, action.visible)
      break
    case 'highlight':
      controller.setHighlight(action.name)
      break
    case 'reset':
      controller.reset()
      break
    // No default: validateAction already guaranteed a known action.
  }
}
