import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";

export const Route = createFileRoute("/organizer")({
  component: OrganizerLayout,
});

function OrganizerLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar role="organizer" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardHeader role="organizer" />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
