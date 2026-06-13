import type { Driver } from "@/lib/types";

export default function TrustBadges({ driver }: { driver: Driver }) {
  return (
    <div className="flex flex-wrap gap-2">
      {driver.verified && (
        <span className="badge bg-indigo-100 text-indigo-700">✔ VanSafe Verified</span>
      )}
      {driver.cnic_url ? (
        <span className="badge bg-emerald-100 text-emerald-700">🪪 CNIC uploaded</span>
      ) : (
        <span className="badge bg-slate-100 text-slate-500">CNIC not uploaded</span>
      )}
      {driver.vehicle_doc_url ? (
        <span className="badge bg-emerald-100 text-emerald-700">📄 Vehicle docs uploaded</span>
      ) : (
        <span className="badge bg-slate-100 text-slate-500">Vehicle docs not uploaded</span>
      )}
    </div>
  );
}
