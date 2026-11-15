type BrandLogoProps = {
  className?: string;
  compactOnMobile?: boolean;
};

// Plain <img>: the logo is a static, pre-sized asset (no optimizer runs on
// this host), and next/image would add ~44 KB of client JS to every page.
/* eslint-disable @next/next/no-img-element */
export function BrandLogo({ className = "", compactOnMobile = false }: BrandLogoProps) {
  return (
    <span className={`checkflow-brand-logo${compactOnMobile ? " compact-on-mobile" : ""}${className ? ` ${className}` : ""}`}>
      <img
        className="checkflow-brand-logo-wide"
        src="/brand/checkflow-logo-horizontal-720.png"
        alt="CheckFlow"
        width={720}
        height={215}
        decoding="async"
        fetchPriority="high"
      />
      {compactOnMobile && (
        <img
          className="checkflow-brand-logo-symbol"
          src="/brand/checkflow-symbol-96.png"
          alt=""
          width={96}
          height={101}
          aria-hidden="true"
          decoding="async"
          loading="lazy"
        />
      )}
    </span>
  );
}
