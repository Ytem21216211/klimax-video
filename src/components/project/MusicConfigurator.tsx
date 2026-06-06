import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Music, Play, Pause, Volume2, Clock, Upload, Trash2, Plus, Save, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import WaveSurfer from "wavesurfer.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface MusicSettings {
  enabled: boolean;
  selected_music_id: string | null;
  volume: number; // 0-100
  start_time: number; // seconds
  // Music 2
  music2_enabled?: boolean;
  music2_id?: string | null;
  music2_volume?: number;
  music2_start_time?: number;
  music2_crossfade_at?: number;
  music2_ai_optimized?: boolean;
  remove_silence?: boolean; // VO silence removal toggle
}

export const defaultMusicSettings: MusicSettings = {
  enabled: false,
  selected_music_id: null,
  volume: 30,
  start_time: 0,
  music2_enabled: false,
  music2_id: null,
  music2_volume: 30,
  music2_start_time: 0,
  music2_ai_optimized: true,
  remove_silence: true,
};

interface MusicTrack {
  id: string;
  name: string;
  file_url: string;
  duration: number | null;
  bpm: number | null;
  genre: string | null;
}

interface MusicConfiguratorProps {
  settings: MusicSettings;
  onSettingsChange: (settings: MusicSettings) => void;
  projectId: string;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

export const MusicConfigurator: React.FC<MusicConfiguratorProps> = ({
  settings,
  onSettingsChange,
  projectId,
  onSave,
  isSaving = false,
}) => {
  const [musicLibrary, setMusicLibrary] = useState<MusicTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [localStartTime, setLocalStartTime] = useState(settings.start_time);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [waveformReady, setWaveformReady] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<"music1" | "music2">("music1");

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local start time with settings
  useEffect(() => {
    setLocalStartTime(settings.start_time);
  }, [settings.start_time]);

  // Fetch music library
  useEffect(() => {
    const fetchMusicLibrary = async () => {
      const { data, error } = await supabase
        .from("music_library")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching music library:", error);
        return;
      }
      setMusicLibrary(data || []);
    };

    fetchMusicLibrary();
  }, []);

  // Find selected track and get signed URL when settings change
  useEffect(() => {
    const loadTrackWithSignedUrl = async () => {
      if (settings.selected_music_id) {
        const track = musicLibrary.find(m => m.id === settings.selected_music_id);
        setSelectedTrack(track || null);

        if (track) {
          const filePath = track.file_url;
          if (filePath) {
            // Robust path extraction: handle various possible URL formats
            let storagePath = filePath;
            if (filePath.includes('/storage/v1/object/public/')) {
              // Extract everything after the bucket name
              const parts = filePath.split('/storage/v1/object/public/');
              if (parts.length > 1) {
                const bucketAndPath = parts[1].split('/');
                // If it was public/music/file.mp3, bucket is 'music', path is 'file.mp3'
                // BUT we know music is now in voiceovers/music/
                if (bucketAndPath[0] === 'music') {
                  storagePath = `music/${bucketAndPath.slice(1).join('/')}`;
                } else {
                  storagePath = bucketAndPath.slice(1).join('/');
                }
              }
            }

            // Try 'voiceovers' bucket first as per latest migration
            const { data, error } = await supabase.storage
              .from('voiceovers')
              .createSignedUrl(storagePath, 3600);

            if (data && !error) {
              setSignedAudioUrl(data.signedUrl);
            } else {
              // Fallback to 'music' bucket just in case
              const { data: musicData, error: musicError } = await supabase.storage
                .from('voiceovers')
                .createSignedUrl(storagePath.replace('music/', ''), 3600);

              if (musicData && !musicError) {
                setSignedAudioUrl(musicData.signedUrl);
              } else {
                console.warn('[Music] Failed to sign URL in both buckets:', error || musicError);
                setSignedAudioUrl(null);
              }
            }
          }
        }
      } else {
        setSelectedTrack(null);
        setSignedAudioUrl(null);
      }
    };

    loadTrackWithSignedUrl();
  }, [settings.selected_music_id, musicLibrary]);

  // Initialize WaveSurfer when signed URL is available - NO dependency on start_time to avoid reinitialization
  useEffect(() => {
    if (!waveformRef.current || !selectedTrack || !signedAudioUrl) return;

    setWaveformReady(false);

    // Cleanup previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "hsl(var(--muted-foreground))",
      progressColor: "hsl(var(--primary))",
      cursorColor: "hsl(var(--accent))",
      cursorWidth: 2,
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });

    ws.load(signedAudioUrl);

