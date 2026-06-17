import { Message } from "@/components/icons";

/**
 * Opens WhatsApp with a message pre-addressed to the VanSafe Twilio sandbox bot,
 * pre-filled with the sandbox join code so the very first tap also joins the
 * sandbox. Number + code are overridable via env for non-demo setups.
 *
 * Twilio sandbox default number is +1 415 523 8886; the join code is per-account
 * (e.g. "join highway-leather").
 */
const SANDBOX_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_SANDBOX_NUMBER || "14155238886";
const JOIN_CODE = process.env.NEXT_PUBLIC_WHATSAPP_JOIN_CODE || "join highway-leather";

export default function WhatsAppBotButton({ className = "" }: { className?: string }) {
  const href = `https://wa.me/${SANDBOX_NUMBER}?text=${encodeURIComponent(JOIN_CODE)}`;
  const prettyNumber = `+${SANDBOX_NUMBER}`.replace(
    /^\+(\d)(\d{3})(\d{3})(\d{4})$/,
    "+$1 $2 $3 $4"
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-3 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 p-3 transition hover:bg-[#25D366]/15 ${className}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white">
        <Message size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">
          Chat with the bot on real WhatsApp
        </span>
        <span className="block text-xs text-slate-500">
          Opens {prettyNumber} and sends &ldquo;{JOIN_CODE}&rdquo; to join the sandbox, then ask away.
        </span>
      </span>
    </a>
  );
}
