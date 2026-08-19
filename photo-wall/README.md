# Photo Wall

A shared photo wall for friends. Anyone with the link and the upload
passcode can add a photo. Every photo shrinks together as more get added:
1 photo fills the screen (1:1), 2 photos are each half that size (1:2), 3
are each a third (1:3), and so on toward 1 pixel. Hover (or tap on mobile)
any tile to see that photo full size.

## What's in here

- `app/page.js` — the wall itself (grid + upload button)
- `app/admin/page.js` — a passcode-gated page to delete photos or clear the wall
- `app/api/photos/route.js` — list photos / upload a photo
- `app/api/photos/[id]/route.js` — delete one photo
- `app/api/admin/clear/route.js` — clear the whole wall
- `lib/blob-index.js` — reads/writes the list of photos to Vercel Blob storage

Photos and the index are stored in **Vercel Blob**, so there's no separate
database to set up.

## Deploy it (one time setup)

1. **Push this folder to a GitHub repo.**

   ```bash
   cd photo-wall
   git init
   git add .
   git commit -m "Initial photo wall"
   gh repo create photo-wall --private --source=. --push
   ```

   (Or create a repo on GitHub's website and push there — whatever you
   normally do.)

2. **Import the repo into Vercel.**

   Go to https://vercel.com/new, pick the `photo-wall` repo, and click
   Deploy. Framework preset should auto-detect as Next.js — leave the
   defaults.

3. **Attach a Blob store.**

   In the Vercel project, go to the **Storage** tab → **Create Database**
   → **Blob**. Attach it to this project. Vercel will automatically add a
   `BLOB_READ_WRITE_TOKEN` environment variable for you — you don't need
   to copy anything by hand.

4. **Set your two passcodes.**

   In the project's **Settings → Environment Variables**, add:

   - `UPLOAD_PASSCODE` — whatever you want to tell your friends so they can upload.
   - `ADMIN_PASSCODE` — a different one, just for you, to access `/admin`.

   Apply both to Production (and Preview/Development if you'll use those).

5. **Redeploy.**

   After adding the env vars, trigger a redeploy (Vercel's env var UI
   offers a "Redeploy" button, or just push a new commit) so the new
   variables take effect.

6. **Share the link.**

   Send your friends the deployment URL and the upload passcode. Keep the
   admin passcode to yourself — visit `/admin` on your own to manage
   photos.

## Running it locally (optional)

```bash
npm install
vercel env pull .env.local   # pulls BLOB_READ_WRITE_TOKEN + your passcodes
npm run dev
```

Requires the [Vercel CLI](https://vercel.com/docs/cli) and the project to
already be linked/deployed once (step 2-4 above) so there's a Blob store
to pull credentials from.

## Notes & limitations

- Uploads are capped at 15MB per photo and common image types
  (jpeg/png/webp/gif/heic).
- The photo index is a single JSON file, read-modify-written on each
  upload/delete. That's plenty reliable for a friends-and-family wall; it
  isn't built to survive dozens of simultaneous uploads at the exact same
  millisecond.
- Anyone who has the upload passcode can upload; there's no per-person
  identity or moderation queue. Use `/admin` to remove anything you don't
  want on the wall.
- The wall polls for new photos every 5 seconds, so friends' uploads show
  up without anyone needing to refresh.
