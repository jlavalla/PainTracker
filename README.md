# Pain Tracker

A simple, phone-first web app for tracking aches and pains.

- **Add a pain** with a name and a body area. It's logged once right away.
- **Tap a pain** in the list to log another instance. Each tap records the date and time, and the count goes up.
- **Undo** any action from the toast that appears at the bottom of the screen.
- **⋯ Details**: see stats and a weekly chart, log an instance at an earlier time, delete single entries, or rename, re-categorize, or delete the pain.
- **History**: weekly or monthly charts for all pains or one pain, plus a table view and recent entries.
- **Data**: export every entry to CSV (for example, to share with a doctor), save or restore a JSON backup, add custom body areas, or reset.

## Storage

Everything is stored in your browser (`localStorage`), so there is no account and no server. Data stays on the device and browser where you entered it. Use **Data → Save backup** now and then, and **Restore backup** to move your data to another device.

## Running it

It's plain HTML, CSS, and JS with no build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on your phone, host it on any static host (GitHub Pages, Netlify, and so on). Then choose **Add to Home Screen** in your browser so it opens like an app and works offline.
