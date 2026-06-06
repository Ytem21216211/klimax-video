---
description: How to deploy and test IP Pop-up Integration
---

# IP Pop-up Integration Summary

Successfully integrated the IP Pop-up feature across the full stack.

## Components Modified

1.  **Frontend (`src/pages/ProjectEditor.tsx`)**
    -   Updated `saveIpPopupSettings` to fix lint errors.
    -   Updated `processVideo` to include `ip_popup_settings` in the project update payload.
    -   Updated `process-video` invoke call to pass `ipPopupSettings`.

2.  **Backend (`supabase/functions/process-video/index.ts`)**
    -   Added `IpPopupSettings` interface.
    -   Updated `serve` handler to parse `ipPopupSettings`.
    -   Updated `processVideoInBackground` signature.
    -   Implemented logic to sign IP Popup image/SFX URLs.
    -   Added `ipPopup` to the `renderSpec` stored in `render_queue`.

3.  **GPU Worker**
    -   **`src/types.ts`**: Added `IpPopupSpec` interface to `RenderSpec`.
    -   **`src/ffmpeg/renderer.ts`**:
        -   Updated `downloadAssets` to download IP Popup images/SFX.
        -   Updated `generateSubtitleFiles` to generate `ip_popup.ass`.
        -   Updated `buildCommand` to include IP Popup assets as inputs, add filter complex for image overlays, and apply subtitle layer.
        -   Updated `calculateAudioInputIndices` and `buildAudioFilterChain` calls.
    -   **`src/ffmpeg/subtitles.ts`**: Currently implemented `generateIpPopupSubtitles` function to create ASS file for IP Popup text (with positioning, styling, glowing/stroke).
    -   **`src/ffmpeg/audio.ts`**: Updated `calculateAudioInputIndices` and `buildAudioFilterChain` to handle IP Popup SFX mixing with correct delay.

## Verification Steps

1.  **Frontend**: Open a project, configure IP Pop-up (Text, Image 1/2, SFX), save. Click "Generate Video".
    -   Verify toast "Project updated" appears.
    -   Verify network request to `process-video` contains `ipPopupSettings`.

2.  **Backend**: Check Supabase logs for `process-video`.
    -   Look for `ipPopupSettings: enabled=true`.
    -   Look for `Queueing render job...` and verify `spec.ipPopup` is populated in the database `render_queue` table.

3.  **Worker**: Check Worker logs.
    -   Look for `[FFmpeg] Downloading assets...` including `ip_popup_image1`, etc.
    -   Look for `[FFmpeg] IP Popup layer: generated`.
    -   Verify output video contains:
        -   Text at specified % position.
        -   Images at specified % positions.
        -   SFX played at start time.

## Notes
-   IP Popup text uses ASS subtitles for high-quality styling (outline, shadow, blur).
-   Images are overlayed using FFmpeg filter complex.
-   SFX is mixed into audio track.
