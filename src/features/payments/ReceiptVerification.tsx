import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Ban,
  CircleAlert,
  LoaderCircle,
  ReceiptText,
} from "lucide-react";
import { getPublicReceiptVerification } from "../../lib/cloudPayments";
import {
  isReceiptVerificationToken,
  type PublicReceiptVerification,
} from "../../lib/receiptVerification";
import { formatDate } from "../../lib/dates";
import "./payments.css";

type VerificationState =
  | { status: "checking" }
  | { status: "valid"; receipt: PublicReceiptVerification }
  | { status: "revoked"; receipt: PublicReceiptVerification }
  | { status: "missing" }
  | { status: "error" };

interface ReceiptVerificationScreenProps {
  token: string;
  loadVerification?: (
    token: string,
  ) => Promise<PublicReceiptVerification | null>;
}

function formatReceiptAmount(receipt: PublicReceiptVerification): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: receipt.currency,
      maximumFractionDigits: 2,
    }).format(receipt.amount);
  } catch {
    return `${receipt.amount.toLocaleString()} ${receipt.currency}`;
  }
}

export function ReceiptVerificationScreen({
  token,
  loadVerification = getPublicReceiptVerification,
}: ReceiptVerificationScreenProps) {
  const [state, setState] = useState<VerificationState>({ status: "checking" });

  useEffect(() => {
    let active = true;
    if (!isReceiptVerificationToken(token)) {
      setState({ status: "missing" });
      return () => {
        active = false;
      };
    }

    setState({ status: "checking" });
    loadVerification(token)
      .then(receipt => {
        if (!active) return;
        if (!receipt) setState({ status: "missing" });
        else if (receipt.status === "revoked") {
          setState({ status: "revoked", receipt });
        } else {
          setState({ status: "valid", receipt });
        }
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [loadVerification, token]);

  const receipt =
    state.status === "valid" || state.status === "revoked"
      ? state.receipt
      : null;
  const Icon =
    state.status === "valid"
      ? BadgeCheck
      : state.status === "revoked"
        ? Ban
        : state.status === "checking"
          ? LoaderCircle
          : CircleAlert;

  return (
    <main className="receipt-verification-page">
      <section
        className={`receipt-verification-card is-${state.status}`}
        aria-live="polite"
      >
        <div className="receipt-verification-mark">
          <Icon
            className={state.status === "checking" ? "is-spinning" : undefined}
            size={32}
            aria-hidden="true"
          />
        </div>
        <p className="receipt-verification-brand">
          <ReceiptText size={16} aria-hidden="true" /> Hamad CFA Mastery Path
        </p>

        {state.status === "checking" ? (
          <>
            <h1>Checking receipt</h1>
            <p>The official receipt ledger is being queried.</p>
          </>
        ) : state.status === "valid" && receipt ? (
          <>
            <h1>Receipt verified</h1>
            <p>
              This receipt was found as an active record in the official receipt
              ledger.
            </p>
          </>
        ) : state.status === "revoked" && receipt ? (
          <>
            <h1>Receipt revoked</h1>
            <p>
              This reference exists, but the issuing tutor has revoked it. Do
              not rely on the printed copy as current proof of payment.
            </p>
          </>
        ) : state.status === "error" ? (
          <>
            <h1>Verification unavailable</h1>
            <p>
              The ledger could not be reached. No authenticity decision has
              been made; check the connection and try again.
            </p>
          </>
        ) : (
          <>
            <h1>Receipt not verified</h1>
            <p>
              No active ledger record matches this link. Confirm that the full
              QR address was opened or contact the issuing tutor.
            </p>
          </>
        )}

        {receipt ? (
          <dl className="receipt-verification-facts">
            <div>
              <dt>Reference</dt>
              <dd>{receipt.reference}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{receipt.status === "active" ? "Active" : "Revoked"}</dd>
            </div>
            <div>
              <dt>Candidate</dt>
              <dd>{receipt.studentName}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatReceiptAmount(receipt)}</dd>
            </div>
            <div>
              <dt>Payment date</dt>
              <dd>
                {formatDate(receipt.paymentDate, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </dd>
            </div>
            <div>
              <dt>Issued by</dt>
              <dd>{receipt.tutorName}</dd>
            </div>
          </dl>
        ) : null}

        <small className="receipt-verification-note">
          Verification confirms that the displayed facts match an official
          Firestore ledger record. It is not a claim of a standalone digital
          signature.
        </small>
      </section>
    </main>
  );
}
