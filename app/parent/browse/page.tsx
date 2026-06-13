import DriverExplorer from "@/components/DriverExplorer";

export default function BrowsePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Browse vans</h1>
        <p className="text-sm text-slate-500">Filter and sort every van on VanSafe.</p>
      </div>
      <DriverExplorer mode="browse" />
    </div>
  );
}
