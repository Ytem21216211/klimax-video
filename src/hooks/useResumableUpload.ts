import { useState, useCallback, useRef } from "react";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

export type UploadStatus = "pending" | "uploading" | "paused" | "complete" | "error";

export interface FileUploadState {
  id: string;
  file: File;
  bucket: "video-clips" | "voiceovers";
  storagePath: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  bytesUploaded: number;
  bytesTotal: number;
  /** Duration in seconds (for video/audio files) */
  duration?: number;
}

/**
 * Extracts duration from a video or audio file using HTML5 media elements.
 */
async function getMediaDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    const el = isVideo ? document.createElement("video") : document.createElement("audio");
    el.preload = "metadata";

    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const dur = el.duration;
      resolve(Number.isFinite(dur) ? dur : undefined);
    };

    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };

    el.src = url;
  });
}

interface UseResumableUploadOptions {
  projectId: string;
  /** If true, files start uploading immediately when added */
  autoUpload?: boolean;
  onAllComplete?: (uploads: FileUploadState[]) => void;
  onError?: (error: Error, upload: FileUploadState) => void;
}

export function useResumableUpload({ projectId, autoUpload = false, onAllComplete, onError }: UseResumableUploadOptions) {
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const tusUploadsRef = useRef<Map<string, tus.Upload>>(new Map());
  const completedRef = useRef<Set<string>>(new Set());
  const startUploadRef = useRef<((upload: FileUploadState) => Promise<void>) | null>(null);

  const updateUpload = useCallback((id: string, updates: Partial<FileUploadState>) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
    );
  }, []);

  const addFiles = useCallback(
    async (
      files: File[],
      bucket: "video-clips" | "voiceovers"
    ): Promise<FileUploadState[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Extract durations for all files in parallel
      const durations = await Promise.all(files.map((f) => getMediaDuration(f)));

      const newUploads: FileUploadState[] = files.map((file, idx) => {
        const id = `${Date.now()}_${idx}_${file.name}`;
        const storagePath = `${user.id}/${projectId}/${id}`;
        return {
          id,
          file,
          bucket,
          storagePath,
          progress: 0,
          status: "pending" as UploadStatus,
          bytesUploaded: 0,
          bytesTotal: file.size,
          duration: durations[idx],
        };
      });

      setUploads((prev) => [...prev, ...newUploads]);

      // If autoUpload is enabled, start uploading immediately
      if (autoUpload && startUploadRef.current) {
        setIsUploading(true);
        const CONCURRENCY = 3;

        // Start uploads in batches
        (async () => {
          try {
            for (let i = 0; i < newUploads.length; i += CONCURRENCY) {
              const batch = newUploads.slice(i, i + CONCURRENCY);
              await Promise.allSettled(batch.map((u) => startUploadRef.current!(u)));
            }

            // Check if all uploads are complete
            setUploads((currentUploads) => {
              const allComplete = currentUploads.every((u) => u.status === "complete");
              if (allComplete && onAllComplete) {
                onAllComplete(currentUploads);
              }
              return currentUploads;
            });
          } finally {
            setUploads((currentUploads) => {
              const stillUploading = currentUploads.some((u) => u.status === "uploading");
              if (!stillUploading) {
                setIsUploading(false);
              }
              return currentUploads;
            });
          }
        })();
      }

      return newUploads;
    },
    [projectId, autoUpload, onAllComplete]
  );

  const removeFile = useCallback((id: string) => {
    // Abort if uploading
    const tusUpload = tusUploadsRef.current.get(id);
    if (tusUpload) {
      tusUpload.abort();
      tusUploadsRef.current.delete(id);
    }
    setUploads((prev) => prev.filter((u) => u.id !== id));
    completedRef.current.delete(id);
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status !== "complete"));
    completedRef.current.clear();
  }, []);

  const startUpload = useCallback(
    async (upload: FileUploadState): Promise<void> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      return new Promise((resolve, reject) => {
        const tusUpload = new tus.Upload(upload.file, {
          endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: supabaseKey,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: upload.bucket,
            objectName: upload.storagePath,
            contentType: upload.file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          chunkSize: 6 * 1024 * 1024, // 6MB chunks for reliability
          onError: (error) => {
            console.error("TUS upload error:", error);

            let errorMessage = error.message;
            if (error.originalRequest?.status === 413 || error.message.includes("413") || error.message.includes("Maximum size exceeded")) {
              errorMessage = "File too large. Please go to your Supabase Dashboard > Storage > [Bucket Name] > Configuration and increase the 'Max file size' limit (e.g. to 1GB).";
            }

            updateUpload(upload.id, {
              status: "error",
              error: errorMessage,
            });
            onError?.(new Error(errorMessage), upload);
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const progress = Math.round((bytesUploaded / bytesTotal) * 100);
            updateUpload(upload.id, {
              progress,
              bytesUploaded,
              bytesTotal,
              status: "uploading",
            });
          },
          onSuccess: () => {
            updateUpload(upload.id, {
              progress: 100,
              status: "complete",
              bytesUploaded: upload.bytesTotal,
            });
            completedRef.current.add(upload.id);
            tusUploadsRef.current.delete(upload.id);
            resolve();
          },
        });

        tusUploadsRef.current.set(upload.id, tusUpload);
        updateUpload(upload.id, { status: "uploading" });

        // Check for previous uploads and resume if possible
        tusUpload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length > 0) {
            console.log(`Resuming upload for ${upload.file.name}`);
            tusUpload.resumeFromPreviousUpload(previousUploads[0]);
          }
          tusUpload.start();
        });
      });
    },
    [updateUpload, onError]
  );

  // Keep the ref updated so addFiles can use startUpload
  startUploadRef.current = startUpload;

  const pauseUpload = useCallback((id: string) => {
    const tusUpload = tusUploadsRef.current.get(id);
    if (tusUpload) {
      tusUpload.abort();
      updateUpload(id, { status: "paused" });
    }
  }, [updateUpload]);

  const resumeUpload = useCallback(
    async (id: string) => {
      const upload = uploads.find((u) => u.id === id);
      if (!upload) return;

      const tusUpload = tusUploadsRef.current.get(id);
      if (tusUpload) {
        updateUpload(id, { status: "uploading" });
        tusUpload.start();
      } else {
        // Re-create the upload if it was cleared
        await startUpload(upload);
      }
    },
    [uploads, startUpload, updateUpload]
  );

  const uploadAll = useCallback(async (): Promise<FileUploadState[]> => {
    const pendingUploads = uploads.filter(
      (u) => u.status === "pending" || u.status === "paused" || u.status === "error"
    );

    if (pendingUploads.length === 0) {
      onAllComplete?.(uploads.filter((u) => u.status === "complete"));
      return uploads;
    }

    setIsUploading(true);
    completedRef.current.clear();

    try {
      // Upload in parallel with concurrency limit
      const CONCURRENCY = 3;
      const results: FileUploadState[] = [];

      for (let i = 0; i < pendingUploads.length; i += CONCURRENCY) {
        const batch = pendingUploads.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map((u) => startUpload(u)));
      }

      // Get final state
      const finalUploads = uploads.map((u) => ({
        ...u,
        status: completedRef.current.has(u.id) ? ("complete" as UploadStatus) : u.status,
      }));

      const completedUploads = finalUploads.filter((u) => u.status === "complete");
      onAllComplete?.(completedUploads);
      return finalUploads;
    } finally {
      setIsUploading(false);
    }
  }, [uploads, startUpload, onAllComplete]);

  const reset = useCallback(() => {
    // Abort all active uploads
    tusUploadsRef.current.forEach((upload) => upload.abort());
    tusUploadsRef.current.clear();
    completedRef.current.clear();
    setUploads([]);
    setIsUploading(false);
  }, []);

  return {
    uploads,
    isUploading,
    addFiles,
    removeFile,
    clearCompleted,
    pauseUpload,
    resumeUpload,
    uploadAll,
    reset,
  };
}
