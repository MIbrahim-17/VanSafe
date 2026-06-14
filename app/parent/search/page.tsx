import DriverExplorer from "@/components/DriverExplorer";

export default function SearchPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-title1 text-slate-900">Search vans</h1>
        <p className="text-sm text-slate-500">
          Find vans serving your child&apos;s school and area.
        </p>
      </div>
      <DriverExplorer mode="search" />
    </div>
  );
}
