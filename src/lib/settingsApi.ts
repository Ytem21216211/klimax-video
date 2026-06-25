// Typed client for the local-backend settings endpoints (API keys for
// Whisper transcription and b-roll intelligence). The server NEVER returns
// the raw secret value after the user has saved it — only a mask and a
// `hasKey` boolean. The "show" toggle on the page just unmasks locally.

import { LOCAL_KLIMAX_API } from "./localKlimaxApi";

export type SettingsSectionView = {
  apiKeyMasked: string;
  hasKey: boolean;
  model: string;
};

export type SettingsView = {
  whisper: SettingsSectionView;
  brollIntelligence: SettingsSectionView;
  imageGen: SettingsSectionView & { provider: string };
};

export type SettingsSectionPatch = {
  apiKey?: string;
  model?: string;
  provider?: string;
};

export type SettingsPatch = {
  whisper?: SettingsSectionPatch;
  brollIntelligence?: SettingsSectionPatch;
  imageGen?: SettingsSectionPatch;
};

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const settingsApi = {
  async get(): Promise<SettingsView> {
    return parse<SettingsView>(await fetch(`${LOCAL_KLIMAX_API}/api/settings`));
  },
  async update(patch: SettingsPatch): Promise<SettingsView> {
    return parse<SettingsView>(
      await fetch(`${LOCAL_KLIMAX_API}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
    );
  },
  async testWhisper(): Promise<{ ok: boolean; error?: string; model?: string }> {
    return parse(await fetch(`${LOCAL_KLIMAX_API}/api/settings/test/whisper`, { method: "POST" }));
  },
  async testBrollIntelligence(): Promise<{ ok: boolean; error?: string; model?: string }> {
    return parse(await fetch(`${LOCAL_KLIMAX_API}/api/settings/test/broll-intelligence`, { method: "POST" }));
  },
  async testImageGen(): Promise<{ ok: boolean; error?: string; model?: string; provider?: string }> {
    return parse(await fetch(`${LOCAL_KLIMAX_API}/api/settings/test/image-gen`, { method: "POST" }));
  },
};
