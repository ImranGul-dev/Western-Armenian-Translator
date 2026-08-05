import { SiteFrame } from "@/components/SiteFrame";
import { Translator } from "@/components/Translator";

export default function Home() {
  return (
    <SiteFrame>
      <section className="intro-section" aria-labelledby="page-heading">
        <div className="intro-copy">
          <p className="eyebrow">Western Armenian translation</p>
          <h1 id="page-heading">Translate clearly. Keep the Western Armenian voice.</h1>
          <p>Translate between English, Western Armenian and Eastern Armenian.</p>
        </div>
        <div className="language-pills">
          <span>English → Western Armenian</span>
          <span>Western Armenian → English</span>
          <span>Eastern Armenian → Western Armenian</span>
        </div>
      </section>
      <Translator />
    </SiteFrame>
  );
}
