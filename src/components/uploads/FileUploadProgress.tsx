import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileUploadState, UploadStatus } from "@/hooks/useResumableUpload";
import { Video, Mic, X, Pause, Play, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProgressProps {
  upload: FileUploadState;
  onRemove: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const StatusIcon = ({ status, bucket }: { status: UploadStatus; bucket: string }) => {
  const iconClass = "w-4 h-4";
  
  switch (status) {
    case "uploading":
      return <Loader2 className={cn(iconClass, "text-primary animate-spin")} />;
    case "complete":
      return <CheckCircle2 className={cn(iconClass, "text-green-500")} />;
    case "error":
      return <AlertCircle className={cn(iconClass, "text-destructive")} />;
    case "paused":
      return <Pause className={cn(iconClass, "text-yellow-500")} />;
    default:
      return bucket === "video-clips" ? (
        <Video className={cn(iconClass, "text-primary")} />
      ) : (
        <Mic className={cn(iconClass, "text-secondary")} />
      );
  }
};

export function FileUploadProgress({
  upload,
  onRemove,
  onPause,
  onResume,
}: FileUploadProgressProps) {
  const { id, file, bucket, progress, status, bytesUploaded, bytesTotal, error } = upload;

  const isActive = status === "uploading";
  const isPaused = status === "paused";
  const isComplete = status === "complete";
  const hasError = status === "error";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 rounded-lg border transition-colors",
        isComplete && "bg-green-500/5 border-green-500/30",
        hasError && "bg-destructive/5 border-destructive/30",
        isPaused && "bg-yellow-500/5 border-yellow-500/30",
        !isComplete && !hasError && !isPaused && "bg-muted/50 border-border"
      )}
    >
      <div className="flex items-center gap-3">
        <StatusIcon status={status} bucket={bucket} />
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {isActive || isPaused
              ? `${formatBytes(bytesUploaded)} / ${formatBytes(bytesTotal)}`
              : isComplete
              ? formatBytes(bytesTotal)
              : hasError
              ? error || "Upload failed"
              : formatBytes(bytesTotal)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onPause(id)}
              title="Pause upload"
            >
              <Pause className="w-3.5 h-3.5" />
            </Button>
          )}
          
          {(isPaused || hasError) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onResume(id)}
              title="Resume upload"
            >
              <Play className="w-3.5 h-3.5" />
            </Button>
          )}
          
          {!isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(id)}
              title="Remove"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {(isActive || isPaused) && (
        <div className="flex items-center gap-2">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="text-xs font-medium tabular-nums w-10 text-right">
            {progress}%
          </span>
        </div>
      )}
    </div>
  );
}
