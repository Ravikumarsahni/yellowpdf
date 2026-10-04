"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone, Copy, Check, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/format";
import { toast } from "sonner";

/** Donation UPI Virtual Payment Address (India-only UPI rails). */
export const DONATION_UPI_ID = "9354288574@upi";
const DONATION_PAYEE_NAME = "YellowPDF";
const DONATION_NOTE = "Donation to YellowPDF";

/** Amount presets in INR. */
const AMOUNT_PRESETS = [50, 100, 250, 500];

/**
 * Builds a UPI deep-link that opens the user's preferred UPI app
 * (GPay / PhonePe / Paytm / BHIM / etc.) on Android & iOS with the
 * payee + amount + note pre-filled.
 *
 * Spec: https://www.npci.org.in/PDF/NPCI/UPI-documents/UPI-Linking-Specs-ver-1.0.pdf
 */
export function buildUpiLink(amount?: number): string {
  const params = new URLSearchParams({
    pa: DONATION_UPI_ID,
    pn: DONATION_PAYEE_NAME,
    cu: "INR",
    tn: DONATION_NOTE,
  });
  if (amount && amount > 0) params.set("am", String(amount));
  return `upi://pay?${params.toString()}`;
}

/**
 * Reusable UPI donation block — amount picker, scannable QR, copy-UPI-ID
 * button, and a "Pay via UPI" deep-link button. Used in the Feedback page
 * Donate CTA and the About page Sponsor & donate section.
 */
export function UpiDonate({ defaultAmount = 100 }: { defaultAmount?: number }) {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [customTouched, setCustomTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrSrc, setQrSrc] = useState<string>("");

  // Effective amount: custom (if entered and valid) overrides presets.
  const customNum = Number(customAmount);
  const effectiveAmount =
    customTouched && !Number.isNaN(customNum) && customNum > 0
      ? Math.round(customNum)
      : amount;

  const upiLink = buildUpiLink(effectiveAmount);

  // Generate QR src (uses a free public QR service; debounced so rapid
  // amount changes don't thrash the network).
  useEffect(() => {
    const t = setTimeout(() => {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(
        upiLink
      )}`;
      setQrSrc(url);
    }, 120);
    return () => clearTimeout(t);
  }, [upiLink]);

  // Cleanup any pending copy-feedback timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopyUpi = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(DONATION_UPI_ID);
      } else {
        // Fallback for older browsers / non-secure contexts.
        const ta = document.createElement("textarea");
        ta.value = DONATION_UPI_ID;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("UPI ID copied");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn’t copy — long-press the UPI ID to copy manually");
    }
  };

  return (
    <div className="rounded-xl bg-card/85 border border-border p-5 text-left">
      <div className="flex items-center gap-2 mb-3 justify-center">
        <Smartphone className="h-4 w-4 text-primary" />
        <p className="font-semibold text-sm">
          Pay via UPI
          <span className="ml-1.5 text-[10px] font-medium text-muted-foreground align-middle">
            (GPay · PhonePe · Paytm · BHIM)
          </span>
        </p>
      </div>

      {/* Amount picker */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2 text-center">
          Choose an amount
        </p>
        <div className="grid grid-cols-4 gap-2">
          {AMOUNT_PRESETS.map((amt) => {
            const active = !customTouched && amount === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setAmount(amt);
                  setCustomTouched(false);
                  setCustomAmount("");
                }}
                aria-pressed={active}
                aria-label={`Donate ₹${amt}`}
                className={cn(
                  "py-2 rounded-lg border text-sm font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/50 hover:bg-accent/40"
                )}
              >
                ₹{amt}
              </button>
            );
          })}
        </div>

        {/* Custom amount */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Or custom:</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              ₹
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setCustomTouched(true);
              }}
              onBlur={() => {
                if (!customAmount.trim()) setCustomTouched(false);
              }}
              placeholder="Enter amount"
              aria-label="Custom donation amount in INR"
              className="pl-7"
            />
          </div>
        </div>
      </div>

      {/* QR + UPI ID + pay button */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
        {/* QR */}
        <div className="mx-auto">
          <button
            type="button"
            onClick={() => setShowQr((s) => !s)}
            className="block group focus:outline-none"
            aria-label={
              showQr ? "Hide QR code" : "Show QR code to scan with your phone"
            }
            title="Click to toggle QR code"
          >
            {showQr && qrSrc ? (
              <img
                src={qrSrc}
                alt={`UPI QR for ₹${effectiveAmount} to ${DONATION_UPI_ID}`}
                width={180}
                height={180}
                className="block bg-white p-2 rounded-lg border border-border"
                loading="lazy"
              />
            ) : (
              <div className="w-[180px] h-[180px] grid place-items-center bg-white p-2 rounded-lg border border-border group-hover:border-primary/50 transition-colors">
                <div className="text-center">
                  <QrCode className="h-10 w-10 text-muted-foreground/60 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground px-2">
                    Click to show QR
                  </p>
                </div>
              </div>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">
            Scan with any UPI app
          </p>
        </div>

        {/* UPI ID + pay button */}
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Our UPI ID</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono font-semibold flex-1 break-all">
                {DONATION_UPI_ID}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyUpi}
                aria-label="Copy UPI ID"
                title="Copy UPI ID"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <a
            href={upiLink}
            className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            aria-label={`Pay ₹${effectiveAmount} via UPI`}
          >
            <Smartphone className="h-4 w-4" />
            Pay ₹{effectiveAmount} via UPI
          </a>

          <p className="text-[11px] text-muted-foreground text-center">
            On mobile, this opens your UPI app with the amount pre-filled.
            On desktop, scan the QR with your phone camera.
          </p>
        </div>
      </div>
    </div>
  );
}
