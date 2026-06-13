import type { Driver } from "@/lib/types";
import { Shield, IdCard, FileCheck } from "./icons";

export default function TrustBadges({ driver }: { driver: Driver }) {
  return (
    <div className="flex flex-wrap gap-2">
      {driver.verified && (
        <span className="badge bg-brand-100 text-brand-800">
          <Shield size={13} /> VanSafe Verified
        </span>
      )}
      {driver.cnic_url ? (
        <span className="badge bg-emerald-100 text-emerald-700">
          <IdCard size={13} /> CNIC uploaded
        </span>
      ) : (
        <span className="badge bg-slate-100 text-slate-500">CNIC not uploaded</span>
      )}
      {driver.vehicle_doc_url ? (
        <span className="badge bg-emerald-100 text-emerald-700">
          <FileCheck size={13} /> Vehicle docs uploaded
        </span>
      ) : (
        <span className="badge bg-slate-100 text-slate-500">Vehicle docs not uploaded</span>
      )}
    </div>
  );
}
