const bar = (n: number) => <span className="sk">{"░".repeat(n)}</span>;

const ART = ["   " + "▒".repeat(22), "  " + "░".repeat(24), " " + "▒".repeat(24), " " + "░".repeat(24), " " + "▒".repeat(24), " " + "░".repeat(24)];

export function SkeletonCard({ kind }: { kind: "machine" | "deployment" }) {
  return (
    <article className="card skel" aria-hidden="true">
      <div className="fr fr-top">
        <span className="c">╭─</span>
        <span className="ttl">{bar(8)}</span>
        <span className="fill" />
        <span className="st">{bar(7)}</span>
        <span className="c">─╮</span>
      </div>
      <div className="fr-body">
        {kind === "machine" ? (
          <div className="art-wrap">
            <pre className="art">
              <span className="sk">{ART.join("\n")}</span>
            </pre>
          </div>
        ) : (
          <div className="d-head">
            <div className="topo-wrap art-wrap" style={{ margin: 0, height: 84 }}>
              <pre className="topo">
                <span className="sk">{"  ◉  \n┌─┼─┐\n○ ○ ○"}</span>
              </pre>
            </div>
            <div className="d-id">
              <div className="d-name">{bar(6)}</div>
              <div className="ep">{bar(24)}</div>
            </div>
          </div>
        )}
        <div className="sk-lines">
          <div>{bar(5)} {bar(16)}</div>
          <div>{bar(5)} {bar(22)}</div>
          <div>{bar(5)} {bar(12)}</div>
        </div>
        <div className="foot-row">
          {bar(6)}
          <span className="hint" />
          {bar(9)}
        </div>
      </div>
      <div className="fr fr-bot">
        <span className="c">╰─</span>
        <span className="fill" />
        <span className="c">─╯</span>
      </div>
    </article>
  );
}

export function SkeletonGrid({ kind, count }: { kind: "machine" | "deployment"; count: number }) {
  return Array.from({ length: count }, (_, i) => <SkeletonCard key={i} kind={kind} />);
}
