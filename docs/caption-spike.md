# Caption spike results

Build order step 1 in the spec, plan Step 5. This measures how often the caption library returns an English transcript locally and on Vercel. YouTube may block caption requests from cloud IPs, so the deployed column is the one that matters. The plan had Step 48 delete the spike page and route. They stay until the Deployed column is filled in (decided 2026-09-25); delete `app/dev/captions/page.tsx` and `app/api/dev/captions/route.ts` after that. This file stays as the record.

## How to run it

1. **Local:** run `npm run dev`, open <http://localhost:3000/dev/captions>, paste the URLs below one per line and select **Run**. Copy each row into the **Local** columns.
2. **Deployed:** use a **preview** deployment. The app has no sign-in, so the route returns `404` in production. Vercel's default Deployment Protection covers preview URLs, so only you can open them. To get a preview:
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

Local: 2026-09-25, from the development machine.  ·  Deployed: ____, region ____

| # | Kind | URL | Local result | Local ms | Deployed result | Deployed ms | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Normal upload, manual English captions | https://www.youtube.com/watch?v=dQw4w9WgXcQ | `manual_captions` (61 cues) | 1213 | | | Rick Astley; lyrics in ♪ |
| 2 | Normal upload, manual English captions | https://www.youtube.com/watch?v=jNQXAC9IVRw | `manual_captions` (6 cues) | 1368 | | | Me at the zoo |
| 3 | Normal upload, auto-captions only | https://www.youtube.com/watch?v=J---aiyznGQ | `auto_captions` (4 cues) | 851 | | | Keyboard Cat: only `[Applause] [Music]`, so the pipeline moves on to Gemini |
| 4 | Normal upload, auto-captions only | https://www.youtube.com/watch?v=tNcc9tfyevM | `auto_captions` (438 cues) | 740 | | | Couple morning routine vlog |
| 5 | Short | https://www.youtube.com/shorts/vrIrDIA0GTM | `auto_captions` (100 cues) | 768 | | | In the library |
| 6 | Short | https://www.youtube.com/shorts/QgI9hOqr7uw | `no_english_track` | 827 | | | In the library; "This video has no captions." |
| 7 | Live stream replay | https://www.youtube.com/watch?v=cxn_twDmrIU | `auto_captions` (508 cues) | 788 | | | The Car Care Nut Q&A |
| 8 | Long video (over 30 minutes) | https://www.youtube.com/watch?v=ji5_MqicxSo | `manual_captions` (2131 cues) | 896 | | | 1:16:27 lecture |
| 9 | No captions at all | https://www.youtube.com/watch?v=aqz-KE-bpKQ | `no_english_track` | 913 | | | Big Buck Bunny; "This video has no captions." |
| 10 | Non-English video | https://www.youtube.com/watch?v=9bZkp7q19f0 | `no_english_track` | 852 | | | Gangnam Style; "Available: ko." |

**Local:** 7 of 10 returned captions (rows 1–5, 7 and 8). Rows 6, 9 and 10 have no English track, as expected.
**Deployed:** __ of 10 returned captions.

## What the result means

- **Deployed matches local:** captions work from Vercel, and most videos get a word-for-word transcript for free.
- **Deployed is much lower:** this is the case the spec plans for. Videos move on to Gemini transcription (Step 21), and then to pasting (Step 24). Nothing else in the plan changes. Keep an eye on Gemini's free allowance of about 8 hours of video a day.
- **Rows 9 and 10** should say `no_english_track` in both columns. They check that failures are reported correctly, not the hit rate.

## Conclusion

**Local (2026-09-25):** every video with an English track returned it in under 1.4 seconds, and the three without one said so. Row 3's track holds only sound labels, which the pipeline treats as no speech.

**Deployed:** _still to run from a preview deployment._
