# Public assets

Served as-is at the site root (e.g. `/school-logo.png`).

## The school seal

The seal is stamped on the top-left of the exported Excel schedule
(**Export Excel** on the Schedule page).

**To add it — one step, no code change:**

1. Save the seal image into **this** folder (`apps/web/public`).
2. Name it **`school-logo.png`**.

That is the whole procedure. The next export picks it up.

### If it still does not show

The export tries these names in order, so any of these work equally well:

```
school-logo.png   school-logo.jpg   school-logo.jpeg
logo.png          logo.jpg          pseal.png         pseal.jpg
```

Checklist if the seal is missing after a save:

- The file is in `apps/web/public/` — **not** `public/assets/` or the repo root.
- It is a **real** image and not empty (0 bytes shows as a blank cell).
- It is PNG, JPEG or GIF. **WebP is not supported** and is skipped on purpose.
- **Restart the dev server** after adding it. Vite only picks up new files in
  `public/` on start-up, so a running server will keep serving a 404.
- Hard-refresh the browser (**Ctrl+Shift+R**) before exporting again.

### Notes

- The image is **embedded inside the `.xlsx`**, so the exported file stays
  self-contained and the seal still shows when opened or printed elsewhere.
- The format is detected from the file's actual bytes, so a JPEG saved as
  `.png` still works (tagging JPEG bytes as PNG is what makes Excel show
  *"The picture can't be displayed"*).
- Square artwork is placed as a square; roughly 300×300 or larger is plenty.
- If no seal is present the export still works, just without one.
