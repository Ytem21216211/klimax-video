import { CustomAnimationTrack, Keyframe } from "@/gpu-worker/src/types";

const TICKS_PER_SECOND = 254016000000;

export function parsePrfpset(xmlString: string): CustomAnimationTrack[] | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // 1. Find the FilterPreset and its AnchorInPoint
    const filterPreset = xmlDoc.getElementsByTagName("FilterPreset")[0];
    if (!filterPreset) return null;

    const anchorInPoint = parseInt(filterPreset.getElementsByTagName("AnchorInPoint")[0]?.textContent || "0");

    // 2. Map properties
    const tracks: CustomAnimationTrack[] = [];
    const params = xmlDoc.getElementsByTagName("VideoComponentParam");

    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const name = param.getElementsByTagName("Name")[0]?.textContent || "";
      const keyframesStr = param.getElementsByTagName("Keyframes")[0]?.textContent || "";

      if (!keyframesStr) continue;

      let property: 'scale' | 'rotation' | 'opacity' | 'position' | 'x' | 'y' | null = null;
      if (name.includes("Scale")) property = 'scale';
      else if (name.includes("Rotation")) property = 'rotation';
      else if (name.includes("Opacity")) property = 'opacity';
      else if (name.includes("Position")) property = 'position';

      if (!property) continue;

      const keyframes = parseKeyframes(keyframesStr, anchorInPoint);
      if (keyframes.length > 0) {
        if (typeof keyframes[0].value === 'string' && keyframes[0].value.includes(':')) {
          // Split into x and y tracks
          const xKfs = keyframes.map(k => ({ ...k, value: parseFloat((k.value as string).split(':')[0]) }));
          const yKfs = keyframes.map(k => ({ ...k, value: parseFloat((k.value as string).split(':')[1]) }));
          tracks.push({ property: 'x', keyframes: xKfs });
          tracks.push({ property: 'y', keyframes: yKfs });
        } else {
          tracks.push({ property, keyframes });
        }
      }
    }

    // 3. Normalize timings (Premiere presets often have absolute sequence times)
    let minTime = Infinity;
    tracks.forEach(t => {
      t.keyframes.forEach(kf => {
        if (kf.time < minTime) minTime = kf.time;
      });
    });

    if (minTime !== Infinity && minTime > 0) {
      tracks.forEach(t => {
        t.keyframes.forEach(kf => {
          kf.time = Math.max(0, kf.time - minTime);
        });
      });
    }

    return tracks.length > 0 ? tracks : null;
  } catch (error) {
    console.error("[PrfpsetParser] Error parsing XML:", error);
    return null;
  }
}

function parseKeyframes(keyframesStr: string, anchorInPoint: number): Keyframe[] {
  const result: Keyframe[] = [];
  const entries = keyframesStr.split(";").filter(e => e.trim().length > 0);

  for (const entry of entries) {
    const parts = entry.split(",");
    if (parts.length < 2) continue;

    const ticks = parseInt(parts[0]);
    let value: number | string = parts[1];
    if (!value.includes(':')) {
      value = parseFloat(value);
    }
    const interpCode = parts[2];

    const time = (ticks - anchorInPoint) / TICKS_PER_SECOND;
    
    // Map interpolation code
    let interpolation: 'linear' | 'hold' | 'bezier' = 'linear';
    if (interpCode === "5") interpolation = 'bezier';
    else if (interpCode === "1") interpolation = 'hold';

    result.push({
      time: Math.max(0, time),
      value,
      interpolation
    });
  }

  return result.sort((a, b) => a.time - b.time);
}
