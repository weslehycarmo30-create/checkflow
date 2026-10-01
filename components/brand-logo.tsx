import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  compactOnMobile?: boolean;
};

export function BrandLogo({ className = "", compactOnMobile = false }: BrandLogoProps) {
  return (
    <span className={`checkflow-brand-logo${compactOnMobile ? " compact-on-mobile" : ""}${className ? ` ${className}` : ""}`}>
      <Image
        className="checkflow-brand-logo-wide"
        src="/brand/checkflow-logo-horizontal.png"
        alt="CheckFlow"
        width={1370}
        height={410}
        priority
        unoptimized
      />
      {compactOnMobile && (
        <Image
          className="checkflow-brand-logo-symbol"
          src="/brand/checkflow-symbol.png"
          alt=""
          width={390}
          height={410}
          aria-hidden="true"
          unoptimized
        />
      )}
    </span>
  );
}
