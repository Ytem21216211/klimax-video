import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

const StorageLimitWarning = () => {
  return (
    <Alert className="mb-6">
      <Info className="h-4 w-4 text-muted-foreground" />
      <AlertTitle>Upload limit: 2GB per file</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-sm text-foreground">
          You can upload video and audio files up to 2GB each. Files are uploaded to storage and then linked to your
          project in the database when you click “Generate Video”.
        </p>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>• If an upload fails, try a smaller clip or lower bitrate export</p>
          <p>• Keep this tab open until uploads finish</p>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default StorageLimitWarning;
