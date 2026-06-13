import Link from "next/link";

const FEATURES = [
  { icon: "📍", title: "Live van tracking", desc: "See exactly where the van is, updated every 30 seconds, with one-tap Google Maps." },
  { icon: "🤖", title: "AI van matching", desc: "Tell us your school and area — AI ranks the safest, closest, best-rated vans for you." },
  { icon: "💬", title: "WhatsApp alerts", desc: "Departure, arrival and safety alerts in English or Urdu, right where you already chat." },
  { icon: "🛡️", title: "Anomaly detection", desc: "Get warned automatically if the van stops too long or takes an unusual route." },
  { icon: "⭐", title: "Trusted reviews", desc: "Read AI-summarised parent reviews and verification badges before you choose." },
  { icon: "🪪", title: "Verified drivers", desc: "Drivers upload CNIC and vehicle documents so you ride with confidence." },
];

export default function Home() {
  return (
    <div className="space-y-16 py-6">
      <section className="text-center">
        <span className="badge bg-indigo-100 text-indigo-700">Civic Innovation Hackathon</span>
        <h1 className="mt-4 text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Safer school van rides,{" "}
          <span className="text-indigo-600">for every parent.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-slate-600">
          VanSafe helps parents find trusted van drivers, track their child&apos;s ride live, and
          get instant WhatsApp safety alerts — powered by AI.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            Get started — it&apos;s free
          </Link>
          <Link href="/login" className="btn-ghost px-6 py-3 text-base">
            I already have an account
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Demo logins (password <code>password123</code>): sara.parent@vansafe.test ·
          imran.driver@vansafe.test
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{f.desc}</p>
          </div>
        ))}
      </section>

      <section className="card grid gap-6 p-8 sm:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">For parents</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>✓ Find and compare vans by school, area and rating</li>
            <li>✓ Track the van live and share location instantly</li>
            <li>✓ Chat with the WhatsApp bot in English or Urdu</li>
            <li>✓ Get proactive safety alerts automatically</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">For van drivers</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>✓ Build a trusted profile parents can find</li>
            <li>✓ Share your location with one button each morning</li>
            <li>✓ Manage passengers and grow your reputation</li>
            <li>✓ Upload documents to earn a verified badge</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