    ws.on("ready", () => {
      const audioDuration = ws.getDuration();
      setDuration(audioDuration);
      setWaveformReady(true);
      // Set initial position based on current local start time
      if (localStartTime > 0 && audioDuration > 0) {
        ws.seekTo(Math.min(localStartTime / audioDuration, 1));
      }
    });

    ws.on("audioprocess", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("seeking", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("finish", () => {
      setIsPlaying(false);
    });

    // Use interaction event for smooth dragging - only update local state
    ws.on("interaction", () => {
      const newTime = ws.getCurrentTime();
      setLocalStartTime(Math.round(newTime * 10) / 10);
    });

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [signedAudioUrl]); // Only reinitialize when audio URL changes

  // Update volume when settings change
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(settings.volume / 100);
    }
  }, [settings.volume]);

  const updateSetting = useCallback(<K extends keyof MusicSettings>(
    key: K,
    value: MusicSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  }, [settings, onSettingsChange]);

  // Commit local start time to settings when user stops interacting
  const commitStartTime = useCallback(() => {
    if (localStartTime !== settings.start_time) {
      updateSetting("start_time", localStartTime);
    }
  }, [localStartTime, settings.start_time, updateSetting]);

  const handleTrackSelect = (trackId: string) => {
    // Update both values at once to avoid state batching issues
    onSettingsChange({
      ...settings,
      selected_music_id: trackId,
      start_time: 0
    });
    setLocalStartTime(0);
  };

  const togglePlayPreview = () => {
    if (!wavesurferRef.current) return;

    if (isPlaying) {
      wavesurferRef.current.pause();
      setIsPlaying(false);
    } else {
      // Start from the selected start_time
      if (duration > 0) {
        wavesurferRef.current.seekTo(localStartTime / duration);
      }
      wavesurferRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      toast.error("Please upload an audio file");
      return;
    }

    if (!uploadName.trim()) {
      toast.error("Please enter a name for the track");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get audio duration
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      await new Promise((resolve) => {
        audio.onloadedmetadata = resolve;
      });
      const audioDuration = audio.duration;

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `music/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from("voiceovers")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("voiceovers")
        .getPublicUrl(fileName);

      // Add to music library
      const { data: newTrack, error: insertError } = await supabase
        .from("music_library")
        .insert({
          name: uploadName.trim(),
          file_url: publicUrl,
          duration: audioDuration,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setMusicLibrary(prev => [newTrack, ...prev]);
      setUploadName("");
      setIsAddDialogOpen(false);
      toast.success("Music track added!");

      // Auto-select the new track
      if (uploadTarget === "music1") {
        handleTrackSelect(newTrack.id);
        updateSetting("enabled", true);
      } else {
        updateSetting("music2_id", newTrack.id);
        updateSetting("music2_enabled", true);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload music");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    const { error } = await supabase
      .from("music_library")
      .delete()
      .eq("id", trackId);

    if (error) {
      toast.error("Failed to delete track");
      return;
    }

    setMusicLibrary(prev => prev.filter(t => t.id !== trackId));
    if (settings.selected_music_id === trackId) {
      updateSetting("selected_music_id", null);
    }
    toast.success("Track deleted");
  };

  const handleSave = async () => {
    // Commit any pending start time changes first
    if (localStartTime !== settings.start_time) {
      onSettingsChange({ ...settings, start_time: localStartTime });
    }
    if (onSave) {
      await onSave();
    }
  };

  return (
    <Card className="rgb-border-card overflow-hidden group hover:shadow-lg hover:shadow-accent/10 transition-all duration-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-lg">
            <div className="relative p-2 rounded-lg bg-accent/10">
              <Music className="w-5 h-5 text-accent relative z-10" />
              <div className="absolute inset-0 bg-accent/30 blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span>Background Music</span>
          </CardTitle>
          <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-accent">Auto-Silence</span>
              <Switch
                checked={settings.remove_silence}
                onCheckedChange={(checked) => updateSetting("remove_silence", checked)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {settings.enabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => updateSetting("enabled", checked)}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      {settings.enabled && (
        <CardContent className="space-y-6">
          {/* Track Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Select Track</Label>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setUploadTarget("music1");
                    setIsAddDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Music
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Music Track</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Track Name</Label>
                      <Input
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        placeholder="e.g., Epic Gaming Beat"
                      />
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || !uploadName.trim()}
                      className="w-full"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "Uploading..." : "Upload Audio File"}
                    </Button>
                    {uploadTarget === 'music2' && (
                       <p className="text-[10px] text-muted-foreground italic text-center">
                        This track will be automatically set as your Second Music Track
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Select
              value={settings.selected_music_id || ""}
              onValueChange={handleTrackSelect}
            >
              <SelectTrigger className="bg-muted/30">
                <SelectValue placeholder="Choose a track..." />
              </SelectTrigger>
              <SelectContent>
                {musicLibrary.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{track.name}</span>
                      {track.duration && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatTime(track.duration)}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Waveform & Timeline */}
          {selectedTrack && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Start Time
                  </Label>
                  <span className="text-sm font-mono text-muted-foreground">
                    {formatTime(localStartTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Waveform container */}
                <div
                  className="relative rounded-xl overflow-hidden bg-muted/30 border border-border/50 p-4"
                  onMouseUp={commitStartTime}
                  onMouseLeave={commitStartTime}
                >
                  <div ref={waveformRef} className="w-full" />

                  {/* Loading indicator */}
                  {!waveformReady && signedAudioUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {/* Start time indicator */}
                  {duration > 0 && waveformReady && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-green-500 pointer-events-none transition-[left] duration-75"
                      style={{ left: `calc(1rem + ${(localStartTime / duration) * (100 - 2)}%)` }}
                    >
                      <div className="absolute top-3 -left-2 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Click or drag on the waveform to set start time
                  </p>
                </div>

                {/* Start time slider for fine control */}
                <Slider
                  value={[localStartTime]}
                  onValueChange={([v]) => setLocalStartTime(v)}
                  onValueCommit={([v]) => updateSetting("start_time", v)}
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  className="w-full"
                />
              </div>

              {/* Volume Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    Volume
                  </Label>
                  <span className="text-sm font-mono text-muted-foreground">
                    {settings.volume}%
                  </span>
                </div>
                <Slider
                  value={[settings.volume]}
                  onValueChange={([v]) => updateSetting("volume", v)}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Preview Button */}
              <Button
                onClick={togglePlayPreview}
                className="w-full"
                variant={isPlaying ? "secondary" : "default"}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Stop Preview
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Preview Music
                  </>
                )}
              </Button>

              {/* Save Settings Button */}
              {onSave && (
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full"
                  variant="secondary"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Music Settings
                    </>
                  )}
                </Button>
              )}

              {/* Delete Track Option */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteTrack(selectedTrack.id)}
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove from Library
              </Button>

              <div className="h-px bg-border my-6" />

              {/* Music 2 Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-accent/5 border border-accent/20">
                <Label className="flex flex-col gap-1">
                  <span className="font-medium">Add Second Track</span>
                  <span className="text-xs text-muted-foreground">Crossfade between two different tracks</span>
                </Label>
                <Switch
                  checked={settings.music2_enabled}
                  onCheckedChange={(checked) => updateSetting("music2_enabled", checked)}
                />
              </div>

              {settings.music2_enabled && (
                <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-4 duration-300">
                  {/* Track 2 Selection */}
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">Second Track</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-xs text-accent hover:bg-accent/10"
                        onClick={() => {
                          setUploadTarget("music2");
                          setIsAddDialogOpen(true);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Import from PC
                      </Button>
                    </div>
                    <Select
                      value={settings.music2_id || ""}
                      onValueChange={(v) => updateSetting("music2_id", v)}
                    >
                      <SelectTrigger className="bg-muted/30">
                        <SelectValue placeholder="Choose second track..." />
                      </SelectTrigger>
                      <SelectContent>
                        {musicLibrary.map((track) => (
                          <SelectItem key={track.id} value={track.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{track.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                  {/* AI Optimization Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-accent" />
                        AI Clip Boundary Sync
                      </Label>
                      <span className="text-[10px] text-muted-foreground italic">
                        Highly recommended for professional cuts
                      </span>
                    </div>
                    <Switch
                      checked={settings.music2_ai_optimized}
                      onCheckedChange={(checked) => updateSetting("music2_ai_optimized", checked)}
                    />
                  </div>

                  {/* Crossfade Point Slider (Disabled if AI is on, but shows target) */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label className="text-sm">Transition Point</Label>
                      <span className="text-xs text-muted-foreground">Approx. {settings.music2_crossfade_at || 50}% into video</span>
                    </div>
                    <Slider
                      value={[settings.music2_crossfade_at || 50]}
                      onValueChange={([v]) => updateSetting("music2_crossfade_at", v)}
                      min={10}
                      max={90}
                      step={1}
                      disabled={settings.music2_ai_optimized}
                    />
                  </div>

                  {/* Volume 2 */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label className="text-sm">Volume (Track 2)</Label>
                      <span className="text-xs text-muted-foreground">{settings.music2_volume}%</span>
                    </div>
                    <Slider
                      value={[settings.music2_volume || 30]}
                      onValueChange={([v]) => updateSetting("music2_volume", v)}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
};
