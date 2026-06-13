import Link from "next/link";
import Reveal from "@/components/Reveal";
import {
  MapPin,
  Sparkles,
  Message,
  Alert,
  Star,
  IdCard,
  Check,
  ArrowRight,
  Shield,
  Lock,
} from "@/components/icons";

const FEATURES = [
  { Icon: MapPin, title: "Live van tracking", desc: "See exactly where the van is, updated every 30 seconds, with one-tap Google Maps." },
  { Icon: Sparkles, title: "AI van matching", desc: "Tell us your school and area — AI ranks the safest, closest, best-rated vans for you." },
  { Icon: Message, title: "WhatsApp alerts", desc: "Departure, arrival and safety alerts in English or Urdu, right where you already chat." },
  { Icon: Alert, title: "Anomaly detection", desc: "Get warned automatically if the van stops too long or takes an unusual route." },
  { Icon: Star, title: "Trusted reviews", desc: "Read AI-summarised parent reviews and verification badges before you choose." },
  { Icon: IdCard, title: "Verified drivers", desc: "Drivers upload CNIC and vehicle documents so you ride with confidence." },
];

const PARENT_POINTS = [
  "Find and compare vans by school, area and rating",
  "Track the van live and share location instantly",
  "Chat with the WhatsApp bot in English or Urdu",
  "Get proactive safety alerts automatically",
];

const DRIVER_POINTS = [
  "Build a trusted profile parents can find",
  "Share your location with one button each morning",
  "Manage passengers and grow your reputation",
  "Upload documents to earn a verified badge",
];

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
        <Check size={13} />
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function Home() {
  return (
    <div className="space-y-24 pb-12 pt-2 sm:space-y-32">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-50/70 to-transparent"
        />
        <div className="relative px-6 py-16 text-center sm:px-10 sm:py-24">
          <span className="animate-fade-up badge border border-brand-200 bg-brand-50/90 text-brand-800">
            <Shield size={14} />
            Public-service initiative · Lahore &amp; Karachi
          </span>
          <h1
            className="animate-fade-up mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Safer school van rides,{" "}
            <span className="text-brand-700">for every parent.</span>
          </h1>
          <p
            className="animate-fade-up mx-auto mt-5 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl"
            style={{ animationDelay: "160ms" }}
          >
            VanSafe helps parents find trusted van drivers, track their child&apos;s ride live,
            and get instant WhatsApp safety alerts — powered by AI.
          </p>
          <div
            className="animate-fade-up mt-9 flex flex-wrap justify-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <Link href="/register" className="btn-primary px-6 py-3 text-base shadow-sm">
              Get started — it&apos;s free
              <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="btn-ghost px-6 py-3 text-base">
              I already have an account
            </Link>
          </div>

          <div
            className="animate-fade-up mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm font-medium text-slate-500"
            style={{ animationDelay: "320ms" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Lock size={15} className="text-brand-600" /> Verified drivers
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} className="text-brand-600" /> Real-time GPS
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              <Message size={15} className="text-brand-600" /> English &amp; Urdu
            </span>
          </div>
          <p
            className="animate-fade-up mt-4 text-xs text-slate-400"
            style={{ animationDelay: "360ms" }}
          >
            Demo logins (password{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-500">password123</code>):
            sara.parent@vansafe.test · imran.driver@vansafe.test
          </p>
        </div>
      </section>

      {/* Features */}
      <section>
        <Reveal className="text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to keep children safe
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-balance text-slate-600">
            Six tools working together — from the first search to every morning ride.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="card card-hover h-full p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <f.Icon size={22} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Audience split */}
      <section>
        <Reveal className="text-center">
          <p className="eyebrow">Built for both sides</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            One platform, two journeys
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          <Reveal>
            <div className="card card-hover h-full p-8">
              <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-100">For parents</span>
              <h3 className="mt-4 text-xl font-bold text-slate-900">Peace of mind, every morning</h3>
              <ul className="mt-5 space-y-3 text-sm text-slate-600">
                {PARENT_POINTS.map((p) => (
                  <Bullet key={p}>{p}</Bullet>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={110}>
            <div className="card card-hover h-full p-8">
              <span className="badge bg-slate-100 text-slate-700 ring-1 ring-slate-200">For van drivers</span>
              <h3 className="mt-4 text-xl font-bold text-slate-900">Grow a trusted reputation</h3>
              <ul className="mt-5 space-y-3 text-sm text-slate-600">
                {DRIVER_POINTS.map((p) => (
                  <Bullet key={p}>{p}</Bullet>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Closing CTA */}
      <Reveal as="section">
        <div className="rounded-3xl bg-brand-800 px-6 py-14 text-center text-white sm:px-10 sm:py-20">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start tracking your child&apos;s ride today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-balance text-brand-100">
            Free to join. Set up in minutes — for parents and drivers alike.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="btn bg-white px-6 py-3 text-base text-brand-800 hover:bg-brand-50 focus-visible:ring-white"
            >
              Create your free account
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/parent/browse"
              className="btn border border-white/30 bg-transparent px-6 py-3 text-base text-white hover:bg-white/10 focus-visible:ring-white"
            >
              Browse vans first
            </Link>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
