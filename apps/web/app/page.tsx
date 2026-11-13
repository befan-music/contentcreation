import Link from "next/link";
import { formatTime } from "@stages/project";
import { listProjects } from "@/lib/server/store";
import { NewVideoButton } from "@/components/NewVideoButton";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default function Home() {
  const projects = listProjects();
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.mark} aria-hidden />
          Stages
        </div>
        <span className="chip">Local mode</span>
      </header>

      <section className={styles.hero}>
        <h1>Play your photos like an instrument.</h1>
        <p className="muted">Bring a song and a few photos. Pick a Stage. The music makes the edit.</p>
        <NewVideoButton />
      </section>

      <section>
        <h2 className={styles.h2}>Your videos</h2>
        {projects.length === 0 ? (
          <p className="muted">No videos yet.</p>
        ) : (
          <ul className={styles.grid}>
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}`} className={`card ${styles.tile}`}>
                  <div className={styles.thumb}>
                    {p.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${p.photos[0].src}?w=320`} alt="" />
                    ) : (
                      <span className={styles.placeholder}>♪</span>
                    )}
                  </div>
                  <div className={styles.meta}>
                    <strong>{p.name}</strong>
                    <span className="muted">
                      {p.photos.length} photos{p.clip ? ` · ${formatTime(p.clip.end - p.clip.start)}` : ""} · {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
