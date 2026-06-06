import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ProjectLike = {
  status?: string | null;
  render_progress?: number | null;
  last_error?: string | null;
  output_url?: string | null;
};

function getStatusStyles(status?: string | null) {
  switch (status) {
    case "completed":
      return "bg-primary/15 text-primary";
    case "processing":
    case "rendering":
    case "queued":
    case "pending":
      return "bg-accent/15 text-accent";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "uploaded":
      return "bg-secondary/20 text-secondary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function ProjectStatus({ project }: { project: ProjectLike }) {
  const status = project?.status || "draft";
  const progress = typeof project?.render_progress === "number" ? project.render_progress : 0;
  const hasProgress = ["processing", "rendering", "queued", "pending"].includes(status || "");
  const hasError = status === "failed" && !!project?.last_error;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", getStatusStyles(status))}>
          {status}
        </span>
        {hasProgress ? (
          <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
        ) : null}
      </div>

      {hasProgress ? <Progress value={progress} className="h-2" /> : null}

      {hasError ? (
        <p className="text-xs text-destructive break-words max-h-10 overflow-hidden">
          {project.last_error}
        </p>
      ) : status === "completed" && project?.output_url ? (
        <p className="text-xs text-muted-foreground">Ready to preview & download</p>
      ) : null}
    </div>
  );
}
