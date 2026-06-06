import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gamepad2 } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => {
  return (
    <Card className="glass-effect">
      <CardContent className="py-12 text-center">
        <Gamepad2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4 max-w-md mx-auto">
          {description}
        </p>
        <Button onClick={onAction}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
};
