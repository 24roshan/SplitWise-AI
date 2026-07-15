const YOUR_NAME = "Roshan Jha";
const GITHUB_URL = "https://github.com/24roshan";
const LINKEDIN_URL = "https://www.linkedin.com/in/roshan-jha-a32647247/";

export default function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink/70">
        <p>
          Built by <span className="font-medium text-ink">{YOUR_NAME}</span>
        </p>
        <div className="flex gap-5">
          <a
            href={GITHUB_URL}
            className="hover:text-clay underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href={LINKEDIN_URL}
            className="hover:text-clay underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
}
