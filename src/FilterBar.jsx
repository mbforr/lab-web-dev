import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import { CATEGORIES, PALETTE } from './mapActions'

// FilterBar — the category chips. A chip click does NOT touch the map directly;
// it builds a setFilter action and hands it to the shared dispatch (via onSelect),
// exactly like the chat does. One dispatch path for chips, chat, and clicks.
//
// Colors come from the shared PALETTE so a chip is always the same color as its
// dots on the map (CLAUDE.md: one palette constant, no color literals here).
export default function FilterBar({ selected, onSelect }) {
  // 'all' plus the four rider categories, in display order.
  const options = ['all', ...CATEGORIES]

  return (
    <Stack direction="row" spacing={1} className="filter-bar">
      {options.map((cat) => {
        const isSelected = selected === cat
        const color = cat === 'all' ? '#444' : PALETTE[cat]
        return (
          <Chip
            key={cat}
            label={cat}
            onClick={() => onSelect(cat)}
            // Selected chip is filled with its category color; the rest are
            // outlined. This makes the active filter obvious without a legend.
            variant={isSelected ? 'filled' : 'outlined'}
            sx={{
              textTransform: 'capitalize',
              fontWeight: isSelected ? 700 : 400,
              color: isSelected ? '#fff' : color,
              backgroundColor: isSelected ? color : 'transparent',
              borderColor: color,
              '&:hover': { backgroundColor: isSelected ? color : `${color}22` },
            }}
          />
        )
      })}
    </Stack>
  )
}
