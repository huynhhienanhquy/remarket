import { BENEFITS } from "../../data/authBenefits";
import { Link, Outlet, useSearchParams } from "react-router-dom";
import { Logo } from "../../components/Logo/Logo";

/**
 * AuthShell: desktop split 45/55 on brand-soft (ui-spec 3.3). The illustration
 * column is static copy — no invented user counts or testimonials.
 */
export function AuthShell() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo");
  const homeLink =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/";

  return (
    <div className="min-h-screen bg-page">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[45fr_55fr]">
        {/* Illustration column (desktop only) */}
        <aside className="hidden bg-brand-soft px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
          <Logo />
          <div className="max-w-md space-y-6">
            <p className="t-hero text-brand">Món đồ cũ. Giá trị mới.</p>
            <ul className="space-y-3">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex gap-3 t-body text-ink">
                  <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <p className="t-meta text-muted">ReMarket — nền tảng trao đổi đồ đã qua sử dụng.</p>
        </aside>

        {/* Form column */}
        <div className="flex flex-col px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <main className="mx-auto w-full max-w-[420px] flex-1">
            <Outlet />
          </main>
          <div className="mx-auto mt-10 w-full max-w-[420px]">
            <Link
              to={homeLink}
              className="inline-flex t-label text-brand hover:underline"
            >
              ← Quay lại khám phá
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
