import { SiteHeader } from "@/components/flowchat/site-header";
import { Hero } from "@/components/flowchat/hero";
import { ProblemSection } from "@/components/flowchat/problem-section";
import { HowItWorks } from "@/components/flowchat/how-it-works";
import { ExamplesSection } from "@/components/flowchat/examples-section";
import { PricingSection } from "@/components/flowchat/pricing-section";
import { FinalCta } from "@/components/flowchat/final-cta";
import { SiteFooter } from "@/components/flowchat/site-footer";

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <ExamplesSection />
        <PricingSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
