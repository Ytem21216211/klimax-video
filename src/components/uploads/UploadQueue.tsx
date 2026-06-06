import { FileUploadState } from "@/hooks/useResumableUpload";
import { FileUploadProgress } from "./FileUploadProgress";
import { Button } from "@/components/ui/button";
import { Trash2, Upload } from "lucide-react";

interface UploadQueueProps {
  uploads: FileUploadState[];
  isUploading: boolean;
  onRemove: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onClearCompleted: () => void;
}

export function UploadQueue({
  uploads,
  isUploading,
  onRemove,
  onPause,
  onResume,
  onClearCompleted,
}: UploadQueueProps) {
  if (uploads.length === 0) return null;

  const completedCount = uploads.filter((u) => u.status === "complete").length;
  const pendingCount = uploads.filter((u) => u.status === "pending").length;
  const uploadingCount = uploads.filter((u) => u.status === "uploading").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;

  const totalBytes = uploads.reduce((sum, u) => sum + u.bytesTotal, 0);
  const uploadedBytes = uploads.reduce((sum, u) => sum + u.bytesUploaded, 0);
  const overallProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">
            {isUploading
              ? `Uploading ${uploadingCount} of ${uploads.length} files (${overallProgress}%)`
              : `${uploads.length} file${uploads.length > 1 ? "s" : ""} queued`}
          </span>
        </div>
        
        {completedCount > 0 && !isUploading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCompleted}
            className="h-7 text-xs"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear {completedCount} completed
          </Button>
        )}
      </div>

      {/* Status summary */}
      {(pendingCount > 0 || errorCount > 0 || completedCount > 0) && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          {pendingCount > 0 && <span>{pendingCount} pending</span>}
          {uploadingCount > 0 && <span className="text-primary">{uploadingCount} uploading</span>}
          {completedCount > 0 && <span className="text-green-500">{completedCount} complete</span>}
          {errorCount > 0 && <span className="text-destructive">{errorCount} failed</span>}
        </div>
      )}

      {/* File list */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {uploads.map((upload) => (
          <FileUploadProgress
            key={upload.id}
            upload={upload}
            onRemove={onRemove}
            onPause={onPause}
            onResume={onResume}
          />
        ))}
      </div>
    </div>
  );
}
