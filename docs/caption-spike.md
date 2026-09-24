# Caption spike results

Build order step 1 in the spec, plan Step 5. This measures how often the caption library returns an English transcript locally and on Vercel. YouTube may block caption requests from cloud IPs, so the deployed column is the one that matters. Step 48 deletes the spike page and route; this file stays as the record.

## How to run it

1. **Local:** run `npm run dev`, open <http://localhost:3000/dev/captions>, paste the URLs below one per line and select **Run**. Copy each row into the **Local** columns.
2. **Deployed:** use a **preview** deployment. The route returns `404` in production, because nothing protects it until the passcode arrives in Step 12. Vercel's default Deployment Protection covers preview URLs, so only you can open them. To get a preview:
   - run `npx vercel` (without `--prod`), or
   - with the GitHub repo connected, push a branch other than `main` and open its preview URL.
3. Open `<preview URL>/dev/captions`, run the same list and fill in the **Deployed** columns. The footer shows the region the function ran in.

Result values:

| Value | Meaning |
| --- | --- |
| `manual_captions` | The uploader's English track (any variant, such as en-GB) |
| `auto_captions` | YouTube's auto-generated English track |
| `no_english_track` | No captions, or only other languages. This is the same locally and deployed. |
| `unavailable` | YouTube refused. A detail like `LOGIN_REQUIRED: Sign in to confirm you're not a bot` is the cloud-IP block this spike looks for. |
| `empty` | A track was listed, but its caption file came back empty or was refused |
| `error` | A timeout (20 seconds) or an unexpected failure. The detail has the message. |

## Results

Date: ____  ·  Deployed region: ____

| # | Kind | URL | Local result | Local ms | Deployed result | Deployed ms | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Normal upload, manual English captions | | | | | | |
| 2 | Normal upload, manual English captions | | | | | | |
| 3 | Normal upload, auto-captions only | | | | | | |
| 4 | Normal upload, auto-captions only | | | | | | |
| 5 | Short | | | | | | |
| 6 | Short | | | | | | |
| 7 | Live stream replay | | | | | | |
| 8 | Long video (over 30 minutes) | | | | | | |
| 9 | No captions at all | | | | | | |
| 10 | Non-English video | | | | | | |

**Local:** __ of 10 returned captions.
**Deployed:** __ of 10 returned captions.

## What the result means

- **Deployed matches local:** captions work from Vercel, and most videos get a word-for-word transcript for free.
- **Deployed is much lower:** this is the case the spec plans for. Videos move on to Gemini transcription (Step 21), and then to pasting (Step 24). Nothing else in the plan changes. Keep an eye on Gemini's free allowance of about 8 hours of video a day.
- **Rows 9 and 10** should say `no_english_track` in both columns. They check that failures are reported correctly, not the hit rate.

## Conclusion

_Write one or two sentences here after running both columns._
