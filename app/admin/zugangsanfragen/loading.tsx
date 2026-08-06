import { TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 flex gap-2 border-b border-border pb-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-24" />
        ))}
      </div>
      <div className="mt-6">
        <TableSkeleton columns={6} />
      </div>
    </div>
  );
}
